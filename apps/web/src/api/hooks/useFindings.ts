/**
 * React Query hooks for the Findings API module.
 *
 * Provides typed query/mutation hooks with automatic cache invalidation.
 * Validates: Requirements 4.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateFindingInput, UpdateFindingInput } from '@alsaqi/shared';
import { api } from '../index';
import { withMutationFeedback, type MutationFeedbackOptions } from '../mutationFeedback';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const findingsKeys = {
  all: ['findings'] as const,
  lists: () => [...findingsKeys.all, 'list'] as const,
  list: (filters?: FindingsListParams) => [...findingsKeys.lists(), filters] as const,
  details: () => [...findingsKeys.all, 'detail'] as const,
  detail: (id: string) => [...findingsKeys.details(), id] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Filter/pagination criteria for the findings list.
 *
 * Every field here is forwarded to the server as a request parameter by
 * `useFindings` (Req 24.1). The client never downloads the full findings set to
 * filter locally (Req 24.2).
 */
export interface FindingsListParams {
  page?: number;
  pageSize?: number;
  audit_id?: string;
  risk_level?: string;
  status?: string;
  search?: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of findings.
 *
 * Filter criteria are forwarded to the server as query parameters so the server
 * returns only the matching records; the hook does not download the full set and
 * filter on the client (Req 24.1, 24.2).
 */
export function useFindings(params?: FindingsListParams) {
  return useQuery({
    queryKey: findingsKeys.list(params),
    queryFn: () => api.findings.list(params),
  });
}

/**
 * Create a new finding. Invalidates the findings list cache on success.
 *
 * Failures are routed through the Mutation_Feedback_Policy (Req 18): the error
 * is surfaced to the user and re-thrown so the form stays open.
 */
export function useCreateFinding(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (data: CreateFindingInput) => api.findings.create(data),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: findingsKeys.lists() });
    },
  });
}

/**
 * Update an existing finding. Invalidates both the list and detail caches.
 */
export function useUpdateFinding(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation<
    Awaited<ReturnType<typeof api.findings.update>>,
    Error,
    { id: string; data: UpdateFindingInput }
  >({
    mutationFn: withMutationFeedback(
      ({ id, data }: { id: string; data: UpdateFindingInput }) =>
        api.findings.update(id, data),
      feedback,
    ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: findingsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: findingsKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete a finding. Invalidates the findings list cache on success.
 */
export function useDeleteFinding(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (id: string) => api.findings.delete(id),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: findingsKeys.lists() });
    },
  });
}
