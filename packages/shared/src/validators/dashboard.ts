/**
 * Dashboard statistics validation schemas.
 * Single source of validation truth for both API and Frontend.
 */
import { z } from 'zod';
import type {
  AuditProgressByType,
  DashboardStats,
  RiskLevelBreakdown,
} from '../types/models';

/**
 * A single row in the audit progress-by-type breakdown.
 *
 * Field definitions and validation rules are identical to the original
 * schema previously defined in apps/web/src/api/modules/dashboard.ts.
 */
export const AuditProgressByTypeSchema = z.object({
  type: z.string(),
  planned: z.number(),
  completed: z.number(),
});

/**
 * A single risk-level bucket in the dashboard risk overview.
 *
 * Field definitions and validation rules are identical to the original
 * schema previously defined in apps/web/src/api/modules/dashboard.ts.
 */
export const RiskLevelBreakdownSchema = z.object({
  level: z.string(),
  count: z.number(),
});

/**
 * Aggregated dashboard statistics response schema.
 * Maps to `GET /v1/dashboard-stats` and mirrors the grouped backend response.
 *
 * Field definitions and validation rules are identical to the original schema
 * previously defined in apps/web/src/api/modules/dashboard.ts. The type is
 * derived via z.infer (FIX-FE-4 pattern: no z.ZodType<T> annotation) so the
 * schema and its type cannot drift. Zod v4's `.optional()` produces an optional
 * key (`{ byLevel?: ... }`), which is exactly what `exactOptionalPropertyTypes`
 * requires, so no suppression is needed.
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
 * Inferred types for the dashboard schemas.
 *
 * Exported under non-conflicting names (the canonical `DashboardStats`,
 * `AuditProgressByType`, and `RiskLevelBreakdown` models live in
 * types/models.ts and are re-exported from the package root). The compile-time
 * assertions below guarantee the inferred types stay assignable to those
 * models.
 */
export type AuditProgressByTypeValidated = z.infer<typeof AuditProgressByTypeSchema>;
export type RiskLevelBreakdownValidated = z.infer<typeof RiskLevelBreakdownSchema>;
export type DashboardStatsValidated = z.infer<typeof DashboardStatsSchema>;

// Compile-time assertions: keep the inferred schema types in lockstep with the
// shared models under exactOptionalPropertyTypes, without a `z.ZodType<T>`
// annotation or any suppression.
const _auditProgressByTypeContract: AuditProgressByType = {} as AuditProgressByTypeValidated;
void _auditProgressByTypeContract;

const _riskLevelBreakdownContract: RiskLevelBreakdown = {} as RiskLevelBreakdownValidated;
void _riskLevelBreakdownContract;

const _dashboardStatsContract: DashboardStats = {} as DashboardStatsValidated;
void _dashboardStatsContract;
