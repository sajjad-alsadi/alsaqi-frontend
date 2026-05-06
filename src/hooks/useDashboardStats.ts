import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';

export const useDashboardStats = (department?: string) => {
  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', department],
    queryFn: () => dashboardService.getStats(department),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  return { 
    stats: statsQuery.data || null, 
    loading: statsQuery.isLoading, 
    error: statsQuery.error ? (statsQuery.error as any).message : null, 
    refresh: () => statsQuery.refetch() 
  };
};

