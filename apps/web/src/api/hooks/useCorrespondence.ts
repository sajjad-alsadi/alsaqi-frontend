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
  /** Control which queries to enable. Default: all enabled */
  enabled?: {
    stats?: boolean;
    incoming?: boolean;
    outgoing?: boolean;
    archive?: boolean;
  };
};

export const useCorrespondence = (initialParams: CorrespondenceQuery = {}) => {
  const queryClient = useQueryClient();
  const { enabled: enabledConfig, ...queryParams } = initialParams;
  const enableStats = enabledConfig?.stats !== false;
  const enableIncoming = enabledConfig?.incoming !== false;
  const enableOutgoing = enabledConfig?.outgoing !== false;
  const enableArchive = enabledConfig?.archive !== false;

  const statsQuery = useQuery({
    queryKey: ['correspondence-stats'],
    queryFn: () => api.correspondence.getStats(),
    staleTime: 2 * 60 * 1000,
    enabled: enableStats,
  });

  const incomingQuery = useQuery({
    queryKey: ['correspondence-incoming', queryParams],
    queryFn: () => api.correspondence.getIncoming(queryParams),
    staleTime: 1 * 60 * 1000,
    enabled: enableIncoming,
  });

  const outgoingQuery = useQuery({
    queryKey: ['correspondence-outgoing', queryParams],
    queryFn: () => api.correspondence.getOutgoing(queryParams),
    staleTime: 1 * 60 * 1000,
    enabled: enableOutgoing,
  });

  const archiveQuery = useQuery({
    queryKey: ['correspondence-archive', queryParams],
    queryFn: () => api.correspondence.getArchive(queryParams),
    staleTime: 5 * 60 * 1000,
    enabled: enableArchive,
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
