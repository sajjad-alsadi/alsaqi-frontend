/**
 * TanStack Query freshness tier configuration.
 *
 * Defines stale times per data category so the UI can serve cached data
 * immediately (stale-while-revalidate) while background refetches keep
 * things current. The global QueryClient uses `referenceData` (5 min) as
 * the default; individual queries override via these constants or by
 * calling `getStaleTimeForQuery`.
 *
 * Requirements: 3.4, 5.6
 */

// ---------------------------------------------------------------------------
// Stale time constants (milliseconds)
// ---------------------------------------------------------------------------

export const QUERY_STALE_TIMES = {
  /** 5 min — departments, job titles, org structure, compliance matrix */
  referenceData: 5 * 60 * 1000,
  /** 1 min — notifications, audit trail, unread count */
  volatileData: 1 * 60 * 1000,
  /** 30 min — system settings, user profile, feature flags */
  rarelyChanging: 30 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Freshness tier definitions
// ---------------------------------------------------------------------------

export interface QueryFreshnessConfig {
  category: 'referenceData' | 'volatileData' | 'rarelyChanging';
  staleTime: number;
  gcTime: number;
  queryKeyPrefixes: string[];
}

export const FRESHNESS_TIERS: QueryFreshnessConfig[] = [
  {
    category: 'referenceData',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryKeyPrefixes: ['departments', 'job-titles', 'org-structure', 'compliance-matrix'],
  },
  {
    category: 'volatileData',
    staleTime: 1 * 60_000,
    gcTime: 5 * 60_000,
    queryKeyPrefixes: ['notifications', 'audit-trail', 'unread-count'],
  },
  {
    category: 'rarelyChanging',
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    queryKeyPrefixes: ['settings', 'user-profile', 'feature-flags'],
  },
];

// ---------------------------------------------------------------------------
// Helper: resolve staleTime from a query key
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate `staleTime` for a query based on the first element
 * of its key array. Matches against `queryKeyPrefixes` in each freshness tier.
 *
 * Falls back to `QUERY_STALE_TIMES.referenceData` (5 min) when no tier matches,
 * which aligns with the global QueryClient default.
 *
 * @example
 * getStaleTimeForQuery(['notifications', 'unread']) // 60_000  (volatile)
 * getStaleTimeForQuery(['settings', 'theme'])       // 1_800_000 (rarely-changing)
 * getStaleTimeForQuery(['departments', 'list'])     // 300_000 (reference-data)
 * getStaleTimeForQuery(['unknown-key'])             // 300_000 (default)
 */
export function getStaleTimeForQuery(queryKey: string[]): number {
  const prefix = queryKey[0];
  if (!prefix) return QUERY_STALE_TIMES.referenceData;

  for (const tier of FRESHNESS_TIERS) {
    if (tier.queryKeyPrefixes.includes(prefix)) {
      return tier.staleTime;
    }
  }

  return QUERY_STALE_TIMES.referenceData;
}
