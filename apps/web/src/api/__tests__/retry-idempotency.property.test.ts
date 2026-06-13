/**
 * Property-based tests for the single retry + idempotency layer in `client.ts`.
 *
 * These tests stub the Axios adapter (via axios-mock-adapter) to count network
 * attempts and capture the per-attempt `Idempotency-Key` / `x-correlation-id`
 * headers, then assert the four retry/idempotency correctness properties.
 *
 * The retry helper (`requestWithRetry`) applies exponential backoff via
 * `setTimeout`, so fake timers are installed and flushed with
 * `vi.runAllTimersAsync()` to drive the retry sequence without real delays.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import fc from 'fast-check';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';
import {
  createApiClient,
  MAX_RETRY_ATTEMPTS,
  type ApiClient,
  type ApiClientConfig,
  type MutationRequestConfig,
} from '../client';

// ─── Shared helpers ─────────────────────────────────────────────────────────

const CONFIG: ApiClientConfig = {
  baseUrl: 'http://localhost:3000/api',
  timeout: 5000,
};

/** A retriable 5xx status drives the full retry sequence (network/5xx == retriable). */
const arbRetriableStatus = fc.integer({ min: 500, max: 599 });

/** The four state-mutating HTTP methods. */
const arbMutationMethod = fc.constantFrom('post', 'put', 'patch', 'delete') as fc.Arbitrary<
  'post' | 'put' | 'patch' | 'delete'
>;

/** Every method the typed client exposes. */
const arbAnyMethod = fc.constantFrom('get', 'post', 'put', 'patch', 'delete') as fc.Arbitrary<
  'get' | 'post' | 'put' | 'patch' | 'delete'
>;

/**
 * Invoke a typed client method uniformly. POST/PUT/PATCH take a data argument;
 * GET/DELETE do not. `cfg` carries the optional `idempotent` flag for mutations.
 */
function invoke(
  client: ApiClient,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  schema: z.ZodTypeAny,
  cfg?: MutationRequestConfig
): Promise<unknown> {
  switch (method) {
    case 'get':
      return client.get(url, schema, cfg);
    case 'delete':
      return client.delete(url, schema, cfg);
    case 'post':
      return client.post(url, schema, { sample: 'payload' }, cfg);
    case 'put':
      return client.put(url, schema, { sample: 'payload' }, cfg);
    case 'patch':
      return client.patch(url, schema, { sample: 'payload' }, cfg);
  }
}

