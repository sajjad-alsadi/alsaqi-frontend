// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConnectionStatus } from '../useConnectionStatus';

describe('useConnectionStatus', () => {
  let originalNavigatorOnLine: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    originalNavigatorOnLine = navigator.onLine;

    // Default: navigator.onLine = true
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Mock fetch to simulate a healthy API by default
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }));

    // Mock performance.now for latency measurement
    let callCount = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      callCount++;
      // Odd calls are "start", even calls are "end" — 100ms latency
      return callCount % 2 === 1 ? 0 : 100;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: originalNavigatorOnLine,
      writable: true,
      configurable: true,
    });
  });

  describe('Initial state', () => {
    it('should return online status when navigator.onLine is true and API is reachable', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      // Initial state before the first async check completes
      expect(result.current.status).toBe('online');
      expect(result.current.lastChecked).toBeDefined();
    });

    it('should return offline status when navigator.onLine is false', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current.status).toBe('offline');
    });
  });

  describe('Browser online/offline events', () => {
    it('should transition to offline when offline event fires', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      // Allow debounce to settle (STATUS_DEBOUNCE_MS = 500ms)
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(result.current.status).toBe('offline');
    });

    it('should transition back to online when online event fires and API is reachable', async () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const { result } = renderHook(() => useConnectionStatus());

      // Go back online
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      // Allow async check + debounce to settle
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(result.current.status).toBe('online');
    });
  });

  describe('API latency — degraded state', () => {
    it('should mark as degraded when API latency exceeds 5000ms', async () => {
      // Mock performance.now to simulate > 5000ms latency
      let callCount = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount % 2 === 1 ? 0 : 6000; // 6000ms latency
      });

      const { result } = renderHook(() => useConnectionStatus());

      // Wait for initial check + debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(result.current.status).toBe('degraded');
    });

    it('should remain online when API latency is below 5000ms', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      // Wait for initial check + debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(result.current.status).toBe('online');
    });
  });

  describe('API unreachable — offline state', () => {
    it('should mark as offline when API fetch throws (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')));

      const { result } = renderHook(() => useConnectionStatus());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(result.current.status).toBe('offline');
    });
  });

  describe('Status update timing', () => {
    it('should update status within 2 seconds of a connection change', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      // Go offline
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      // Should update within 2000ms (debounce is 500ms)
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.status).toBe('offline');
    });
  });

  describe('Cleanup on unmount', () => {
    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useConnectionStatus());
      unmount();

      const removedEvents = removeEventListenerSpy.mock.calls.map((call) => call[0]);
      expect(removedEvents).toContain('online');
      expect(removedEvents).toContain('offline');

      removeEventListenerSpy.mockRestore();
    });

    it('should clear intervals on unmount', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const { unmount } = renderHook(() => useConnectionStatus());
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('lastChecked timestamp', () => {
    it('should return a valid ISO 8601 timestamp', () => {
      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current.lastChecked).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
    });
  });
});
