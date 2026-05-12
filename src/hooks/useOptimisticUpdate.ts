import { useState, useCallback } from 'react';

interface OptimisticOptions<T> {
  /** The async operation to perform */
  action: () => Promise<any>;
  /** Function to apply the optimistic update to the list */
  optimisticUpdate: (items: T[]) => T[];
  /** Function to rollback on failure */
  rollback: (items: T[]) => T[];
  /** Success callback */
  onSuccess?: () => void;
  /** Error callback */
  onError?: (error: any) => void;
}

/**
 * Hook for optimistic UI updates.
 * Updates the UI immediately, then confirms with the server.
 * Rolls back if the server request fails.
 * 
 * @example
 * const { execute, isLoading } = useOptimisticUpdate<AuditTask>();
 * 
 * const handleStatusChange = (taskId: number, newStatus: string) => {
 *   execute({
 *     action: () => api.patch(`/tasks/${taskId}`, { status: newStatus }),
 *     optimisticUpdate: (tasks) => tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t),
 *     rollback: (tasks) => tasks, // original list is preserved internally
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
    const { action, optimisticUpdate, onSuccess, onError } = options;
    const previousItems = [...currentItems];

    // Apply optimistic update immediately
    setItems(optimisticUpdate(currentItems));
    setIsLoading(true);

    try {
      await action();
      onSuccess?.();
    } catch (error) {
      // Rollback on failure
      setItems(previousItems);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { execute, isLoading };
}
