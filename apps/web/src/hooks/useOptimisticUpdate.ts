import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';

interface OptimisticOptions<T> {
  /** The async operation to perform */
  action: () => Promise<unknown>;
  /** Function to apply the optimistic update to the list */
  applyOptimistic: (items: T[]) => T[];
  /**
   * Revert only the affected item on failure (Req 22.1).
   * Receives the current list (which may include other concurrent updates)
   * and returns a new list with ONLY the affected item inverted.
   * Return `null` to signal that a precise inverse is not possible, in which
   * case `refetch` is invoked instead (Req 22.2).
   */
  revertItem: (items: T[]) => T[] | null;
  /**
   * Fallback used when `revertItem` cannot invert precisely (returns null).
   * Refetches the affected data from the server (Req 22.2).
   */
  refetch?: () => Promise<void> | void;
  /** Success callback */
  onSuccess?: () => void;
  /** Error callback */
  onError?: (error: unknown) => void;
}

/**
 * Hook for optimistic UI updates.
 * Updates the UI immediately, then confirms with the server.
 *
 * On failure it reverts ONLY the affected item against the LIVE state using a
 * functional setter (`setItems(prev => revertItem(prev))`), so any other
 * optimistic update applied after this one — but before its rollback runs — is
 * preserved (lost-update-safe). A pre-concurrency snapshot is never written
 * back. When a precise inverse is not possible, `revertItem` returns null and
 * the data is refetched instead.
 *
 * @example
 * const { execute, isLoading } = useOptimisticUpdate<AuditTask>();
 *
 * const handleStatusChange = (taskId: number, newStatus: string, prevStatus: string) => {
 *   execute({
 *     action: () => api.patch(`/tasks/${taskId}`, { status: newStatus }),
 *     applyOptimistic: (tasks) =>
 *       tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
 *     // Invert only the affected item against the current list
 *     revertItem: (tasks) =>
 *       tasks.map((t) => (t.id === taskId ? { ...t, status: prevStatus } : t)),
 *     refetch: () => queryClient.invalidateQueries(['tasks']),
 *     onSuccess: () => toast.success('Updated'),
 *     onError: () => toast.error('Failed to update'),
 *   }, items, setItems);
 * };
 */
export function useOptimisticUpdate<T>() {
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(async (
    options: OptimisticOptions<T>,
    currentItems: T[],
    setItems: Dispatch<SetStateAction<T[]>>
  ) => {
    const { action, applyOptimistic, revertItem, refetch, onSuccess, onError } = options;

    // Apply optimistic update immediately
    const optimisticItems = applyOptimistic(currentItems);
    setItems(optimisticItems);
    setIsLoading(true);

    try {
      await action();
      onSuccess?.();
    } catch (error) {
      // Probe whether a precise per-item inverse is possible. `revertItem`
      // returns null categorically when it cannot invert (e.g. a delete), so
      // the probe result does not depend on which list it is given.
      if (revertItem(optimisticItems) === null) {
        // Precise inverse not possible: refetch the affected data instead.
        await refetch?.();
      } else {
        // Revert ONLY the affected item against the LIVE state via a functional
        // setter (Req 14.1). `prev` is the latest state at rollback time, so a
        // second optimistic update applied before this rollback runs is
        // preserved (Req 14.2). The pre-concurrency `optimisticItems` snapshot
        // is never written back (Req 14.3).
        setItems((prev) => revertItem(prev) ?? prev);
      }
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { execute, isLoading };
}
