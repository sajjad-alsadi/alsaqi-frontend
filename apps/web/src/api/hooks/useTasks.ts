/**
 * React Query hooks for the Audit Tasks API module.
 *
 * Provides typed query/mutation hooks with automatic cache invalidation.
 * Validates: Requirements 4.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskInput, UpdateTaskInput } from '@alsaqi/shared';
import { api } from '../index';
import { withMutationFeedback, type MutationFeedbackOptions } from '../mutationFeedback';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const tasksKeys = {
  all: ['tasks'] as const,
  lists: () => [...tasksKeys.all, 'list'] as const,
  list: (filters?: TasksListParams) => [...tasksKeys.lists(), filters] as const,
  details: () => [...tasksKeys.all, 'detail'] as const,
  detail: (id: string) => [...tasksKeys.details(), id] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TasksListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  plan_id?: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of tasks.
 */
export function useTasks(params?: TasksListParams) {
  return useQuery({
    queryKey: tasksKeys.list(params),
    queryFn: () => api.tasks.list(params),
  });
}

/**
 * Fetch a single task by ID.
 */
export function useTask(id: string) {
  return useQuery({
    queryKey: tasksKeys.detail(id),
    queryFn: () => api.tasks.getById(id),
    enabled: !!id,
  });
}

/**
 * Create a new task. Invalidates the tasks list cache on success.
 *
 * Failures are routed through the Mutation_Feedback_Policy (Req 18): the error
 * is surfaced to the user and re-thrown so the form stays open.
 */
export function useCreateTask(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (data: CreateTaskInput) => api.tasks.create(data),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.lists() });
    },
  });
}

/**
 * Update an existing task. Invalidates both list and detail caches.
 */
export function useUpdateTask(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation<
    Awaited<ReturnType<typeof api.tasks.update>>,
    Error,
    { id: string; data: UpdateTaskInput }
  >({
    mutationFn: withMutationFeedback(
      ({ id, data }: { id: string; data: UpdateTaskInput }) =>
        api.tasks.update(id, data),
      feedback,
    ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tasksKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete a task. Invalidates the tasks list cache on success.
 */
export function useDeleteTask(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (id: string) => api.tasks.delete(id),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.lists() });
    },
  });
}
