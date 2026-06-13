/**
 * React Query hook for the Dashboard summary statistics.
 *
 * Thin Query_Hook in the canonical Query_Hooks layer (`src/api/hooks/*`) and the
 * migration target for consumers that previously imported the Legacy_Hook at
 * `src/hooks/useDashboardStats` (Req 3.2, 3.3). Routes through the composed,
 * typed `api` (single HTTP_Client) — behavior is preserved exactly.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../index';

export const useDashboardStats = (department?: string) => {
  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', department],
    queryFn: () => api.dashboard.getStats(department),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Ensure stats has the expected structure with safe defaults
  const rawStats = statsQuery.data as any;
  const stats = rawStats ? {
    audits: {
      total: rawStats.audits?.total ?? 0,
      completed: rawStats.audits?.completed ?? 0,
      in_progress: rawStats.audits?.in_progress ?? 0,
      delayed: rawStats.audits?.delayed ?? 0,
      progress_by_type: rawStats.audits?.progress_by_type ?? []
    },
    findings: {
      summary: {
        total: rawStats.findings?.summary?.total ?? 0,
        open: rawStats.findings?.summary?.open ?? 0,
        high_risk_open: rawStats.findings?.summary?.high_risk_open ?? 0
      },
      byRisk: rawStats.findings?.byRisk ?? []
    },
    recommendations: {
      total: rawStats.recommendations?.total ?? 0,
      open: rawStats.recommendations?.open ?? 0,
      overdue: rawStats.recommendations?.overdue ?? 0
    },
    risks: {
      summary: {
        total: rawStats.risks?.summary?.total ?? 0,
        high: rawStats.risks?.summary?.high ?? 0
      },
      byLevel: rawStats.risks?.byLevel ?? []
    },
    correspondence: {
      incoming_total: rawStats.correspondence?.incoming_total ?? 0,
      outgoing_total: rawStats.correspondence?.outgoing_total ?? 0,
      pending_responses: rawStats.correspondence?.pending_responses ?? 0
    },
    compliance: {
      total: rawStats.compliance?.total ?? 0
    },
    activity: rawStats.activity ?? []
  } : null;

  return {
    stats,
    loading: statsQuery.isLoading,
    error: statsQuery.error ? (statsQuery.error as any).message : null,
    refresh: () => statsQuery.refetch()
  };
};
