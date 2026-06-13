/**
 * React Query hooks for the Audit Plans API module.
 *
 * Provides typed query/mutation hooks with automatic cache invalidation.
 * Validates: Requirements 4.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateAuditPlanInput, UpdateAuditPlanInput } from '@alsaqi/shared';
import { api } from '../index';
import { withMutationFeedback, type MutationFeedbackOptions } from '../mutationFeedback';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const auditPlansKeys = {
  all: ['audit-plans'] as const,
  lists: () => [...auditPlansKeys.all, 'list'] as const,
  list: (filters?: AuditPlansListParams) => [...auditPlansKeys.lists(), filters] as const,
  details: () => [...auditPlansKeys.all, 'detail'] as const,
  detail: (id: string) => [...auditPlansKeys.details(), id] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditPlansListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  department?: string;
  type?: string;
  search?: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of audit plans.
 *
 * The returned `data` is a {@link PaginatedAuditPlans} object whose `total` and
 * `totalPages` come straight from the server `Response_Envelope` meta — never
 * computed from the current page's array length (Req 21.1, 21.2). Page and
 * page-size params are forwarded to the server (Req 21.3).
 *
 * Validates: Requirements 21.1, 21.2, 21.3
 */
export function useAuditPlans(params?: AuditPlansListParams) {
  return useQuery({
    queryKey: auditPlansKeys.list(params),
    queryFn: () => api.auditPlans.list(params),
  });
}

/**
 * Fetch a single audit plan by ID.
 */
export function useAuditPlan(id: string) {
  return useQuery({
    queryKey: auditPlansKeys.detail(id),
    queryFn: () => api.auditPlans.getById(id),
    enabled: !!id,
  });
}

/**
 * Create a new audit plan. Invalidates the plans list cache on success.
 *
 * Failures are routed through the Mutation_Feedback_Policy (Req 18): the error
 * is surfaced to the user and re-thrown so the form stays open.
 */
export function useCreateAuditPlan(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (data: CreateAuditPlanInput) => api.auditPlans.create(data),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.lists() });
    },
  });
}

/**
 * Update an existing audit plan. Invalidates both list and detail caches.
 */
export function useUpdateAuditPlan(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation<
    Awaited<ReturnType<typeof api.auditPlans.update>>,
    Error,
    { id: string; data: UpdateAuditPlanInput }
  >({
    mutationFn: withMutationFeedback(
      ({ id, data }: { id: string; data: UpdateAuditPlanInput }) =>
        api.auditPlans.update(id, data),
      feedback,
    ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.lists() });
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete an audit plan. Invalidates the plans list cache on success.
 */
export function useDeleteAuditPlan(feedback?: MutationFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withMutationFeedback(
      (id: string) => api.auditPlans.delete(id),
      feedback,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.lists() });
    },
  });
}
