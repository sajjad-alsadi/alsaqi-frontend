import { useQuery } from '@tanstack/react-query';
import { userService } from '../services/userService';

export const useLookups = () => {
  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => userService.getDepartments(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const jobTitlesQuery = useQuery({
    queryKey: ['jobTitles'],
    queryFn: () => userService.getJobTitles(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const usersQuery = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => userService.getUsers({ pageSize: 1000 }), // Fetch more for lookup
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => userService.getRoles(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    departments: Array.isArray(departmentsQuery.data) ? departmentsQuery.data : (departmentsQuery.data as any)?.departments || [],
    jobTitles: Array.isArray(jobTitlesQuery.data) ? jobTitlesQuery.data : (jobTitlesQuery.data as any)?.jobTitles || [],
    users: usersQuery.data?.data || [],
    roles: rolesQuery.data?.data || [],
    isLoading: departmentsQuery.isLoading || jobTitlesQuery.isLoading || usersQuery.isLoading || rolesQuery.isLoading,
    isError: departmentsQuery.isError || jobTitlesQuery.isError || usersQuery.isError || rolesQuery.isError,
    refreshDepartments: () => departmentsQuery.refetch(),
    refreshJobTitles: () => jobTitlesQuery.refetch(),
    refreshUsers: () => usersQuery.refetch(),
    refreshRoles: () => rolesQuery.refetch(),
  };
};
