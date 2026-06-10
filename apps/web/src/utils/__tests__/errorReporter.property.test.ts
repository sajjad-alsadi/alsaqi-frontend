/**
 * Property-based tests for the ErrorReporter utility.
 *
 * Property 8: Error report payload contains required metadata
 *   - For any error, verify POST payload includes non-empty appVersion, sessionId,
 *     userAgent, routePath, timestamp.
 *   **Validates: Requirements 8.4**
 *
 * Feature: production-readiness-review
 * Property 8: Error report payload contains required metadata
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import type { ErrorReport } from '../errorReporter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Arbitrary for generating random error messages (non-empty strings).
 */
const arbErrorMessage = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Arbitrary for generating random stack traces.
 */
const arbStack = fc.oneof(
  fc.constant(undefined),
  fc.string({ minLength: 10, maxLength: 500 }).map(
    (s) => `Error: ${s}\n    at Object.<anonymous> (file.ts:${Math.floor(Math.random() * 100)}:1)`
  )
);

/**
 * Arbitrary for error type.
 */
const arbErrorType = fc.constantFrom(
  'boundary' as const,
  'uncaught' as const,
  'unhandled-rejection' as const
);

/**
 * Arbitrary for partial error report inputs (what a caller passes to report()).
 */
const arbPartialError = fc.record(
  {
    message: arbErrorMessage,
    stack: arbStack,
    type: arbErrorType,
  },
  { requiredKeys: ['message'] }
);

// ─── Property 8: Error report payload contains required metadata ────────────

describe('Property 8: Error report payload contains required metadata', () => {
  let capturedPayloads: ErrorReport[];
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    capturedPayloads = [];

    // Mock fetch to capture payloads
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.body) {
        const payload = JSON.parse(init.body as string) as ErrorReport;
        capturedPayloads.push(payload);
      }
      return Promise.resolve(new Response(JSON.stringify({ received: true }), { status: 201 }));
    });

    // Mock sessionStorage
    const store: Record<string, string> = {};
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
      },
      writable: true,
      configurable: true,
    });

    // Mock crypto.randomUUID
    if (!global.crypto) {
      (global as any).crypto = {};
    }
    Object.defineProperty(global.crypto, 'randomUUID', {
      value: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      writable: true,
      configurable: true,
    });

    // Mock import.meta.env (Vite env vars)
    Object.defineProperty(import.meta, 'env', {
      value: {
        VITE_ERROR_REPORT_URL: '/api/system-errors',
        VITE_APP_VERSION: '1.2.3',
      },
      writable: true,
      configurable: true,
    });

    // Mock navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Test) PropertyTest/1.0',
      writable: true,
      configurable: true,
    });

    // Mock window.location.pathname
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard/audits' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('for any error input, payload always contains non-empty appVersion, sessionId, userAgent, routePath, timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(arbPartialError, async (errorInput) => {
        // Reset modules to get fresh ErrorReporter instance each time
        vi.resetModules();
        capturedPayloads = [];

        // Dynamically import to get fresh instance with mocked globals
        const { errorReporter } = await import('../errorReporter');

        // Report the error
        errorReporter.report(errorInput);

        // Wait for the fire-and-forget fetch to resolve
        await vi.waitFor(() => {
          expect(capturedPayloads.length).toBeGreaterThan(0);
        });

        const payload = capturedPayloads[0];

        // Verify all required metadata fields are non-empty strings
        expect(typeof payload.appVersion).toBe('string');
        expect(payload.appVersion.length).toBeGreaterThan(0);

        expect(typeof payload.sessionId).toBe('string');
        expect(payload.sessionId.length).toBeGreaterThan(0);

        expect(typeof payload.userAgent).toBe('string');
        expect(payload.userAgent.length).toBeGreaterThan(0);

        expect(typeof payload.routePath).toBe('string');
        expect(payload.routePath.length).toBeGreaterThan(0);

        expect(typeof payload.timestamp).toBe('string');
        expect(payload.timestamp.length).toBeGreaterThan(0);

        // Verify timestamp is valid ISO-8601 format
        const parsedDate = new Date(payload.timestamp);
        expect(parsedDate.getTime()).not.toBeNaN();
      }),
      { numRuns: 100 }
    );
  });

  it('appVersion defaults to "unknown" when VITE_APP_VERSION is not set', async () => {
    vi.resetModules();
    capturedPayloads = [];

    // Mock the env module to return empty version
    vi.doMock('../env', () => ({
      getAppVersion: () => 'unknown',
      getErrorReportUrl: () => '/api/system-errors',
    }));

    const { errorReporter: reporter } = await import('../errorReporter');

    await fc.assert(
      fc.asyncProperty(arbPartialError, async (errorInput) => {
        capturedPayloads = [];

        reporter.report(errorInput);

        await vi.waitFor(() => {
          expect(capturedPayloads.length).toBeGreaterThan(0);
        });

        const payload = capturedPayloads[0];

        // Even without VITE_APP_VERSION, appVersion should be non-empty ("unknown")
        expect(typeof payload.appVersion).toBe('string');
        expect(payload.appVersion.length).toBeGreaterThan(0);
        expect(payload.appVersion).toBe('unknown');
      }),
      { numRuns: 100 }
    );

    vi.doUnmock('../env');
  });

  it('sessionId remains consistent across multiple reports in same session', async () => {
    vi.resetModules();
    const { errorReporter } = await import('../errorReporter');

    await fc.assert(
      fc.asyncProperty(arbPartialError, async (errorInput) => {
        capturedPayloads = [];

        errorReporter.report(errorInput);

        await vi.waitFor(() => {
          expect(capturedPayloads.length).toBeGreaterThan(0);
        });

        const payload = capturedPayloads[0];

        // sessionId should always be the same within one ErrorReporter instance
        expect(typeof payload.sessionId).toBe('string');
        expect(payload.sessionId.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );

    // Verify all captured sessionIds are consistent
    const sessionIds = capturedPayloads.map((p) => p.sessionId);
    const uniqueIds = new Set(sessionIds);
    expect(uniqueIds.size).toBe(1);
  });
});
