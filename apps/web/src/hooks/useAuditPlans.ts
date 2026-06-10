import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export const useAuditPlans = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const plansQuery = useQuery({
    queryKey: ['audit-plans', initialParams],
    queryFn: () => api.auditPlans.list(initialParams),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const plans = Array.isArray(plansQuery.data) ? plansQuery.data : [];
  const pagination = {
    total: plans.length,
    totalPages: Math.ceil(plans.length / (initialParams.pageSize || 15)),
    page: initialParams.page || 1,
    limit: initialParams.pageSize || 15
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
