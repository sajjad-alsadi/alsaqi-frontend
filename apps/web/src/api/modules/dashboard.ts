/**
 * Dashboard module API client.
 * Provides typed methods for dashboard statistics endpoint.
 *
 * Typed equivalent of: api/compat/dashboardService.ts
 */
import { z } from 'zod';
import type { DashboardStats } from '@alsaqi/shared';
import type { ApiClient } from '../client';

// Re-export the shared type so existing consumers of this module keep working.
export type { DashboardStats } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const AuditProgressByTypeSchema = z.object({
  type: z.string(),
  planned: z.number(),
  completed: z.number(),
});

const RiskLevelBreakdownSchema = z.object({
  level: z.string(),
  count: z.number(),
});

/**
 * Typed schema for `GET /v1/dashboard-stats`.
 * Mirrors the grouped backend response described by {@link DashboardStats}.
 *
 * The schema type is inferred from the `z.object({...})` shape rather than
 * annotated as `z.ZodType<DashboardStats>`. Zod v4's `.optional()` produces an
 * optional key (`{ byLevel?: ... }`), which is exactly what
 * `exactOptionalPropertyTypes` requires, so no suppression is needed. The
 * `_dashboardStatsContract` assertion below keeps the inferred type and
 * {@link DashboardStats} in lockstep at compile time.
 */
export const DashboardStatsSchema = z.object({
  audits: z.object({
    total: z.number(),
    completed: z.number(),
    progress_by_type: z.array(AuditProgressByTypeSchema),
  }),
  findings: z.object({
    summary: z.object({
      open: z.number(),
      high_risk_open: z.number(),
    }),
  }),
  recommendations: z.object({
    open: z.number(),
    overdue: z.number(),
  }),
  risks: z.object({
    summary: z.object({
      total: z.number(),
      high: z.number(),
    }),
    byLevel: z.array(RiskLevelBreakdownSchema).optional(),
  }),
  correspondence: z.object({
    incoming_total: z.number(),
    outgoing_total: z.number(),
    pending_responses: z.number(),
  }),
  compliance: z.object({
    total: z.number(),
  }),
  activity: z.array(z.record(z.string(), z.unknown())),
});

/**
 * Compile-time only: assert the inferred schema type stays assignable to the
 * shared {@link DashboardStats} type under `exactOptionalPropertyTypes`. Never
 * executed at runtime; it exists solely so a drift between the schema and the
 * shared type surfaces as a `tsc` error.
 */
const _dashboardStatsContract: DashboardStats = {} as z.infer<typeof DashboardStatsSchema>;
void _dashboardStatsContract;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardApi {
  getStats(department?: string): Promise<DashboardStats>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDashboardApi(client: ApiClient): DashboardApi {
  return {
    getStats(department) {
      const params = department && department !== 'all' ? { department } : undefined;
      return client.get('/v1/dashboard-stats', DashboardStatsSchema, { params });
    },
  };
}
