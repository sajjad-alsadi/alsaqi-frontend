import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auditService } from '../services/auditService';

export const useAuditPlans = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const plansQuery = useQuery({
    queryKey: ['audit-plans', initialParams],
    queryFn: () => auditService.getPlans(initialParams),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const data = plansQuery.data || {};
  const plans = (data.data || (Array.isArray(data) ? data : [])) as any[];
  const pagination = {
    total: data.pagination?.total || 0,
    totalPages: data.pagination?.totalPages || 0,
    page: data.pagination?.page || 1,
    limit: data.pagination?.pageSize || 15
  };

  const fetchPlans = (_params?: any) => {
    queryClient.invalidateQueries({ queryKey: ['audit-plans'] });
  };

  return { 
    plans, 
    loading: plansQuery.isLoading || plansQuery.isFetching, 
    error: plansQuery.error ? (plansQuery.error as any).message : null, 
    pagination, 
    fetchPlans 
  };
};
