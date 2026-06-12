/**
 * Risk register validation schemas.
 * Single source of validation truth for both API and Frontend.
 */
import { z } from 'zod';
import type { RiskItem } from '../types/models';

/**
 * Risk item response schema.
 * Maps to the risk-register endpoints.
 *
 * Field definitions and validation rules are identical to the original
 * schema previously defined in apps/web/src/api/modules/risk-register.ts.
 * The type is derived via z.infer (FIX-FE-4 pattern: no z.ZodType<T>
 * annotation) so the schema and its type cannot drift.
 */
export const RiskItemSchema = z.object({
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

/**
 * Inferred type for the risk item schema.
 *
 * Exported under a non-conflicting name (the canonical `RiskItem` model lives
 * in types/models.ts and is re-exported from the package root). The compile-time
 * assertion below guarantees the inferred type stays assignable to that model.
 */
export type RiskItemValidated = z.infer<typeof RiskItemSchema>;

// Compile-time assertion: keep the inferred schema type in lockstep with the
// shared RiskItem model under exactOptionalPropertyTypes, without a
// `z.ZodType<T>` annotation or any suppression.
const _riskItemContract: RiskItem = {} as RiskItemValidated;
void _riskItemContract;
