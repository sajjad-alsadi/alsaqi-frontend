import { useState, useCallback } from 'react';

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
 * On failure it reverts ONLY the affected item against the current list,
 * preserving any other concurrent updates (lost-update-safe). The full
 * pre-action snapshot is never restored (Req 22.3). When a precise inverse
 * is not possible, `revertItem` returns null and the data is refetched.
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
    setItems: (items: T[]) => void
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
      // Revert ONLY the affected item against the current (optimistic) list,
      // preserving any other concurrent updates. Never restore a full snapshot.
      const reverted = revertItem(optimisticItems);
      if (reverted === null) {
        // Precise inverse not possible: refetch the affected data instead.
        await refetch?.();
      } else {
        setItems(reverted);
      }
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { execute, isLoading };
}
