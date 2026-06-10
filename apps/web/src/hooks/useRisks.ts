import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export const useRisks = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const risksQuery = useQuery({
    queryKey: ['risks', initialParams],
    queryFn: () => api.riskRegister.list(initialParams),
    staleTime: 5 * 60 * 1000,
  });

  const risks = Array.isArray(risksQuery.data) ? risksQuery.data : [];

  const fetchRisks = () => {
    queryClient.invalidateQueries({ queryKey: ['risks'] });
  };

  return { 
    risks, 
    loading: risksQuery.isLoading || risksQuery.isFetching, 
    error: risksQuery.error ? (risksQuery.error as any).message : null, 
    fetchRisks 
  };
};
