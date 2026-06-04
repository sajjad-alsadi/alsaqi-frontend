/**
 * React Query hooks for the Findings API module.
 *
 * Provides typed query/mutation hooks with automatic cache invalidation.
 * Validates: Requirements 4.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateFindingInput, UpdateFindingInput } from '@alsaqi/shared';
import { api } from '../index';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const findingsKeys = {
  all: ['findings'] as const,
  lists: () => [...findingsKeys.all, 'list'] as const,
  list: (filters?: FindingsListParams) => [...findingsKeys.lists(), filters] as const,
  details: () => [...findingsKeys.all, 'detail'] as const,
  detail: (id: string) => [...findingsKeys.details(), id] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FindingsListParams {
  page?: number;
  pageSize?: number;
  status?: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of findings.
 */
export function useFindings(params?: FindingsListParams) {
  return useQuery({
    queryKey: findingsKeys.list(params),
    queryFn: () => api.findings.list(params),
  });
}

/**
 * Create a new finding. Invalidates the findings list cache on success.
 */
export function useCreateFinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFindingInput) => api.findings.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: findingsKeys.lists() });
    },
  });
}

/**
 * Update an existing finding. Invalidates both the list and detail caches.
 */
export function useUpdateFinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFindingInput }) =>
      api.findings.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: findingsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: findingsKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete a finding. Invalidates the findings list cache on success.
 */
export function useDeleteFinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.findings.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: findingsKeys.lists() });
    },
  });
}
