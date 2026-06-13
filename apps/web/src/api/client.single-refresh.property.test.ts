/**
 * Property-based tests for the API client's 401 → refresh → retry flow.
 *
 * Property 1: Single-refresh safety
 * For any sequence of requests where the first response is 401 and
 * `/auth/refresh` succeeds, the original request is retried exactly once and no
 * infinite refresh loop occurs (the `__isRetryAfterRefresh` guard holds).
 *
 * **Validates: Requirements 1.1**
 *
 * Strategy: generate random sequences of requests with an injected 401 on the
 * first response of each request, exercise the real `createApiClient` through an
 * axios-mock-adapter, and assert:
 *  - exactly one `/auth/refresh` round-trip per triggering 401 wave,
 *  - the original request is retried at most once (each endpoint is hit exactly
 *    twice: the initial 401 plus a single retry), and
 *  - the `__isRetryAfterRefresh` guard prevents a second refresh / infinite loop
 *    even when the retried request also returns 401.
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

describe('Property 1: Single-refresh safety (Requirements 1.1)', () => {
  let config: ApiClientConfig;

  beforeEach(() => {
    config = { baseUrl: 'http://localhost:3000/api', timeout: 5000, onUnauthorized: vi.fn() };
    Object.defineProperty(document, 'cookie', { writable: true, value: 'csrf-token=t' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues exactly one refresh and exactly one retry per 401 wave, then succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (numRequests) => {
        // Refresh always succeeds; count how many times it is invoked.
        const refreshSpy = vi
          .spyOn(axios, 'post')
          .mockResolvedValue({ data: { success: true } } as never);

        const client = createApiClient(config);
        const mock = new MockAdapter(client.http);

        // Per-endpoint call counts. Each endpoint returns 401 on its first hit
        // (driving the refresh) and a valid envelope on the retry.
        const endpoints = Array.from({ length: numRequests }, (_, i) => `/r${i}`);
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

          // Each endpoint hit exactly twice: initial 401 + single retry (no loop).
          for (const url of endpoints) {
            expect(callCounts[url]).toBe(2);
          }

          // Exactly one /auth/refresh per request wave (sequential, non-shared).
          expect(refreshSpy).toHaveBeenCalledTimes(numRequests);
          for (const call of refreshSpy.mock.calls) {
            expect(String(call[0])).toContain(REFRESH_URL);
          }
        } finally {
          mock.restore();
          refreshSpy.mockRestore();
        }
      }),
      { numRuns: 50 }
    );
  });

  it('refreshes at most once and never loops when the retried request also returns 401', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (numRequests) => {
        const onUnauthorized = vi.fn();
        const refreshSpy = vi
          .spyOn(axios, 'post')
          .mockResolvedValue({ data: { success: true } } as never);

        const client = createApiClient({ ...config, onUnauthorized });
        const mock = new MockAdapter(client.http);

        // Persistent 401: every response (original AND retry) is 401.
        const endpoints = Array.from({ length: numRequests }, (_, i) => `/p${i}`);
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

          // The __isRetryAfterRefresh guard caps each request at one retry:
          // exactly two hits per endpoint, never an unbounded loop.
          for (const url of endpoints) {
            expect(callCounts[url]).toBe(2);
          }

          // Exactly one refresh attempt per request — the guard blocks a second.
          expect(refreshSpy).toHaveBeenCalledTimes(numRequests);
        } finally {
          mock.restore();
          refreshSpy.mockRestore();
        }
      }),
      { numRuns: 50 }
    );
  });
});
