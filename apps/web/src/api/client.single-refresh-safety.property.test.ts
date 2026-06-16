/**
 * Property-based tests for the API client's single-refresh safety guarantee.
 *
 * Feature: code-review-remediation, Property 8: Single-refresh safety with no
 * infinite loop.
 *
 * For any sequence of requests where the first response is 401 and
 * `/auth/refresh` succeeds, the original request is retried exactly once,
 * exactly one refresh occurs per 401 wave, and the post-refresh retry marker
 * (`__isRetryAfterRefresh`) prevents re-entering the refresh branch even if the
 * retried request also returns 401.
 *
 * **Validates: Requirements 9.2, 9.3**
 *
 * Strategy: generate random sequences of requests with an injected 401 on the
 * first response, exercise the real `createApiClient` through an
 * axios-mock-adapter, and assert:
 *  - exactly one `/auth/refresh` round-trip per triggering 401 wave,
 *  - the original request is retried exactly once (each endpoint is hit exactly
 *    twice: the initial 401 plus a single retry), and
 *  - the `__isRetryAfterRefresh` marker caps a persistently-401 request at a
 *    single retry / single refresh — there is never a second refresh or an
 *    unbounded loop.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';
import fc from 'fast-check';
import { createApiClient, type ApiClientConfig } from './client';

const REFRESH_URL = '/auth/refresh';

const responseSchema = z.object({ ok: z.boolean() });

function successEnvelope() {
  return {
    success: true,
    data: { ok: true },
    meta: {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2024-01-01T00:00:00Z',
      version: '1.0.0',
    },
  };
}

describe('Property 8: Single-refresh safety with no infinite loop (Requirements 9.2, 9.3)', () => {
  let config: ApiClientConfig;

  beforeEach(() => {
    config = { baseUrl: 'http://localhost:3000/api', timeout: 5000, onUnauthorized: vi.fn() };
    Object.defineProperty(document, 'cookie', { writable: true, value: 'csrf-token=t' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries the original request exactly once after a single refresh per 401 wave', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (numRequests) => {
        // Refresh always succeeds; count how many times it is invoked.
        const refreshSpy = vi
          .spyOn(axios, 'post')
          .mockResolvedValue({ data: { success: true } } as never);

        const client = createApiClient(config);
        const mock = new MockAdapter(client.http);

        // Each endpoint returns 401 on its first hit (driving the refresh) and a
        // valid envelope on the post-refresh retry.
        const endpoints = Array.from({ length: numRequests }, (_, i) => `/wave${i}`);
        const callCounts: Record<string, number> = {};
        for (const url of endpoints) {
          callCounts[url] = 0;
          mock.onGet(url).reply(() => {
            callCounts[url] += 1;
            if (callCounts[url] === 1) return [401, { message: 'Unauthorized' }];
            return [200, successEnvelope()];
          });
        }

        try {
          // Issue requests sequentially so each 401 wave is independent.
          for (const url of endpoints) {
            const result = await client.get(url, responseSchema);
            expect(result).toEqual({ ok: true });
          }

          // The original request is retried exactly once: initial 401 + one retry.
          for (const url of endpoints) {
            expect(callCounts[url]).toBe(2);
          }

          // Exactly one /auth/refresh per 401 wave.
          expect(refreshSpy).toHaveBeenCalledTimes(numRequests);
          for (const call of refreshSpy.mock.calls) {
            expect(String(call[0])).toContain(REFRESH_URL);
          }
        } finally {
          mock.restore();
          refreshSpy.mockRestore();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('the post-refresh retry marker blocks re-entering refresh when the retry also returns 401', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (numRequests) => {
        const onUnauthorized = vi.fn();
        const refreshSpy = vi
          .spyOn(axios, 'post')
          .mockResolvedValue({ data: { success: true } } as never);

        const client = createApiClient({ ...config, onUnauthorized });
        const mock = new MockAdapter(client.http);

        // Persistent 401: every response (original AND retry) is 401.
        const endpoints = Array.from({ length: numRequests }, (_, i) => `/loop${i}`);
        const callCounts: Record<string, number> = {};
        for (const url of endpoints) {
          callCounts[url] = 0;
          mock.onGet(url).reply(() => {
            callCounts[url] += 1;
            return [401, { message: 'Unauthorized' }];
          });
        }

        try {
          for (const url of endpoints) {
            await expect(client.get(url, responseSchema)).rejects.toBeDefined();
          }

          // The __isRetryAfterRefresh marker caps each request at one retry:
          // exactly two hits per endpoint, never an unbounded loop.
          for (const url of endpoints) {
            expect(callCounts[url]).toBe(2);
          }

          // Exactly one refresh attempt per request — the marker blocks a second
          // refresh on the retried (still-401) request.
          expect(refreshSpy).toHaveBeenCalledTimes(numRequests);
        } finally {
          mock.restore();
          refreshSpy.mockRestore();
        }
      }),
      { numRuns: 100 }
    );
  });
});
