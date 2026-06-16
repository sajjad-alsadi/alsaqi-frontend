/**
 * Property-based tests for per-instance isolation of the API client's
 * token-refresh state.
 *
 * Feature: code-review-remediation, Property 7
 *
 * Property 7: Token-refresh state is isolated per client instance
 * For any set of two or more `Api_Client` instances, driving a 401-triggered
 * token refresh on one instance does not change the refresh-in-progress flag,
 * queued subscribers, or version-mismatch state of any other instance.
 *
 * **Validates: Requirements 9.1, 9.4**
 *
 * Refresh state (`isRefreshing`, `refreshSubscribers`) now lives inside the
 * `createApiClient` closure (one copy per instance), so the only observable way
 * to assert isolation is behavioral: drive a 401 → `/auth/refresh` → retry wave
 * on instance A and assert every other instance B still completes ordinary
 * requests unaffected — never blocked on A's in-flight refresh, never retried
 * because of A's `isRefreshing` flag, and never enrolled as a subscriber to A's
 * refresh queue.
 *
 * Strategy: a controllable "gate" holds A's `/auth/refresh` open so the refresh
 * is provably in-flight while B's requests run. B's endpoints reply 200
 * immediately; if B shared A's refresh state it would either block on the gate
 * or be retried. We assert B resolves before the gate opens and is hit exactly
 * once, and that exactly one refresh occurs across all instances (A's).
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

/** A promise plus its resolver, used to gate A's in-flight refresh. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Feature: code-review-remediation, Property 7: per-instance refresh isolation (Requirements 9.1, 9.4)', () => {
  let config: ApiClientConfig;

  beforeEach(() => {
    config = { baseUrl: 'http://localhost:3000/api', timeout: 5000, onUnauthorized: vi.fn() };
    Object.defineProperty(document, 'cookie', { writable: true, value: 'csrf-token=t' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets other instances complete normal requests while one instance is mid-refresh', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 4 }), async (numOthers) => {
        // Gate A's refresh so it is verifiably in-flight while B requests run.
        const gate = deferred();
        const refreshSpy = vi.spyOn(axios, 'post').mockImplementation(async () => {
          await gate.promise;
          return { data: { success: true } } as never;
        });

        // Instance A: 401 on first hit (drives the refresh), 200 on the retry.
        const clientA = createApiClient(config);
        const mockA = new MockAdapter(clientA.http);
        let aCount = 0;
        mockA.onGet('/a').reply(() => {
          aCount += 1;
          if (aCount === 1) return [401, { message: 'Unauthorized' }];
          return [200, successEnvelope()];
        });

        // Other instances B_i: each isolated, every request a clean 200.
        const others = Array.from({ length: numOthers }, () => {
          const client = createApiClient(config);
          const mock = new MockAdapter(client.http);
          const state = { count: 0 };
          mock.onGet('/b').reply(() => {
            state.count += 1;
            return [200, successEnvelope()];
          });
          return { client, mock, state };
        });

        try {
          // Kick off A's request; it 401s and parks on the gated refresh.
          const aPromise = clientA.get('/a', responseSchema);

          // Yield enough microtasks for A to reach the in-flight refresh.
          for (let i = 0; i < 5; i++) await Promise.resolve();

          // While A's refresh is still gated, B instances must complete fully.
          const otherResults = await Promise.all(
            others.map(({ client }) => client.get('/b', responseSchema))
          );

          // B completed without the gate opening: not blocked by A's refresh.
          otherResults.forEach((r) => expect(r).toEqual({ ok: true }));
          // B hit exactly once: A's `isRefreshing` did not force a B retry, and
          // B was never enrolled in A's refresh-subscriber queue.
          others.forEach(({ state }) => expect(state.count).toBe(1));

          // Now release A's refresh and let its single retry succeed.
          gate.resolve();
          const aResult = await aPromise;
          expect(aResult).toEqual({ ok: true });
          expect(aCount).toBe(2); // initial 401 + exactly one retry

          // Exactly one refresh across ALL instances — only A's. B instances
          // never triggered `/auth/refresh`.
          expect(refreshSpy).toHaveBeenCalledTimes(1);
          expect(String(refreshSpy.mock.calls[0]?.[0])).toContain(REFRESH_URL);
        } finally {
          gate.resolve();
          mockA.restore();
          others.forEach(({ mock }) => mock.restore());
          refreshSpy.mockRestore();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('keeps each instance refresh wave independent when several refresh concurrently', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (numInstances) => {
        // Every instance's refresh succeeds immediately and independently.
        const refreshSpy = vi
          .spyOn(axios, 'post')
          .mockResolvedValue({ data: { success: true } } as never);

        // Each instance gets its own endpoint that 401s once then returns 200,
        // so every instance independently drives exactly one refresh wave.
        const instances = Array.from({ length: numInstances }, (_, i) => {
          const client = createApiClient(config);
          const mock = new MockAdapter(client.http);
          const url = `/i${i}`;
          const state = { count: 0 };
          mock.onGet(url).reply(() => {
            state.count += 1;
            if (state.count === 1) return [401, { message: 'Unauthorized' }];
            return [200, successEnvelope()];
          });
          return { client, mock, url, state };
        });

        try {
          // Drive all instances concurrently; their closure-local refresh state
          // must not cross-contaminate.
          const results = await Promise.all(
            instances.map(({ client, url }) => client.get(url, responseSchema))
          );

          results.forEach((r) => expect(r).toEqual({ ok: true }));
          // Each instance: initial 401 + exactly one retry (no shared flag
          // suppressed or duplicated a refresh).
          instances.forEach(({ state }) => expect(state.count).toBe(2));
          // Exactly one refresh per instance — one per independent 401 wave.
          expect(refreshSpy).toHaveBeenCalledTimes(numInstances);
        } finally {
          instances.forEach(({ mock }) => mock.restore());
          refreshSpy.mockRestore();
        }
      }),
      { numRuns: 100 }
    );
  });
});
