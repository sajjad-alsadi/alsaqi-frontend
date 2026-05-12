import { useCallback, useRef, useEffect } from 'react';

/**
 * Hook that returns a debounced version of a callback.
 * Useful for search inputs, resize handlers, and other high-frequency events.
 * 
 * Unlike useDebounce (which debounces a value), this debounces the function itself.
 * 
 * @example
 * const debouncedSearch = useDebouncedCallback((query: string) => {
 *   fetchResults(query);
 * }, 300);
 * 
 * <input onChange={(e) => debouncedSearch(e.target.value)} />
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedFn = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);

  return debouncedFn as T;
}

/**
 * Hook that returns a throttled version of a callback.
 * Ensures the function is called at most once per interval.
 * 
 * @example
 * const throttledScroll = useThrottledCallback(() => {
 *   updateScrollPosition();
 * }, 100);
 * 
 * window.addEventListener('scroll', throttledScroll);
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number
): T {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const throttledFn = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallRef.current;

    if (timeSinceLastCall >= interval) {
      lastCallRef.current = now;
      callbackRef.current(...args);
    } else {
      // Schedule a trailing call
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        callbackRef.current(...args);
      }, interval - timeSinceLastCall);
    }
  }, [interval]);

  return throttledFn as T;
}
