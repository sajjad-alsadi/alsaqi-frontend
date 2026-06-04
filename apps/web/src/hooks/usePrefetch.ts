import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/httpClient';

/**
 * Hook for prefetching page data on hover/focus.
 * When the user hovers over a sidebar link, the data for that page
 * starts loading in the background so navigation feels instant.
 * 
 * Uses React Query's prefetchQuery to cache the result.
 * 
 * @example
 * const { prefetch } = usePrefetch();
 * 
 * <button 
 *   onMouseEnter={() => prefetch('audit-plans', '/audit-plans')}
 *   onClick={() => navigate('/plan')}
 * >
 *   Audit Plan
 * </button>
 */
export function usePrefetch() {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetch = useCallback((queryKey: string, endpoint: string) => {
    // Only prefetch once per session
    if (prefetchedRef.current.has(queryKey)) return;
    prefetchedRef.current.add(queryKey);

    queryClient.prefetchQuery({
      queryKey: [queryKey],
      queryFn: async () => {
        const res = await api.get(endpoint);
        return res.data;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
    });
  }, [queryClient]);

  return { prefetch };
}
