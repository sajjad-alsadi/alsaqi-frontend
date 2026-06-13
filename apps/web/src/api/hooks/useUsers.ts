/**
 * React Query hooks for the Users API module.
 *
 * Provides typed query/mutation hooks with automatic cache invalidation.
 * Validates: Requirements 4.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, UpdateUserInput } from '@alsaqi/shared';
import { api } from '../index';
import { withMutationFeedback, type MutationFeedbackOptions } from '../mutationFeedback';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (filters?: UsersListParams) => [...usersKeys.lists(), filters] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (id: string) => [...usersKeys.details(), id] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsersListParams {
  page?: number;
  pageSize?: number;
  role?: string;
  status?: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of users.
 */
export function useUsers(params?: UsersListParams) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => api.users.list(params),
  });
}

/**
 * Fetch a single user by ID.
 */
export function useUser(id: string) {
  return useQuery({
    queryKey: usersKeys.detail(id),
    queryFn: () => api.users.getById(id),
    enabled: !!id,
  });
}

/**
 * Create a new user. Invalidates the users list cache on success.
 *
 * Failures are routed through the Mutation_Feedback_Policy (Req 18): the error
 * is surfaced to the user and re-thrown so the form stays open.
 */
export function useCreateUser(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (data: CreateUserInput) => api.users.create(data),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}

/**
 * Update an existing user. Invalidates both list and detail caches.
 */
export function useUpdateUser(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation<
    Awaited<ReturnType<typeof api.users.update>>,
    Error,
    { id: string; data: UpdateUserInput }
  >({
    mutationFn: withMutationFeedback(
      ({ id, data }: { id: string; data: UpdateUserInput }) =>
        api.users.update(id, data),
      feedback,
    ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete a user. Invalidates the users list cache on success.
 */
export function useDeleteUser(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (id: string) => api.users.delete(id),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}
