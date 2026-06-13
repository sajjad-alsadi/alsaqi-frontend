// @vitest-environment jsdom
/**
 * Unit tests for the AuthContext session-check retry lifecycle.
 *
 * Feature: frontend-audit-remediation, Task 8.2 — retry-timer cleanup and
 * post-unmount guard.
 *
 * AuthContext.checkLocalSession schedules a 503 retry via a setTimeout stored
 * in `retryTimerRef`; a cleanup effect clears that timer on unmount and an
 * `isMountedRef` guard blocks state updates after unmount. These tests use
 * `vi.useFakeTimers()` to assert the timer is scheduled, cleared on unmount,
 * and that no retry (and therefore no post-unmount state update) occurs after
 * the provider has unmounted.
 *
 * Validates: Requirements 12.1, 12.2, 12.3
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mock the raw HTTP client (default export) ──────────────────────────────
// AuthContext imports `api` from '../api/httpClient'; from this test file that
// module resolves to '../../api/httpClient'. We mock its default export so we
// control the /profile response (a 503 triggers the retry path).
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../api/httpClient', () => ({
  __esModule: true,
  default: apiMock,
}));

import { AuthProvider } from '../AuthContext';
import { UserProvider } from '../UserContext';

/** A 503 axios-style rejection that drives checkLocalSession into the retry branch. */
const SERVICE_UNAVAILABLE = { response: { status: 503 } };

/** Flush pending microtasks (promise continuations) without advancing timers. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderAuthProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AuthProvider>
          <div>app</div>
        </AuthProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  // Drop any timer the test intentionally left pending, then restore real timers.
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('AuthContext session-check retry lifecycle', () => {
  it('schedules a retry timer after a 503 profile response (Req 12.1)', async () => {
    apiMock.get.mockRejectedValue(SERVICE_UNAVAILABLE);

    renderAuthProvider();
    await flushMicrotasks();

    // The first /profile attempt ran and failed with 503...
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get).toHaveBeenCalledWith('/profile');
    // ...so exactly one retry timer is now pending.
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears the pending retry timer on unmount and does not re-issue the request (Req 12.2)', async () => {
    apiMock.get.mockRejectedValue(SERVICE_UNAVAILABLE);
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { unmount } = renderAuthProvider();
    await flushMicrotasks();

    expect(vi.getTimerCount()).toBe(1);
    expect(apiMock.get).toHaveBeenCalledTimes(1);

    unmount();

    // The cleanup effect cleared the pending timer...
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    // ...so advancing past the 2s retry delay never re-issues the session check.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it('performs no state update from a pending retry after unmount (Req 12.3)', async () => {
    apiMock.get.mockRejectedValue(SERVICE_UNAVAILABLE);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderAuthProvider();
    await flushMicrotasks();

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    // Advance well past the retry delay; the cleared timer must not fire and the
    // isMountedRef guard must prevent any post-unmount state update.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // No further session checks, and no React "state update on an unmounted
    // component" warning was emitted.
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const warnedAboutUnmounted = consoleErrorSpy.mock.calls.some((args) =>
      args.some(
        (arg) =>
          typeof arg === 'string' &&
          (arg.includes('unmounted') || arg.includes('not wrapped in act'))
      )
    );
    expect(warnedAboutUnmounted).toBe(false);

    consoleErrorSpy.mockRestore();
  });
});
