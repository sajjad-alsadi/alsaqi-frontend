/**
 * Property-based tests for retriable-error classification and bounded retry.
 *
 * Feature: web-production-readiness-remediation, Property 3: Retriable-error
 * classification and bounded retry
 *
 * Property 3: Retriable-error classification and bounded retry
 *   - For any HTTP error, `isRetriableError` returns true if and only if the
 *     error is a network error (no response) or carries a status in the range
 *     500–599; and for any sequence of retriable failures, the raw-axios retry
 *     path attempts the request at most `MAX_RETRY_ATTEMPTS` times before
 *     invoking the error reporter.
 *   **Validates: Requirements 6.1**
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { AxiosError } from 'axios';
import { z } from 'zod';
import MockAdapter from 'axios-mock-adapter';
import { createApiClient, isRetriableError, MAX_RETRY_ATTEMPTS, type ApiClient } from '../client';

// ─── Part A: Classification ──────────────────────────────────────────────────
//
// isRetriableError(error) === true  iff
//   error is an AxiosError AND (no response received OR 500 <= status <= 599).

describe('Property 3 (classification): isRetriableError is true iff network error or 5xx', () => {
  /**
   * Build an AxiosError-like object. When `networkError` is true the error has
   * no `response` (simulating a connection/network failure); otherwise it
   * carries a response with the generated status code. `new AxiosError(...)`
   * sets the `isAxiosError` marker that `axios.isAxiosError` (used inside
   * `isRetriableError`) checks for.
   */
  function makeAxiosError(status: number, networkError: boolean): AxiosError {
    const config = { url: '/test' } as never;
    if (networkError) {
      return new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    }
    const response = {
      status,
      statusText: '',
      data: {},
      headers: {},
      config,
    } as never;
    return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, {}, response);
  }

  it('classifies AxiosErrors across random status codes and network flags', () => {
    fc.assert(
      fc.property(
        // Cover the full informational..server-error range (100–599).
        fc.integer({ min: 100, max: 599 }),
        fc.boolean(),
        (status, networkError) => {
          const error = makeAxiosError(status, networkError);

          const expected = networkError || (status >= 500 && status <= 599);
          expect(isRetriableError(error)).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('classifies non-Axios errors as non-retriable', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ message: fc.string(), status: fc.integer({ min: 500, max: 599 }) }),
          fc.string().map((m) => new Error(m))
        ),
        (notAnAxiosError) => {
          // A plain Error / object / primitive is never an Axios error, so it
          // must never be considered retriable — even if it carries a 5xx-ish
          // `status` field.
          expect(isRetriableError(notAnAxiosError)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Part B: Bounded retry on the typed client's Retry_Layer ─────────────────
//
// Retries live exclusively in the typed client's `requestWithRetry` (the raw
// `httpClient` axios instance installs no retry interceptor). For a sequence of
// retriable failures, `client.get` attempts the request at most
// MAX_RETRY_ATTEMPTS times, then routes the final failure through `onError`.

describe('Property 3 (bounded retry): typed client retries at most MAX_RETRY_ATTEMPTS times', () => {
  let client: ApiClient;
  let mock: MockAdapter;
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Fake timers so the retry path's exponential backoff (1s, 2s, ...) does not
    // actually delay the test; we flush pending timers explicitly.
    vi.useFakeTimers();
    onError = vi.fn();
    // Build a typed client whose internal axios instance we can mock. The
    // `onError` hook is what `httpClient.ts` wires to the structured reporter.
    client = createApiClient({ baseUrl: '/api', onError });
    mock = new MockAdapter(client.http);
  });

  afterEach(() => {
    mock.restore();
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('always-failing retriable requests attempt exactly MAX_RETRY_ATTEMPTS times then report once', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Retriable 5xx status codes drive a full sequence of retries.
        fc.integer({ min: 500, max: 599 }),
        async (status) => {
          mock.reset();
          onError.mockClear();

          let attempts = 0;
          mock.onAny().reply(() => {
            attempts += 1;
            return [status, { error: 'fail' }];
          });

          // The request must ultimately reject after exhausting retries.
          const pending = client.get('/retry-target', z.unknown()).then(
            () => 'resolved',
            () => 'rejected'
          );

          // Drive all backoff timers (and the microtasks they unblock).
          await vi.runAllTimersAsync();
          const outcome = await pending;

          expect(outcome).toBe('rejected');
          // Bounded: never more than the configured maximum total attempts.
          expect(attempts).toBeLessThanOrEqual(MAX_RETRY_ATTEMPTS);
          // For an always-failing retriable response it uses the full budget.
          expect(attempts).toBe(MAX_RETRY_ATTEMPTS);
          // The final failure is routed through the configured error hook.
          expect(onError).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('non-retriable 4xx responses are attempted exactly once and not reported by the retry path', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 4xx other than 401 (401 is delegated to the refresh flow).
        fc.integer({ min: 400, max: 499 }).filter((s) => s !== 401),
        async (status) => {
          mock.reset();
          onError.mockClear();

          let attempts = 0;
          mock.onAny().reply(() => {
            attempts += 1;
            return [status, { error: 'client-error' }];
          });

          const pending = client.get('/no-retry-target', z.unknown()).then(
            () => 'resolved',
            () => 'rejected'
          );

          await vi.runAllTimersAsync();
          const outcome = await pending;

          expect(outcome).toBe('rejected');
          // Non-retriable: a single attempt, no retry-path error report.
          expect(attempts).toBe(1);
          expect(onError).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
