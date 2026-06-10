import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export const useAuditFindings = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const findingsQuery = useQuery({
    queryKey: ['audit-findings', initialParams],
    queryFn: () => api.findings.list(initialParams),
    staleTime: 5 * 60 * 1000,
  });

  const findings = Array.isArray(findingsQuery.data) ? findingsQuery.data : [];

  const fetchFindings = () => {
    queryClient.invalidateQueries({ queryKey: ['audit-findings'] });
  };

  return { 
    findings, 
    loading: findingsQuery.isLoading || findingsQuery.isFetching, 
    error: findingsQuery.error ? (findingsQuery.error as any).message : null, 
    fetchFindings 
  };
};
