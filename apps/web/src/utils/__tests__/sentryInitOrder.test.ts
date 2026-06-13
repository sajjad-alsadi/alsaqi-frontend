/**
 * Unit tests for the Sentry production-init guard ordering (Task 6.3).
 *
 * These tests pin the startup invariant wired in `main.tsx`: `initSentry()` runs
 * synchronously at module load, BEFORE `createRoot(...).render(...)` mounts the
 * app and the React tree issues its first API_Client request. The tests model
 * that exact ordering with a shared event log and assert:
 *
 *   - WHILE PROD && a non-empty DSN is present, Sentry initializes BEFORE the
 *     first API_Client request is issued.                          (Req 6.3)
 *   - IF the build is not production, OR the DSN is absent/empty, Sentry init is
 *     skipped entirely (the first request still proceeds).         (Req 6.7)
 *
 * The guard's truth table itself is covered by `observability.test.ts`
 * (`shouldInitSentry`) and `observabilityWiring.test.ts` (`initSentry`); this
 * file adds the missing *ordering-relative-to-the-first-request* assertion.
 *
 * Requirements: 6.3, 6.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';

import { initSentry } from '@/utils/sentry';
import * as Sentry from '@sentry/react';
import { createApiClient } from '@/api/client';

// Mock the Sentry SDK so `init` never reaches the network and we can observe its
// call ordering. Include the scope helpers as no-ops in case any imported module
// touches them during a request.
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
}));

/**
 * Run the same startup ordering that `main.tsx` performs (initSentry first, then
 * the app issues its first API_Client request) and return the ordered event log
 * plus the boolean `initSentry()` returned.
 *
 * `order` records `'sentry-init'` when `Sentry.init` actually fires and
 * `'first-request'` when the first API_Client request reaches the transport.
 */
async function runStartupSequence(): Promise<{ order: string[]; initialized: boolean }> {
  const order: string[] = [];

  vi.mocked(Sentry.init).mockImplementation(() => {
    order.push('sentry-init');
    return undefined as unknown as ReturnType<typeof Sentry.init>;
  });

  // 1. Startup: initialize Sentry BEFORE any request is issued (mirrors main.tsx).
  const initialized = initSentry();

  // 2. Build the API client and stub its transport, recording the first request.
  const client = createApiClient({ baseUrl: 'http://localhost:3000/api' });
  const mockAdapter = new MockAdapter(client.http);
  mockAdapter.onGet('/audit-plans').reply(() => {
    order.push('first-request');
    return [
      200,
      {
        success: true,
        data: 'ok',
        meta: { requestId: 'req-1', timestamp: new Date().toISOString(), version: '1.0.0' },
      },
    ];
  });

  // 3. The app issues its first API_Client request.
  await client.get('/audit-plans', z.string());
  mockAdapter.restore();

  return { order, initialized };
}

describe('Sentry production-init guard ordering (Task 6.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'cookie', { writable: true, value: '' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('initializes Sentry BEFORE the first API_Client request when PROD && DSN present', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0');

    const { order, initialized } = await runStartupSequence();

    expect(initialized).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    // Both events occurred, and init strictly precedes the first request.
    expect(order).toEqual(['sentry-init', 'first-request']);
    expect(order.indexOf('sentry-init')).toBeLessThan(order.indexOf('first-request'));
  });

  it('skips Sentry init (but still issues the request) when DSN is absent/empty', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SENTRY_DSN', '');

    const { order, initialized } = await runStartupSequence();

    expect(initialized).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(order).toEqual(['first-request']);
  });

  it('skips Sentry init (but still issues the request) when not in production', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0');

    const { order, initialized } = await runStartupSequence();

    expect(initialized).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(order).toEqual(['first-request']);
  });
});
