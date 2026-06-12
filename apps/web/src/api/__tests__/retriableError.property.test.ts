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
import { AxiosError, type AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { isRetriableError, MAX_RETRY_ATTEMPTS } from '../client';
import { errorReporter } from '../../utils/errorReporter';

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

// ─── Part B: Bounded retry on the raw-axios path ─────────────────────────────
//
// For a sequence of retriable failures, the raw `httpClient` instance attempts
// the request at most MAX_RETRY_ATTEMPTS times, then reports via errorReporter.

describe('Property 3 (bounded retry): raw-axios path retries at most MAX_RETRY_ATTEMPTS times', () => {
  let api: AxiosInstance;
  let mock: MockAdapter;
  let reportSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Fake timers so the interceptor's exponential backoff (1s, 2s, ...) does
    // not actually delay the test; we flush pending timers explicitly.
    vi.useFakeTimers();
    // Mock the error reporter so no real fetch/network is attempted on final
    // failure and so we can assert it is invoked exactly once.
    reportSpy = vi.spyOn(errorReporter, 'report').mockImplementation(() => {});

    // Import the raw axios instance (default export) fresh; it is a singleton.
    api = (await import('../httpClient')).default;
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    mock.restore();
    reportSpy.mockRestore();
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
          reportSpy.mockClear();

          let attempts = 0;
          mock.onAny().reply(() => {
            attempts += 1;
            return [status, { error: 'fail' }];
          });

          // The request must ultimately reject after exhausting retries.
          const pending = api.get('/retry-target').then(
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
          // The final failure is routed through the structured error reporter.
          expect(reportSpy).toHaveBeenCalledTimes(1);
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
          reportSpy.mockClear();

          let attempts = 0;
          mock.onAny().reply(() => {
            attempts += 1;
            return [status, { error: 'client-error' }];
          });

          const pending = api.get('/no-retry-target').then(
            () => 'resolved',
            () => 'rejected'
          );

          await vi.runAllTimersAsync();
          const outcome = await pending;

          expect(outcome).toBe('rejected');
          // Non-retriable: a single attempt, no retry-path error report.
          expect(attempts).toBe(1);
          expect(reportSpy).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
