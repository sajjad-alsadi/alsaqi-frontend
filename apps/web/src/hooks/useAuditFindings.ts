import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auditService } from '../api/compat/auditService';

export const useAuditFindings = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const findingsQuery = useQuery({
    queryKey: ['audit-findings', initialParams],
    queryFn: () => auditService.getFindings(initialParams),
    staleTime: 5 * 60 * 1000,
  });

  const data = findingsQuery.data || {};
  const findings = (data.data || (Array.isArray(data) ? data : [])) as any[];

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
