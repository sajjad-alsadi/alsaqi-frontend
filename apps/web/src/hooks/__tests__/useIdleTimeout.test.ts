// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIdleTimeout } from '../useIdleTimeout';

// Mock dependencies
const mockLogout = vi.fn();
const mockUser = { user: null as any };

vi.mock('../../context/UserContext', () => ({
  useUser: () => mockUser,
}));

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ logout: mockLogout }),
}));

vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { session_timeout_minutes: 30 } }),
  },
}));

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUser.user = { id: '1', name: 'Test User', role: 'Admin' };
    mockLogout.mockClear();
    // Mock sessionStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('استدعاء دالة الخمول بعد انتهاء المهلة', () => {
    it('should call logout after the default idle timeout (30 minutes)', () => {
      renderHook(() => useIdleTimeout());

      // Advance time to just before timeout - logout should not be called
      vi.advanceTimersByTime(30 * 60 * 1000 - 1);
      expect(mockLogout).not.toHaveBeenCalled();

      // Advance past the timeout
      vi.advanceTimersByTime(1);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('should set idle_logout flag in sessionStorage before logout', () => {
      renderHook(() => useIdleTimeout());

      vi.advanceTimersByTime(30 * 60 * 1000);

      expect(sessionStorage.getItem('idle_logout')).toBe('true');
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should not set timeout when user is null', () => {
      mockUser.user = null;

      renderHook(() => useIdleTimeout());

      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('should clear timeout when user becomes null', () => {
      const { rerender } = renderHook(() => useIdleTimeout());

      // Advance partially
      vi.advanceTimersByTime(10 * 60 * 1000);

      // User logs out (becomes null)
      mockUser.user = null;
      rerender();

      // Advance past original timeout
      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  describe('إعادة التعيين عند النشاط (mousemove, keydown)', () => {
    it('should reset the timer on mousemove event', () => {
      renderHook(() => useIdleTimeout());

      // Advance 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();

      // Simulate mouse movement - this should reset the timer
      window.dispatchEvent(new Event('mousemove'));

      // Advance another 20 minutes (total 40 from start, but only 20 from last activity)
      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();

      // Advance the remaining 10 minutes to reach 30 from last activity
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('should reset the timer on keydown event', () => {
      renderHook(() => useIdleTimeout());

      // Advance 25 minutes
      vi.advanceTimersByTime(25 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();

      // Simulate keydown - this should reset the timer
      window.dispatchEvent(new Event('keydown'));

      // Advance 25 more minutes (only 25 from last activity, not yet 30)
      vi.advanceTimersByTime(25 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();

      // Advance remaining 5 minutes to reach 30 from last activity
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('should reset the timer on mousedown event', () => {
      renderHook(() => useIdleTimeout());

      // Advance 29 minutes
      vi.advanceTimersByTime(29 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();

      // Simulate mousedown - resets the timer
      window.dispatchEvent(new Event('mousedown'));

      // Advance 29 minutes again (not yet 30 from last activity)
      vi.advanceTimersByTime(29 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();

      // Advance 1 more minute to reach 30 from last activity
      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('should reset the timer on touchstart event', () => {
      renderHook(() => useIdleTimeout());

      // Advance 28 minutes
      vi.advanceTimersByTime(28 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();

      // Simulate touchstart
      window.dispatchEvent(new Event('touchstart'));

      // Full 30 minutes from last activity
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple activity events and only call logout once after final inactivity', () => {
      renderHook(() => useIdleTimeout());

      // Simulate activity every 10 minutes for 50 minutes
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(10 * 60 * 1000);
        window.dispatchEvent(new Event('mousemove'));
      }

      // Should not have logged out yet
      expect(mockLogout).not.toHaveBeenCalled();

      // Now wait full 30 minutes without activity
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('تنظيف المستمعين عند إلغاء التثبيت', () => {
    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useIdleTimeout());
      unmount();

      // Verify that event listeners are removed for tracked events
      const removedEvents = removeEventListenerSpy.mock.calls.map(call => call[0]);
      expect(removedEvents).toContain('mousemove');
      expect(removedEvents).toContain('keydown');
      expect(removedEvents).toContain('mousedown');
      expect(removedEvents).toContain('touchstart');

      removeEventListenerSpy.mockRestore();
    });

    it('should not call logout after unmount even if timeout would have expired', () => {
      const { unmount } = renderHook(() => useIdleTimeout());

      // Advance partially
      vi.advanceTimersByTime(15 * 60 * 1000);

      // Unmount the hook
      unmount();

      // Advance past the timeout
      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });
});
