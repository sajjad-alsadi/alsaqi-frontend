/**
 * Regulatory (central bank instructions) validation schemas.
 * Single source of validation truth for both API and Frontend.
 */
import { z } from 'zod';
import type { CentralBankInstruction } from '../types/models';

/**
 * Central bank instruction response schema.
 * Maps to the central-bank-instructions endpoints.
 *
 * Field definitions and validation rules are identical to the original
 * schema previously defined in apps/web/src/api/modules/regulatory.ts.
 * The type is derived via z.infer (FIX-FE-4 pattern: no z.ZodType<T>
 * annotation) so the schema and its type cannot drift.
 */
export const InstructionSchema = z.object({
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

/**
 * Inferred type for the instruction schema.
 *
 * Exported under a non-conflicting name (the canonical `CentralBankInstruction`
 * model lives in types/models.ts and is re-exported from the package root). The
 * compile-time assertion below guarantees the inferred type stays assignable to
 * that model.
 */
export type InstructionValidated = z.infer<typeof InstructionSchema>;

// Compile-time assertion: keep the inferred schema type in lockstep with the
// shared CentralBankInstruction model under exactOptionalPropertyTypes, without
// a `z.ZodType<T>` annotation or any suppression.
const _instructionContract: CentralBankInstruction = {} as InstructionValidated;
void _instructionContract;
