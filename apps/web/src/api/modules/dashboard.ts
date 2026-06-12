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
 */
// @ts-expect-error -- Zod .optional() produces T | undefined which conflicts with exactOptionalPropertyTypes
export const DashboardStatsSchema: z.ZodType<DashboardStats> = z.object({
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
