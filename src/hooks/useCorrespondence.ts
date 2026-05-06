import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { correspondenceService } from '../services/correspondenceService';

export const useCorrespondence = (initialParams: any = {}) => {
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ['correspondence-stats'],
    queryFn: () => correspondenceService.getStats(),
    staleTime: 2 * 60 * 1000,
  });

  const incomingQuery = useQuery({
    queryKey: ['correspondence-incoming', initialParams],
    queryFn: () => correspondenceService.getIncoming(initialParams),
    staleTime: 1 * 60 * 1000,
  });

  const outgoingQuery = useQuery({
    queryKey: ['correspondence-outgoing', initialParams],
    queryFn: () => correspondenceService.getOutgoing(initialParams),
    staleTime: 1 * 60 * 1000,
  });

  const archiveQuery = useQuery({
    queryKey: ['correspondence-archive', initialParams],
    queryFn: () => correspondenceService.getArchive(initialParams),
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
    fetchIncoming: (params: any) => queryClient.prefetchQuery({ queryKey: ['correspondence-incoming', params], queryFn: () => correspondenceService.getIncoming(params) }),
    fetchOutgoing: (params: any) => queryClient.prefetchQuery({ queryKey: ['correspondence-outgoing', params], queryFn: () => correspondenceService.getOutgoing(params) }),
    fetchArchive: (params: any) => queryClient.prefetchQuery({ queryKey: ['correspondence-archive', params], queryFn: () => correspondenceService.getArchive(params) }),
    refreshAll
  };
};

