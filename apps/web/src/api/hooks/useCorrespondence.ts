/**
 * React Query hook for the Correspondence module.
 *
 * Thin Query_Hook in the canonical Query_Hooks layer (`src/api/hooks/*`) and the
 * migration target for consumers that previously imported the Legacy_Hook at
 * `src/hooks/useCorrespondence` (Req 3.2, 3.3). Routes through the composed,
 * typed `api` (single HTTP_Client) — behavior is preserved exactly.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../index';

/**
 * Query params accepted by the Correspondence hook. Mirrors the shared
 * incoming/outgoing/archive query shape and additionally tolerates a `limit`
 * hint used by the dashboard summary view; the value is forwarded to the API
 * as a query parameter, preserving prior behavior.
 */
type CorrespondenceQuery = NonNullable<Parameters<typeof api.correspondence.getIncoming>[0]> & {
  limit?: number;
};

export const useCorrespondence = (initialParams: CorrespondenceQuery = {}) => {
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ['correspondence-stats'],
    queryFn: () => api.correspondence.getStats(),
    staleTime: 2 * 60 * 1000,
  });

  const incomingQuery = useQuery({
    queryKey: ['correspondence-incoming', initialParams],
    queryFn: () => api.correspondence.getIncoming(initialParams),
    staleTime: 1 * 60 * 1000,
  });

  const outgoingQuery = useQuery({
    queryKey: ['correspondence-outgoing', initialParams],
    queryFn: () => api.correspondence.getOutgoing(initialParams),
    staleTime: 1 * 60 * 1000,
  });

  const archiveQuery = useQuery({
    queryKey: ['correspondence-archive', initialParams],
    queryFn: () => api.correspondence.getArchive(initialParams),
    staleTime: 5 * 60 * 1000,
  });

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['correspondence-stats'] });
    queryClient.invalidateQueries({ queryKey: ['correspondence-incoming'] });
    queryClient.invalidateQueries({ queryKey: ['correspondence-outgoing'] });
    queryClient.invalidateQueries({ queryKey: ['correspondence-archive'] });
  }, [queryClient]);

  return {
    stats: statsQuery.data || null,
    incoming: incomingQuery.data || [],
    outgoing: outgoingQuery.data || [],
    archive: archiveQuery.data || [],
    loading: statsQuery.isLoading || incomingQuery.isLoading || outgoingQuery.isLoading,
    error: (statsQuery.error || incomingQuery.error || outgoingQuery.error) ? 'Failed to fetch correspondence data' : null,
    fetchStats: () => queryClient.refetchQueries({ queryKey: ['correspondence-stats'] }),
    fetchIncoming: (params: CorrespondenceQuery) => queryClient.prefetchQuery({ queryKey: ['correspondence-incoming', params], queryFn: () => api.correspondence.getIncoming(params) }),
    fetchOutgoing: (params: CorrespondenceQuery) => queryClient.prefetchQuery({ queryKey: ['correspondence-outgoing', params], queryFn: () => api.correspondence.getOutgoing(params) }),
    fetchArchive: (params: CorrespondenceQuery) => queryClient.prefetchQuery({ queryKey: ['correspondence-archive', params], queryFn: () => api.correspondence.getArchive(params) }),
    refreshAll,
  };
};
