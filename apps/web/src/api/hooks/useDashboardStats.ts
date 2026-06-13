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

/**
 * Permissive view of the dashboard-stats payload as actually consumed by this
 * hook. The backend response is wider than the strict `DashboardStats` model
 * (it includes transient fields such as `audits.in_progress`, `audits.delayed`,
 * `findings.summary.total`, `findings.byRisk`, and `recommendations.total`), so
 * every field is treated as optional here and normalised with safe defaults
 * below. Numeric leaves are read as numbers; collection leaves stay `unknown[]`
 * and are narrowed by the presentational components that render them.
 */
interface RawDashboardStats {
  audits?: {
    total?: number;
    completed?: number;
    in_progress?: number;
    delayed?: number;
    progress_by_type?: unknown[];
  };
  findings?: {
    summary?: { total?: number; open?: number; high_risk_open?: number };
    byRisk?: unknown[];
  };
  recommendations?: { total?: number; open?: number; overdue?: number };
  risks?: {
    summary?: { total?: number; high?: number };
    byLevel?: unknown[] | undefined;
  };
  correspondence?: {
    incoming_total?: number;
    outgoing_total?: number;
    pending_responses?: number;
  };
  compliance?: { total?: number };
  activity?: unknown[];
}

export const useDashboardStats = (department?: string) => {
  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', department],
    queryFn: () => api.dashboard.getStats(department),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Ensure stats has the expected structure with safe defaults
  const rawStats: RawDashboardStats | undefined = statsQuery.data;
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
    error: statsQuery.error ? statsQuery.error.message : null,
    refresh: () => statsQuery.refetch()
  };
};
