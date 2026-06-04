/**
 * React Query hooks for the Audit Plans API module.
 *
 * Provides typed query/mutation hooks with automatic cache invalidation.
 * Validates: Requirements 4.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateAuditPlanInput, UpdateAuditPlanInput } from '@alsaqi/shared';
import { api } from '../index';

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
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of audit plans.
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
 */
export function useCreateAuditPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAuditPlanInput) => api.auditPlans.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.lists() });
    },
  });
}

/**
 * Update an existing audit plan. Invalidates both list and detail caches.
 */
export function useUpdateAuditPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAuditPlanInput }) =>
      api.auditPlans.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.lists() });
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete an audit plan. Invalidates the plans list cache on success.
 */
export function useDeleteAuditPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.auditPlans.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditPlansKeys.lists() });
    },
  });
}
