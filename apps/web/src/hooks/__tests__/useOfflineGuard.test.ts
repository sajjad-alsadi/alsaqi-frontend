// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineGuard } from '../useOfflineGuard';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

import toast from 'react-hot-toast';

// Mock the connection status hook
vi.mock('../useConnectionStatus', () => ({
  useConnectionStatus: vi.fn(() => ({
    status: 'online',
    lastChecked: '2024-01-01T00:00:00.000Z',
  })),
}));

import { useConnectionStatus } from '../useConnectionStatus';

describe('useOfflineGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(toast.error).mockClear();
    vi.mocked(useConnectionStatus).mockReturnValue({
      status: 'online',
      lastChecked: '2024-01-01T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('status flags', () => {
    it('should return isOffline=false and isDegraded=false when online', () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'online', lastChecked: '' });
      const { result } = renderHook(() => useOfflineGuard());

      expect(result.current.isOffline).toBe(false);
      expect(result.current.isDegraded).toBe(false);
      expect(result.current.status).toBe('online');
    });

    it('should return isOffline=true when offline', () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'offline', lastChecked: '' });
      const { result } = renderHook(() => useOfflineGuard());

      expect(result.current.isOffline).toBe(true);
      expect(result.current.isDegraded).toBe(false);
      expect(result.current.status).toBe('offline');
    });

    it('should return isDegraded=true when degraded', () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'degraded', lastChecked: '' });
      const { result } = renderHook(() => useOfflineGuard());

      expect(result.current.isOffline).toBe(false);
      expect(result.current.isDegraded).toBe(true);
      expect(result.current.status).toBe('degraded');
    });
  });

  describe('guardedSubmit — online/degraded', () => {
    it('should call the handler when online', async () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'online', lastChecked: '' });
      const handler = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useOfflineGuard());

      const guarded = result.current.guardedSubmit(handler);
      await act(async () => {
        await guarded({ name: 'test' });
      });

      expect(handler).toHaveBeenCalledWith({ name: 'test' });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('should call the handler when degraded (not offline)', async () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'degraded', lastChecked: '' });
      const handler = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useOfflineGuard());

      const guarded = result.current.guardedSubmit(handler);
      await act(async () => {
        await guarded({ value: 42 });
      });

      expect(handler).toHaveBeenCalledWith({ value: 42 });
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('guardedSubmit — offline', () => {
    it('should NOT call the handler when offline', async () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'offline', lastChecked: '' });
      const handler = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useOfflineGuard());

      const guarded = result.current.guardedSubmit(handler);
      await act(async () => {
        await guarded({ data: 'preserved' });
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should show a toast notification when submission is blocked', async () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'offline', lastChecked: '' });
      const handler = vi.fn();
      const { result } = renderHook(() => useOfflineGuard());

      const guarded = result.current.guardedSubmit(handler);
      await act(async () => {
        await guarded({});
      });

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: 'offline-submit-blocked' })
      );
    });

    it('should throttle toast notifications within 3 seconds', async () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'offline', lastChecked: '' });
      const handler = vi.fn();
      const { result } = renderHook(() => useOfflineGuard());

      const guarded = result.current.guardedSubmit(handler);

      // First attempt — shows toast
      await act(async () => {
        await guarded({});
      });
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Second attempt within 3s — throttled
      vi.advanceTimersByTime(1000);
      await act(async () => {
        await guarded({});
      });
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Third attempt after 3s — shows toast again
      vi.advanceTimersByTime(3000);
      await act(async () => {
        await guarded({});
      });
      expect(toast.error).toHaveBeenCalledTimes(2);
    });

    it('should preserve form data by not resetting or discarding anything', async () => {
      vi.mocked(useConnectionStatus).mockReturnValue({ status: 'offline', lastChecked: '' });
      const formData = { name: 'Important Data', description: 'Must be preserved' };
      const handler = vi.fn();
      const { result } = renderHook(() => useOfflineGuard());

      const guarded = result.current.guardedSubmit(handler);
      await act(async () => {
        await guarded(formData);
      });

      // Handler not called = form data remains in the caller's state
      expect(handler).not.toHaveBeenCalled();
      // The formData object is untouched — no side effects
      expect(formData).toEqual({ name: 'Important Data', description: 'Must be preserved' });
    });
  });
});
