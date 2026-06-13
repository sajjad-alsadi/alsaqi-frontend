/**
 * React Query hook for the User Management screen.
 *
 * Thin/composite Query_Hook in the canonical Query_Hooks layer
 * (`src/api/hooks/*`) and the migration target for consumers that previously
 * imported the Legacy_Hook at `src/hooks/useUserManagement` (Req 3.2, 3.3).
 * Routes through the composed, typed `api` (single HTTP_Client) — behavior is
 * preserved exactly.
 */
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateUserInput } from '@alsaqi/shared';
import { api } from '../index';
import toast from 'react-hot-toast';

/**
 * Query params accepted by the User Management screen. Combines the `/v1/users`
 * list query with the screen-specific pagination cursors (`historyPage`,
 * `auditPage`) read directly off the params object.
 */
interface UserManagementParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string | undefined;
  status?: string | undefined;
  department?: string | undefined;
  historyPage?: number;
  auditPage?: number;
}

type UsersQuery = NonNullable<Parameters<typeof api.users.list>[0]>;
type LoginHistoryQuery = NonNullable<Parameters<typeof api.userManagement.getLoginHistory>[0]>;
type AuditTrailQuery = NonNullable<Parameters<typeof api.userManagement.getAuditTrail>[0]>;

export const useUserManagement = (initialParams: UserManagementParams = {}) => {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['users', initialParams],
    queryFn: async () => {
      // `init()` primes server-side state but must never block the list: if the
      // endpoint is missing or errors, swallow it so the users list still loads.
      try {
        await api.userManagement.init();
      } catch {
        /* non-fatal: proceed to load the list regardless */
      }
      return api.users.list(initialParams as UsersQuery);
    },
    staleTime: 5 * 60 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: ['users-summary'],
    queryFn: () => api.userManagement.getSummary(),
    staleTime: 5 * 60 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.userManagement.getRoles(),
    staleTime: 30 * 60 * 1000,
  });

  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.userManagement.getPermissions(),
    staleTime: 60 * 60 * 1000,
  });

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.userManagement.getSessions(),
    staleTime: 1 * 60 * 1000, // Refresh sessions more often
  });

  const settingsQuery = useQuery({
    queryKey: ['user-management-settings'],
    queryFn: () => api.userManagement.getSettings(),
  });

  const loginHistoryQuery = useQuery({
    queryKey: ['login-history', initialParams.historyPage],
    queryFn: () => api.userManagement.getLoginHistory({ page: initialParams.historyPage || 1, pageSize: 50 }),
  });

  const auditTrailQuery = useQuery({
    queryKey: ['audit-trail', initialParams.auditPage],
    queryFn: () => api.userManagement.getAuditTrail({ page: initialParams.auditPage || 1, pageSize: 50 }),
  });

  const resetRequestsQuery = useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: () => api.userManagement.getResetRequests(),
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list(),
  });

  const jobTitlesQuery = useQuery({
    queryKey: ['jobTitles'],
    queryFn: () => api.userManagement.getJobTitles(),
  });

  // Mutations
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) => api.users.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to update user: ${err.message}`);
    }
  });

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['users-summary'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
  }, [queryClient]);

  return {
    users: usersQuery.data || [],
    summary: summaryQuery.data || null,
    roles: Array.isArray(rolesQuery.data) ? rolesQuery.data : [],
    permissions: Array.isArray(permissionsQuery.data) ? permissionsQuery.data : [],
    sessions: Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [],
    settings: settingsQuery.data || null,
    loginHistory: Array.isArray(loginHistoryQuery.data) ? loginHistoryQuery.data : [],
    auditTrail: Array.isArray(auditTrailQuery.data) ? auditTrailQuery.data : [],
    resetRequests: Array.isArray(resetRequestsQuery.data) ? resetRequestsQuery.data : [],
    departments: Array.isArray(departmentsQuery.data) ? departmentsQuery.data : [],
    jobTitles: Array.isArray(jobTitlesQuery.data) ? jobTitlesQuery.data : [],
    loading: usersQuery.isLoading || summaryQuery.isLoading,
    error: usersQuery.error ? usersQuery.error.message : null,
    pagination: { total: Array.isArray(usersQuery.data) ? usersQuery.data.length : 0, page: 1, pageSize: 10, totalPages: 0 },
    historyPagination: { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    activityPagination: { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    fetchUsers: (params: UsersQuery) => queryClient.prefetchQuery({ queryKey: ['users', params], queryFn: () => api.users.list(params) }),
    fetchLoginHistory: (params: LoginHistoryQuery) => queryClient.prefetchQuery({ queryKey: ['login-history', params], queryFn: () => api.userManagement.getLoginHistory(params) }),
    fetchAuditTrail: (params: AuditTrailQuery) => queryClient.prefetchQuery({ queryKey: ['audit-trail', params], queryFn: () => api.userManagement.getAuditTrail(params) }),
    refreshAll,
    updateUser: updateUserMutation.mutateAsync
  };
};
