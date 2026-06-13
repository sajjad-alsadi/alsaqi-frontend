/**
 * React Query hook for the Risk Register list.
 *
 * Thin Query_Hook in the canonical Query_Hooks layer (`src/api/hooks/*`) and the
 * migration target for consumers that previously imported the Legacy_Hook at
 * `src/hooks/useRisks` (Req 3.2, 3.3). Routes through the composed, typed `api`
 * (single HTTP_Client) — behavior is preserved exactly.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../index';

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
    fetchRisks,
  };
};
