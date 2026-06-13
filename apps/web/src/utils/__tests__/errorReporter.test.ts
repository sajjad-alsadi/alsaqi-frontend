/**
 * Unit tests for the ErrorReporter authenticated-delivery behavior.
 *
 * Covers Requirement 20 (Authenticated Error Reporting):
 *  - 20.1 The Error_Reporter includes session credentials with the request
 *         (`credentials: 'include'`).
 *  - 20.2 Where the endpoint requires CSRF protection, the Error_Reporter
 *         includes the CSRF token (`x-csrf-token` header read from the
 *         `csrf-token` cookie).
 *  - 20.3 If a report fails to send, the Error_Reporter surfaces the delivery
 *         failure to a diagnostic channel (`console.error`) after retries are
 *         exhausted.
 *
 * Feature: frontend-audit-remediation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ErrorReport } from '../errorReporter';

// ─── Shared environment setup ───────────────────────────────────────────────

/**
 * Install the browser-ish globals the ErrorReporter constructor and sendReport
 * depend on (sessionStorage, crypto.randomUUID, navigator, location, env).
 * Keeps each freshly-imported singleton deterministic.
 */
function installGlobals(): void {
  const store: Record<string, string> = {};
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    },
    writable: true,
    configurable: true,
  });

  if (!global.crypto) {
    (global as unknown as { crypto: Crypto }).crypto = {} as Crypto;
  }
  Object.defineProperty(global.crypto, 'randomUUID', {
    value: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    writable: true,
    configurable: true,
  });

  Object.defineProperty(import.meta, 'env', {
    value: {
      VITE_ERROR_REPORT_URL: '/api/system-errors',
      VITE_APP_VERSION: '1.2.3',
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Test) UnitTest/1.0',
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, 'location', {
    value: { pathname: '/dashboard' },
    writable: true,
    configurable: true,
  });
}

/** Remove the csrf-token cookie so cookie state does not leak across tests. */
function clearCsrfCookie(): void {
  document.cookie = 'csrf-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

const sampleError: Partial<ErrorReport> = {
  module: 'audit-plan',
  message: 'Something broke',
  severity: 'high',
  type: 'boundary',
};

// ─── Requirement 20.1 / 20.2: credentialed + CSRF header ─────────────────────

describe('ErrorReporter authenticated delivery (Req 20.1, 20.2)', () => {
  let fetchCalls: Array<{ url: string; init: RequestInit }>;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    installGlobals();
    clearCsrfCookie();
    fetchCalls = [];
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init: init ?? {} });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearCsrfCookie();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sends the report with credentials: "include" (Req 20.1)', async () => {
    vi.resetModules();
    const { errorReporter } = await import('../errorReporter');

    errorReporter.report(sampleError);

    await vi.waitFor(() => {
      expect(fetchCalls.length).toBeGreaterThan(0);
    });

    const { init } = fetchCalls[0];
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('includes the x-csrf-token header when the csrf-token cookie is set (Req 20.2)', async () => {
    document.cookie = 'csrf-token=tok-12345; path=/';

    vi.resetModules();
    const { errorReporter } = await import('../errorReporter');

    errorReporter.report(sampleError);

    await vi.waitFor(() => {
      expect(fetchCalls.length).toBeGreaterThan(0);
    });

    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('tok-12345');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('omits the x-csrf-token header when no csrf-token cookie is present (Req 20.2)', async () => {
    // No cookie set in this test.
    vi.resetModules();
    const { errorReporter } = await import('../errorReporter');

    errorReporter.report(sampleError);

    await vi.waitFor(() => {
      expect(fetchCalls.length).toBeGreaterThan(0);
    });

    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBeUndefined();
  });
});

// ─── Requirement 20.3: delivery failure surfaced to diagnostics ──────────────

describe('ErrorReporter delivery-failure diagnostics (Req 20.3)', () => {
  let originalFetch: typeof global.fetch;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installGlobals();
    clearCsrfCookie();
    vi.useFakeTimers();
    originalFetch = global.fetch;
    // Always reject so the report can never be delivered.
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    clearCsrfCookie();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('surfaces the failure to console.error after retries are exhausted (Req 20.3)', async () => {
    vi.resetModules();
    const { errorReporter } = await import('../errorReporter');

    errorReporter.report(sampleError);

    // Drive the immediate attempt + 3 backoff retries (1s, 2s, 4s) to exhaustion.
    // advanceTimersByTimeAsync also flushes the fire-and-forget promise chains.
    await vi.advanceTimersByTimeAsync(10000);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const [message] = consoleErrorSpy.mock.calls[0];
    expect(String(message)).toContain('Failed to deliver error report');
  });

  it('does not surface to diagnostics while retries remain (Req 20.3)', async () => {
    vi.resetModules();
    const { errorReporter } = await import('../errorReporter');

    errorReporter.report(sampleError);

    // Only enough time for the first scheduled retry, not full exhaustion.
    await vi.advanceTimersByTimeAsync(1500);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
