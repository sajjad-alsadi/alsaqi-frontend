/**
 * Unit tests for observability wiring (Area G).
 *
 * Asserts the four observability integration points are correctly wired:
 *  1. Sentry `init` is invoked at startup when production + DSN are present,
 *     and skipped otherwise (guarded startup).            — Req 7.1, 7.2
 *  2. A captured Web Vital is POSTed to `/api/metrics/web-vitals`. — Req 17.1
 *  3. A feature gate renders children only when the flag is enabled. — Req 15.2
 *  4. The log pipeline falls back to `/api/system-errors` in production. — Req 18.4
 *
 * Requirements: 7.1, 7.2, 17.1, 15.2, 18.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { initSentry } from '@/utils/sentry';
import * as Sentry from '@sentry/react';
import { WebVitalsReporter } from '@/utils/webVitalsReporter';
import { webVitalsMonitor, type WebVitalMetric } from '@/utils/webVitalsMonitor';
import { FeatureFlagProvider, FeatureGate } from '@/featureFlags';
import type { FeatureFlagConfig } from '@/featureFlags';

// Mock the Sentry SDK so `init` never reaches the network during tests.
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
}));

// ─── 1. Sentry init invoked at startup (mocked) — Req 7.1, 7.2 ──────────────────

describe('observability wiring — Sentry init at startup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('invokes Sentry.init when running in production with a DSN configured', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0');

    const result = initSentry();

    expect(result).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      }),
    );
  });

  it('does NOT invoke Sentry.init when the DSN is missing (guarded startup)', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SENTRY_DSN', '');

    const result = initSentry();

    expect(result).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('does NOT invoke Sentry.init outside production even when a DSN is present', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0');

    const result = initSentry();

    expect(result).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('returns false (without throwing) when Sentry.init throws for a malformed DSN', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SENTRY_DSN', 'not-a-valid-dsn');
    vi.mocked(Sentry.init).mockImplementationOnce(() => {
      throw new Error('Invalid Sentry Dsn');
    });

    const result = initSentry();

    expect(result).toBe(false);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });
});

// ─── 2. Web Vital POSTed to /api/metrics/web-vitals — Req 17.1 ──────────────────

/** Budget large enough to cover the reporter's idle/timeout deferral. */
const MAX_IDLE_FLUSH_MS = 100;

function createMetric(overrides?: Partial<WebVitalMetric>): WebVitalMetric {
  return {
    name: 'LCP',
    value: 2000,
    rating: 'good',
    route: '/dashboard',
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('observability wiring — Web Vitals reporting endpoint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('POSTs a captured Web Vital to /api/metrics/web-vitals', async () => {
    // Capture the callback the reporter registers with the monitor so we can
    // emit a metric without needing real PerformanceObserver entries.
    let capturedCallback: ((metric: WebVitalMetric) => void) | undefined;
    vi.spyOn(webVitalsMonitor, 'onMetric').mockImplementation((cb) => {
      capturedCallback = cb;
      return () => undefined;
    });

    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const reporter = new WebVitalsReporter({
      endpoint: '/api/metrics/web-vitals',
      intervalMs: 1_000_000, // keep the periodic timer out of the way
      fetchFn,
    });

    reporter.start();
    // Emit a metric through the captured subscription, then flush.
    capturedCallback?.(createMetric());
    reporter.flush();

    // Allow the deferred (idle/timeout) send + async POST to settle.
    await vi.advanceTimersByTimeAsync(MAX_IDLE_FLUSH_MS);

    expect(fetchFn).toHaveBeenCalledWith(
      '/api/metrics/web-vitals',
      expect.objectContaining({ method: 'POST' }),
    );

    reporter.destroy();
  });
});

// ─── 3. Feature gate renders children only when enabled — Req 15.2 ──────────────

function renderGate(config: FeatureFlagConfig) {
  return render(
    React.createElement(
      FeatureFlagProvider,
      { config },
      React.createElement(FeatureGate, { flag: 'beta-feature' }, 'gated-content'),
    ),
  );
}

describe('observability wiring — feature gate visibility', () => {
  it('renders children when the flag evaluates to enabled', () => {
    renderGate({ flags: { 'beta-feature': true }, defaults: {} });
    expect(screen.getByText('gated-content')).toBeInTheDocument();
  });

  it('does NOT render children when the flag is disabled', () => {
    renderGate({ flags: { 'beta-feature': false }, defaults: {} });
    expect(screen.queryByText('gated-content')).not.toBeInTheDocument();
  });

  it('does NOT render children when the flag is missing and the safe default is off', () => {
    renderGate({ flags: {}, defaults: { 'beta-feature': false } });
    expect(screen.queryByText('gated-content')).not.toBeInTheDocument();
  });
});

// ─── 4. Log pipeline falls back to /api/system-errors — Req 18.4 ────────────────

describe('observability wiring — log pipeline fallback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('forwards production error logs to /api/system-errors when no destination is configured', async () => {
    vi.stubEnv('MODE', 'production');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    // Re-import after stubbing MODE so the module evaluates as production.
    const { logger, configureLogForwarding } = await import('@/utils/logger');

    // No destination → the fallback path is used directly.
    configureLogForwarding({ destination: undefined, forwardWarn: false });

    logger.error('something failed', { module: 'Test' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/system-errors',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('falls back to /api/system-errors when the configured destination is unavailable', async () => {
    vi.stubEnv('MODE', 'production');
    const fetchMock = vi
      .fn()
      // First call (configured destination) fails…
      .mockRejectedValueOnce(new Error('destination unreachable'))
      // …then the fallback delivery succeeds.
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { logger, configureLogForwarding } = await import('@/utils/logger');

    configureLogForwarding({ destination: 'https://logs.example.com/ingest', forwardWarn: false });

    logger.error('something failed', { module: 'Test' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://logs.example.com/ingest',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/system-errors',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
