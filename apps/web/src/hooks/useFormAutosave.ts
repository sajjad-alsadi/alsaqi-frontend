import { useEffect, useRef, useCallback } from 'react';

interface AutosaveOptions {
  /** Storage key for the draft */
  key: string;
  /** Debounce delay in ms (default: 2000) */
  delay?: number;
  /** Whether autosave is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook that auto-saves form data to localStorage as a draft.
 * Prevents data loss when the user accidentally closes the form.
 * 
 * @example
 * const { loadDraft, clearDraft } = useFormAutosave({
 *   key: 'audit-plan-draft',
 *   data: watch(), // from react-hook-form
 *   enabled: !initialData // only for new forms
 * });
 * 
 * // On mount, check for draft
 * useEffect(() => {
 *   const draft = loadDraft();
 *   if (draft) reset(draft);
 * }, []);
 * 
 * // On successful save
 * clearDraft();
 */
export function useFormAutosave<T extends Record<string, any>>(
  options: AutosaveOptions & { data: T }
) {
  const { key, data, delay = 2000, enabled = true } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storageKey = `draft_${key}`;

  // Debounced save to localStorage
  useEffect(() => {
    if (!enabled) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        // Only save if there's meaningful data (not all empty)
        const hasData = Object.values(data).some(v => v !== '' && v !== null && v !== undefined);
        if (hasData) {
          localStorage.setItem(storageKey, JSON.stringify({
            data,
            timestamp: Date.now()
          }));
        }
      } catch (e) {
        // localStorage might be full or unavailable
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, storageKey, delay, enabled]);

  /** Load a saved draft from localStorage */
  const loadDraft = useCallback((): T | null => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      
      // Expire drafts older than 24 hours
      if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(storageKey);
        return null;
      }

      return parsed.data as T;
    } catch {
      return null;
    }
  }, [storageKey]);

  /** Clear the saved draft (call after successful submit) */
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  /** Check if a draft exists */
  const hasDraft = useCallback((): boolean => {
    try {
      return localStorage.getItem(storageKey) !== null;
    } catch {
      return false;
    }
  }, [storageKey]);

  return { loadDraft, clearDraft, hasDraft };
}
