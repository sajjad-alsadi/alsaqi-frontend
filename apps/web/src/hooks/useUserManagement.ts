import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../api/compat/userService';
import toast from 'react-hot-toast';

export const useUserManagement = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['users', initialParams],
    queryFn: () => userService.getUsers(initialParams),
    staleTime: 5 * 60 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: ['users-summary'],
    queryFn: () => userService.getSummary(),
    staleTime: 5 * 60 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => userService.getRoles(),
    staleTime: 30 * 60 * 1000,
  });

  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: () => userService.getPermissions(),
    staleTime: 60 * 60 * 1000,
  });

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => userService.getSessions(),
    staleTime: 1 * 60 * 1000, // Refresh sessions more often
  });

  const settingsQuery = useQuery({
    queryKey: ['user-management-settings'],
    queryFn: () => userService.getSettings(),
  });

  const loginHistoryQuery = useQuery({
    queryKey: ['login-history', initialParams.historyPage],
    queryFn: () => userService.getLoginHistory({ page: initialParams.historyPage || 1, pageSize: 50 }),
  });

  const auditTrailQuery = useQuery({
    queryKey: ['audit-trail', initialParams.auditPage],
    queryFn: () => userService.getAuditTrail({ page: initialParams.auditPage || 1, pageSize: 50 }),
  });

  const resetRequestsQuery = useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: () => userService.getResetRequests(),
  });

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => userService.getDepartments(),
  });

  const jobTitlesQuery = useQuery({
    queryKey: ['jobTitles'],
    queryFn: () => userService.getJobTitles(),
  });

  // Mutations
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => userService.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated successfully');
    },
    onError: (err: any) => {
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
    users: usersQuery.data?.data || [],
    summary: summaryQuery.data || null,
    roles: Array.isArray(rolesQuery.data) ? rolesQuery.data : (rolesQuery.data as any)?.data || [],
    permissions: Array.isArray(permissionsQuery.data) ? permissionsQuery.data : (permissionsQuery.data as any)?.data || [],
    sessions: Array.isArray(sessionsQuery.data) ? sessionsQuery.data : (sessionsQuery.data as any)?.data || [],
    settings: settingsQuery.data || null,
    loginHistory: loginHistoryQuery.data?.data || [],
    auditTrail: auditTrailQuery.data?.data || [],
    resetRequests: Array.isArray(resetRequestsQuery.data) ? resetRequestsQuery.data : (resetRequestsQuery.data as any)?.requests || [],
    departments: Array.isArray(departmentsQuery.data) ? departmentsQuery.data : (departmentsQuery.data as any)?.departments || [],
    jobTitles: Array.isArray(jobTitlesQuery.data) ? jobTitlesQuery.data : (jobTitlesQuery.data as any)?.jobTitles || [],
    loading: usersQuery.isLoading || summaryQuery.isLoading,
    error: usersQuery.error ? (usersQuery.error as any).message : null,
    pagination: usersQuery.data?.pagination || { total: 0, page: 1, pageSize: 10, totalPages: 0 },
    historyPagination: loginHistoryQuery.data?.pagination || { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    activityPagination: auditTrailQuery.data?.pagination || { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    fetchUsers: (params: any) => queryClient.prefetchQuery({ queryKey: ['users', params], queryFn: () => userService.getUsers(params) }),
    fetchLoginHistory: (params: any) => queryClient.prefetchQuery({ queryKey: ['login-history', params], queryFn: () => userService.getLoginHistory(params) }),
    fetchAuditTrail: (params: any) => queryClient.prefetchQuery({ queryKey: ['audit-trail', params], queryFn: () => userService.getAuditTrail(params) }),
    refreshAll,
    updateUser: updateUserMutation.mutateAsync
  };
};

