import { useQuery, useQueryClient } from '@tanstack/react-query';
import { riskService } from '../services/riskService';

export const useRisks = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const risksQuery = useQuery({
    queryKey: ['risks', initialParams],
    queryFn: () => riskService.getRisks(initialParams),
    staleTime: 5 * 60 * 1000,
  });

  const data = risksQuery.data || {};
  const risks = (data.data || (Array.isArray(data) ? data : [])) as any[];

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