describe('Single retry + idempotency layer (client.ts)', () => {
  beforeEach(() => {
    // Fake timers so exponential backoff (1s, 2s, ...) does not delay tests.
    vi.useFakeTimers();
    // A CSRF cookie keeps the request interceptor on its normal path.
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf-token=test-csrf',
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  // ─── Property 1 ─────────────────────────────────────────────────────────
  // Feature: frontend-audit-remediation, Property 1: Stable identifiers across retries
  //
  // For any mutation request that is retried, the Idempotency-Key and the
  // x-correlation-id sent on the first attempt equal those sent on every
  // subsequent attempt.
  // Validates: Requirements 1.3, 1.4, 1.5
  describe('Property 1: Stable identifiers across retries', () => {
    it('reuses the same Idempotency-Key and x-correlation-id on every retry attempt', async () => {
      await fc.assert(
        fc.asyncProperty(arbMutationMethod, arbRetriableStatus, async (method, status) => {
          const client = createApiClient(CONFIG);
          const mock = new MockAdapter(client.http);

          const idempotencyKeys: Array<string | undefined> = [];
          const correlationIds: Array<string | undefined> = [];
          let attempts = 0;

          // Always fail with a retriable 5xx so the request uses its full retry budget.
          mock.onAny().reply((reqConfig) => {
            attempts += 1;
            idempotencyKeys.push(reqConfig.headers?.['Idempotency-Key'] as string | undefined);
            correlationIds.push(reqConfig.headers?.['x-correlation-id'] as string | undefined);
            return [status, { error: 'fail' }];
          });

          const outcome = invoke(client, method, '/mutate', z.unknown(), { idempotent: true }).then(
            () => 'resolved',
            () => 'rejected'
          );

          await vi.runAllTimersAsync();
          expect(await outcome).toBe('rejected');

          // The mutation was actually retried (more than one attempt).
          expect(attempts).toBeGreaterThan(1);
          expect(attempts).toBe(MAX_RETRY_ATTEMPTS);

          // A stable, defined Idempotency-Key was sent on every attempt.
          expect(idempotencyKeys).toHaveLength(attempts);
          expect(idempotencyKeys[0]).toBeDefined();
          expect(new Set(idempotencyKeys).size).toBe(1);

          // The correlation ID is preserved (identical) across all attempts.
          expect(correlationIds[0]).toBeDefined();
          expect(new Set(correlationIds).size).toBe(1);

          mock.restore();
        }),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property 2 ─────────────────────────────────────────────────────────
  // Feature: frontend-audit-remediation, Property 2: Mutations without an idempotency key are not retried
  //
  // For any request whose method is POST, PUT, PATCH, or DELETE and that carries
  // no Idempotency-Key, the client issues exactly one network attempt regardless
  // of how many retriable errors occur.
  // Validates: Requirements 1.2
  describe('Property 2: Mutations without an idempotency key are not retried', () => {
    it('issues exactly one attempt for a key-less mutation even on retriable failures', async () => {
      await fc.assert(
        fc.asyncProperty(arbMutationMethod, arbRetriableStatus, async (method, status) => {
          const client = createApiClient(CONFIG);
          const mock = new MockAdapter(client.http);

          let attempts = 0;
          let sawIdempotencyKey = false;
          mock.onAny().reply((reqConfig) => {
            attempts += 1;
            if (reqConfig.headers?.['Idempotency-Key'] !== undefined) sawIdempotencyKey = true;
            return [status, { error: 'fail' }];
          });

          // No `idempotent` flag → no key attached → not retry-eligible.
          const outcome = invoke(client, method, '/mutate', z.unknown()).then(
            () => 'resolved',
            () => 'rejected'
          );

          await vi.runAllTimersAsync();
          expect(await outcome).toBe('rejected');

          // Exactly one network attempt; no idempotency key was ever attached.
          expect(attempts).toBe(1);
          expect(sawIdempotencyKey).toBe(false);

          mock.restore();
        }),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property 3 ─────────────────────────────────────────────────────────
  // Feature: frontend-audit-remediation, Property 3: Retriable GET requests retry up to the bound
  //
  // For any GET request that fails with a retriable error on every attempt, the
  // client issues more than one attempt and stops at the configured maximum.
  // Validates: Requirements 1.1
  describe('Property 3: Retriable GET requests retry up to the bound', () => {
    it('retries an always-failing GET more than once and stops at MAX_RETRY_ATTEMPTS', async () => {
      await fc.assert(
        fc.asyncProperty(arbRetriableStatus, async (status) => {
          const client = createApiClient(CONFIG);
          const mock = new MockAdapter(client.http);

          let attempts = 0;
          mock.onAny().reply(() => {
            attempts += 1;
            return [status, { error: 'fail' }];
          });

          const outcome = client.get('/read', z.unknown()).then(
            () => 'resolved',
            () => 'rejected'
          );

          await vi.runAllTimersAsync();
          expect(await outcome).toBe('rejected');

          // GET is always retry-eligible: more than one attempt, bounded by the max.
          expect(attempts).toBeGreaterThan(1);
          expect(attempts).toBe(MAX_RETRY_ATTEMPTS);

          mock.restore();
        }),
        { numRuns: 100 }
      );
    });
  });

  // ─── Property 4 ─────────────────────────────────────────────────────────
  // Feature: frontend-audit-remediation, Property 4: Bounded total attempts (no multiplicative stacking)
  //
  // For any request and any interleaving of failures, the total number of network
  // attempts is less than or equal to MAX_RETRY_ATTEMPTS.
  // Validates: Requirements 2.1, 2.2, 2.3
  describe('Property 4: Bounded total attempts (no multiplicative stacking)', () => {
    it('never exceeds MAX_RETRY_ATTEMPTS across any method, idempotency, and failure interleaving', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAnyMethod,
          fc.boolean(),
          // An interleaving of per-attempt outcomes: a mix of retriable 5xx and
          // eventual success (200). The adapter walks this sequence, defaulting
          // to a retriable 5xx once exhausted.
          fc.array(fc.constantFrom(200, 500, 502, 503), { minLength: 1, maxLength: 6 }),
          async (method, idempotent, statuses) => {
            const client = createApiClient(CONFIG);
            const mock = new MockAdapter(client.http);

            let attempts = 0;
            mock.onAny().reply((reqConfig) => {
              const status = statuses[attempts] ?? 503;
              attempts += 1;
              if (status === 200) {
                // Valid envelope so the success path (Zod validation) does not throw.
                return [
                  200,
                  {
                    success: true,
                    data: 'ok',
                    meta: {
                      requestId: '550e8400-e29b-41d4-a716-446655440000',
                      timestamp: '2024-01-01T00:00:00Z',
                      version: '1.0.0',
                    },
                  },
                ];
              }
              void reqConfig;
              return [status, { error: 'fail' }];
            });

            const cfg: MutationRequestConfig | undefined =
              method === 'get' ? undefined : { idempotent };

            const outcome = invoke(client, method, '/any', z.unknown(), cfg).then(
              () => 'resolved',
              () => 'rejected'
            );

            await vi.runAllTimersAsync();
            await outcome;

            // The single retry layer never stacks: total attempts stay bounded.
            expect(attempts).toBeGreaterThanOrEqual(1);
            expect(attempts).toBeLessThanOrEqual(MAX_RETRY_ATTEMPTS);

            mock.restore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
