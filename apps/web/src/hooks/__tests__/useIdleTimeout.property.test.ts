// @vitest-environment jsdom
//
// Feature: frontend-audit-remediation, Property 22: Idle timer throttling
//
// Property 22: Idle timer throttling
//   For any number of mousemove (activity) events occurring within a single
//   throttle interval, the idle-timeout timer SHALL be re-armed at most once.
//   `useIdleTimeout` wraps `handleActivity` in a leading-edge throttle
//   (ACTIVITY_THROTTLE_MS = 1000) keyed off `lastActivityArmRef`, so a burst of
//   continuous activity re-arms the timer (clearTimeout + setTimeout via
//   `resetTimeout`) at most once per interval.
//   **Validates: Requirements 27.1**
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';

// The throttle interval enforced by the hook (kept in sync with the source).
const ACTIVITY_THROTTLE_MS = 1000;

// Stable mocked dependencies. `vi.hoisted` ensures these exist before the
// hoisted `vi.mock` factories run. A stable `user` identity keeps the hook's
// activity effect from re-running (its deps are [user, logout, timeoutMs]).
const { mockUser, mockLogout, mockGet } = vi.hoisted(() => ({
  mockUser: { id: 1, email: 'idle@example.com', name: 'Idle Tester' },
  mockLogout: vi.fn(),
  mockGet: vi.fn(() => Promise.resolve({ data: {} })),
}));

// Mock the contexts the hook consumes so no providers are required and the
// "logged-in" branch (which arms the timer) is always active.
vi.mock('../../context/UserContext', () => ({
  useUser: () => ({ user: mockUser }),
}));
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ logout: mockLogout }),
}));
// Mock the raw HTTP client so /session-config resolves with no override,
// leaving timeoutMs at its default and avoiding any state-driven re-render.
vi.mock('../../api/httpClient', () => ({
  default: { get: mockGet },
}));

import { useIdleTimeout } from '../useIdleTimeout';

// A burst of inter-event delays (ms) that, when summed, stay strictly inside a
// single throttle interval. max length (30) * max delay (30) = 900 < 1000,
// guaranteeing every generated burst fits within one ACTIVITY_THROTTLE_MS
// window measured from the leading-edge re-arm.
const burstArb = fc.array(fc.integer({ min: 0, max: 30 }), {
  minLength: 1,
  maxLength: 30,
});

describe('Property 22: Idle timer throttling (useIdleTimeout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(() => Promise.resolve({ data: {} }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('re-arms the idle timer at most once per throttle interval for any burst of activity', () => {
    fc.assert(
      fc.property(burstArb, (delays) => {
        // setTimeout is invoked exactly once per re-arm (resetTimeout always
        // calls clearTimeout + setTimeout while logged in). Counting setTimeout
        // calls during the burst therefore counts re-arms directly.
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const { unmount } = renderHook(() => useIdleTimeout());

        try {
          // Move the clock to a fresh leading edge so the first activity event
          // is eligible to re-arm (exercising a real re-arm, not a no-op).
          act(() => {
            vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS);
          });

          const before = setTimeoutSpy.mock.calls.length;

          // Fire the whole burst within a single throttle window.
          act(() => {
            for (const delay of delays) {
              if (delay > 0) {
                vi.advanceTimersByTime(delay);
              }
              window.dispatchEvent(new Event('mousemove'));
            }
          });

          const rearms = setTimeoutSpy.mock.calls.length - before;

          // Property 22: at most one re-arm per throttle interval, regardless
          // of how many events fired.
          expect(rearms).toBeLessThanOrEqual(1);
        } finally {
          unmount();
          setTimeoutSpy.mockRestore();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('does NOT re-arm again for additional events inside the same interval (leading-edge only)', () => {
    // A deterministic companion to the property: a dense burst of 50 events
    // packed into one interval yields exactly one re-arm.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { unmount } = renderHook(() => useIdleTimeout());

    try {
      act(() => {
        vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS);
      });

      const before = setTimeoutSpy.mock.calls.length;

      act(() => {
        for (let i = 0; i < 50; i += 1) {
          vi.advanceTimersByTime(1); // total 50ms << 1000ms window
          window.dispatchEvent(new Event('mousemove'));
        }
      });

      const rearms = setTimeoutSpy.mock.calls.length - before;
      expect(rearms).toBe(1);
    } finally {
      unmount();
      setTimeoutSpy.mockRestore();
    }
  });

  it('re-arms again once the throttle interval has elapsed', () => {
    // Sanity check on the complementary behaviour (Req 27.2): a second window
    // produces a second re-arm.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { unmount } = renderHook(() => useIdleTimeout());

    try {
      act(() => {
        vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS);
      });

      const before = setTimeoutSpy.mock.calls.length;

      act(() => {
        window.dispatchEvent(new Event('mousemove')); // window 1 leading edge
        vi.advanceTimersByTime(ACTIVITY_THROTTLE_MS); // cross into window 2
        window.dispatchEvent(new Event('mousemove')); // window 2 leading edge
      });

      const rearms = setTimeoutSpy.mock.calls.length - before;
      expect(rearms).toBe(2);
    } finally {
      unmount();
      setTimeoutSpy.mockRestore();
    }
  });
});
