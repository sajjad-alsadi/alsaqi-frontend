import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export const useLookups = () => {
  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const jobTitlesQuery = useQuery({
    queryKey: ['jobTitles'],
    queryFn: () => api.userManagement.getJobTitles(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const usersQuery = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => api.users.list({ pageSize: 1000 }), // Fetch more for lookup
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.userManagement.getRoles(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    departments: Array.isArray(departmentsQuery.data) ? departmentsQuery.data : [],
    jobTitles: Array.isArray(jobTitlesQuery.data) ? jobTitlesQuery.data : [],
    users: Array.isArray(usersQuery.data) ? usersQuery.data : [],
    roles: Array.isArray(rolesQuery.data) ? rolesQuery.data : [],
    isLoading: departmentsQuery.isLoading || jobTitlesQuery.isLoading || usersQuery.isLoading || rolesQuery.isLoading,
    isError: departmentsQuery.isError || jobTitlesQuery.isError || usersQuery.isError || rolesQuery.isError,
    refreshDepartments: () => departmentsQuery.refetch(),
    refreshJobTitles: () => jobTitlesQuery.refetch(),
    refreshUsers: () => usersQuery.refetch(),
    refreshRoles: () => rolesQuery.refetch(),
  };
};
