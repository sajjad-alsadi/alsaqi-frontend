import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook that persists filter/search state in sessionStorage.
 * When the user navigates away and comes back, their filters are restored.
 * 
 * @example
 * const [search, setSearch] = usePersistedFilters('audit-plan-search', '');
 * const [filters, setFilters] = usePersistedFilters('audit-plan-filters', { status: '', dept: '' });
 */
export function usePersistedFilters<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `filters_${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored) as T;
      }
    } catch {}
    return defaultValue;
  });

  // Persist to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  }, [value, storageKey]);

  const setPersistedValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prev) 
        : newValue;
      return resolved;
    });
  }, []);

  return [value, setPersistedValue];
}

/**
 * Hook that persists scroll position for a specific page.
 * Restores scroll position when navigating back.
 * 
 * @example
 * const scrollRef = useScrollRestore('audit-plan-list');
 * <div ref={scrollRef} className="overflow-y-auto">...</div>
 */
export function useScrollRestore(key: string) {
  const storageKey = `scroll_${key}`;
  // Holds the teardown for the currently-attached node. Used to remove all
  // observers/listeners on unmount or before re-attaching to a new node, so
  // listeners never accumulate across re-renders (Req 15.3, 15.4).
  const cleanupRef = useRef<(() => void) | null>(null);

  const readSavedScroll = useCallback((): number | null => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        return Number.isNaN(parsed) ? null : parsed;
      }
    } catch {}
    return null;
  }, [storageKey]);

  const ref = useCallback((node: HTMLElement | null) => {
    // Tear down any previous attachment first. React invokes the callback ref
    // with `null` on unmount and with the new node when the ref target changes,
    // so this guarantees a single set of observers/listeners at any time.
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!node) return;

    // Capture the target scroll position once so the scroll handler cannot
    // clobber it while async content is still loading.
    const initialTarget = readSavedScroll();
    let settled = initialTarget === null;

    const applyTarget = () => {
      if (settled || initialTarget === null) return;
      node.scrollTop = initialTarget;
      // Once the element is tall enough to honor the saved position, stop
      // forcing it so the user's own scrolling is not overridden.
      if (node.scrollTop >= initialTarget) {
        settled = true;
      }
    };

    // Restore scroll position on attach.
    applyTarget();

    // Save scroll position as the user scrolls. Ignore saves until the initial
    // restore has settled so a transient (clamped) value can't overwrite the
    // saved target while content is still loading.
    const handleScroll = () => {
      if (!settled) return;
      try {
        sessionStorage.setItem(storageKey, String(node.scrollTop));
      } catch {}
    };
    node.addEventListener('scroll', handleScroll, { passive: true });

    // Re-apply the saved position when the element's own content size changes
    // (e.g. async data loads make it scrollable). Scoped to this element only —
    // no document-wide observation (Req 15.1, 15.2).
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && !settled) {
      resizeObserver = new ResizeObserver(() => {
        applyTarget();
        if (settled) {
          resizeObserver?.disconnect();
          resizeObserver = null;
        }
      });
      resizeObserver.observe(node);
    }

    cleanupRef.current = () => {
      node.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
      resizeObserver = null;
    };
  }, [storageKey, readSavedScroll]);

  return ref;
}
