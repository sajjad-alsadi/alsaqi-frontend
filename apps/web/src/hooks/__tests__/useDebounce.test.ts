// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';
import { useDebouncedCallback } from '../useDebouncedCallback';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('تأخير تحديث القيمة بالمدة المحددة', () => {
    it('should return the initial value immediately', () => {
      const { result } = renderHook(() => useDebounce('hello', 300));

      expect(result.current).toBe('hello');
    });

    it('should not update the debounced value before the delay expires', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 500 } }
      );

      rerender({ value: 'updated', delay: 500 });

      // Advance time but not enough
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current).toBe('initial');
    });

    it('should update the debounced value after the delay expires', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 500 } }
      );

      rerender({ value: 'updated', delay: 500 });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current).toBe('updated');
    });

    it('should work with numeric values', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 0, delay: 200 } }
      );

      rerender({ value: 42, delay: 200 });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current).toBe(42);
    });

    it('should respect different delay values', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'a', delay: 1000 } }
      );

      rerender({ value: 'b', delay: 1000 });

      act(() => {
        vi.advanceTimersByTime(999);
      });

      expect(result.current).toBe('a');

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(result.current).toBe('b');
    });
  });

  describe('إلغاء التأخير عند تغيير القيمة قبل انتهاء المهلة', () => {
    it('should reset the timer when value changes before timeout', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'first', delay: 300 } }
      );

      // Change value after 200ms (before 300ms timeout)
      rerender({ value: 'second', delay: 300 });
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Change value again before the timer expires
      rerender({ value: 'third', delay: 300 });

      // After 200ms more, the second value's timer would have fired, but it was cancelled
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Still showing initial because 'third' timer hasn't expired yet
      expect(result.current).toBe('first');

      // After the full delay from the last change
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(result.current).toBe('third');
    });

    it('should only emit the last value when rapidly changing', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'a', delay: 300 } }
      );

      // Rapid changes
      rerender({ value: 'b', delay: 300 });
      act(() => { vi.advanceTimersByTime(100); });

      rerender({ value: 'c', delay: 300 });
      act(() => { vi.advanceTimersByTime(100); });

      rerender({ value: 'd', delay: 300 });
      act(() => { vi.advanceTimersByTime(100); });

      rerender({ value: 'e', delay: 300 });

      // None of the intermediate values should have been emitted
      expect(result.current).toBe('a');

      // Wait for the full delay after the last change
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current).toBe('e');
    });

    it('should cancel previous timeout when value changes', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'start', delay: 500 } }
      );

      rerender({ value: 'middle', delay: 500 });

      // Advance 400ms (not enough for 500ms delay)
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Change value again - this should cancel the previous timer
      rerender({ value: 'end', delay: 500 });

      // Advance 100ms more - the original timer would have fired at 500ms
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // 'middle' should never have been set because its timer was cancelled
      expect(result.current).toBe('start');

      // Wait for the new timer to complete
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(result.current).toBe('end');
    });
  });
});

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('تأخير استدعاء الدالة بالمدة المحددة', () => {
    it('should not call the callback immediately', () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current('test');
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should call the callback after the delay', () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current('test');
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('test');
    });

    it('should pass all arguments to the callback', () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 200));

      act(() => {
        result.current('arg1', 'arg2', 123);
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(callback).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });
  });

  describe('إلغاء التأخير عند استدعاء الدالة مرة أخرى قبل انتهاء المهلة', () => {
    it('should reset the timer on subsequent calls', () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current('first');
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Call again before timeout
      act(() => {
        result.current('second');
      });

      // Advance past the original timeout
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Should not have been called yet (timer was reset)
      expect(callback).not.toHaveBeenCalled();

      // Complete the new timer
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('second');
    });

    it('should only call with the last arguments when called rapidly', () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current('a');
        result.current('b');
        result.current('c');
        result.current('d');
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('d');
    });
  });

  describe('تنظيف المؤقت عند إلغاء التحميل', () => {
    it('should cancel pending timeout on unmount', () => {
      const callback = vi.fn();
      const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current('test');
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('تحديث مرجع الدالة', () => {
    it('should use the latest callback reference', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const { result, rerender } = renderHook(
        ({ cb }) => useDebouncedCallback(cb, 300),
        { initialProps: { cb: callback1 } }
      );

      act(() => {
        result.current('test');
      });

      // Update the callback before the timer fires
      rerender({ cb: callback2 });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should call the latest callback
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith('test');
    });
  });
});
