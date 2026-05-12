import { useState, useCallback, useEffect } from 'react';

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
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;

    // Restore scroll position
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        node.scrollTop = parseInt(saved, 10);
      }
    } catch {}

    // Save scroll position on scroll
    const handleScroll = () => {
      try {
        sessionStorage.setItem(storageKey, String(node.scrollTop));
      } catch {}
    };

    node.addEventListener('scroll', handleScroll, { passive: true });
    
    // Cleanup on unmount via MutationObserver trick
    const observer = new MutationObserver(() => {
      if (!document.contains(node)) {
        node.removeEventListener('scroll', handleScroll);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, [storageKey]);

  return ref;
}
