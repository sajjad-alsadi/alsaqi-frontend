/**
 * Baseline snapshot of the Zod schemas being relocated to `packages/shared`
 * as part of FIX-FE-3 (tasks 6.2–6.5).
 *
 * These are INDEPENDENT, self-contained copies of the original schema
 * definitions captured BEFORE relocation. They intentionally do NOT import
 * from the API modules, because those modules change when the schemas move.
 *
 * Task 6.6 (Property 1 — schema behavioral equivalence) imports these
 * baselines and compares `safeParse` results of the relocated schemas against
 * them to guarantee behavioral parity.
 *
 * Each schema below is field-for-field identical to its original definition:
 *   - RiskItemSchema        → apps/web/src/api/modules/risk-register.ts
 *   - InstructionSchema     → apps/web/src/api/modules/regulatory.ts
 *   - DashboardStatsSchema  → apps/web/src/api/modules/dashboard.ts
 *       (+ AuditProgressByTypeSchema, RiskLevelBreakdownSchema)
 *   - RoleSchema, PermissionSchema, SessionSchema, SettingsSchema,
 *     JobTitleSchema → apps/web/src/api/modules/user-management.ts
 *
 * DO NOT edit these definitions to "match" relocated schemas. They are a frozen
 * baseline; if a relocated schema diverges, the parity test should fail.
 */
import { z } from 'zod';

// ─── risk-register.ts baseline ─────────────────────────────────────────────────

export const RiskItemSchemaBaseline = z.object({
  id: z.string().optional(),
  risk_id: z.string(),
  description: z.string(),
  owner: z.string(),
  source: z.string(),
  early_warning: z.string(),
  type: z.string(),
  likelihood: z.string(),
  impact: z.string(),
  score: z.number(),
  rating: z.string(),
  controls: z.string(),
  control_assessment: z.string(),
  mitigation: z.string(),
  treatment_option: z.string(),
  residual_likelihood: z.string(),
  residual_impact: z.string(),
  residual_score: z.number(),
  residual_rating: z.string(),
  status: z.string(),
  target_date: z.string(),
  review_date: z.string(),
  notes: z.string(),
  entry_date: z.string(),
  entered_by: z.string(),
});

// ─── regulatory.ts baseline ────────────────────────────────────────────────────

export const InstructionSchemaBaseline = z.object({
  id: z.string().optional(),
  title: z.string(),
  issue_date: z.string(),
  reference_number: z.string(),
  category: z.string(),
  description: z.string(),
  related_department: z.string(),
  attachment: z.string().optional(),
  status: z.string(),
});

// ─── dashboard.ts baseline ─────────────────────────────────────────────────────

export const AuditProgressByTypeSchemaBaseline = z.object({
  type: z.string(),
  planned: z.number(),
  completed: z.number(),
});

export const RiskLevelBreakdownSchemaBaseline = z.object({
  level: z.string(),
  count: z.number(),
});

export const DashboardStatsSchemaBaseline = z.object({
  audits: z.object({
    total: z.number(),
    completed: z.number(),
    progress_by_type: z.array(AuditProgressByTypeSchemaBaseline),
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
    byLevel: z.array(RiskLevelBreakdownSchemaBaseline).optional(),
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

// ─── user-management.ts baseline ───────────────────────────────────────────────

export const RoleSchemaBaseline = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  description: z.string().optional(),
});

export const PermissionSchemaBaseline = z.object({
  id: z.union([z.string(), z.number()]),
  module: z.string(),
  action: z.string(),
});

export const SessionSchemaBaseline = z.object({
  id: z.union([z.string(), z.number()]),
  user_id: z.union([z.string(), z.number()]),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  created_at: z.string().optional(),
  expires_at: z.string().optional(),
});

export const SettingsSchemaBaseline = z.object({
  failed_login_threshold: z.number().optional(),
  inactive_account_threshold_days: z.number().optional(),
  password_min_length: z.number().optional(),
  password_require_uppercase: z.number().optional(),
  password_require_lowercase: z.number().optional(),
  password_require_numbers: z.number().optional(),
  password_require_symbols: z.number().optional(),
  password_expiry_days: z.number().optional(),
  enforce_single_session: z.number().optional(),
  session_timeout_minutes: z.number().optional(),
});

export const JobTitleSchemaBaseline = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  name_ar: z.string().optional(),
  name_en: z.string().optional(),
});

/**
 * Convenience map of every relocated-schema baseline keyed by its canonical
 * (post-relocation) schema name, so task 6.6 can iterate over all schemas.
 */
export const relocatedSchemaBaselines = {
  RiskItemSchema: RiskItemSchemaBaseline,
  InstructionSchema: InstructionSchemaBaseline,
  AuditProgressByTypeSchema: AuditProgressByTypeSchemaBaseline,
  RiskLevelBreakdownSchema: RiskLevelBreakdownSchemaBaseline,
  DashboardStatsSchema: DashboardStatsSchemaBaseline,
  RoleSchema: RoleSchemaBaseline,
  PermissionSchema: PermissionSchemaBaseline,
  SessionSchema: SessionSchemaBaseline,
  SettingsSchema: SettingsSchemaBaseline,
  JobTitleSchema: JobTitleSchemaBaseline,
} as const;
