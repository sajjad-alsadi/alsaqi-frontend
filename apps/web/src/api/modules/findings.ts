/**
 * Findings module API client.
 * Provides typed methods for audit findings endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { AuditFinding, CreateFindingInput, UpdateFindingInput } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

// @ts-expect-error -- Zod .optional() produces T | undefined which conflicts with exactOptionalPropertyTypes
export const FindingSchema: z.ZodType<AuditFinding> = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  audit_id: z.union([z.number(), z.string()]),
  finding_number: z.string().optional(),
  plan_code: z.string().optional(),
  condition: z.string(),
  criteria: z.string(),
  cause: z.string(),
  consequence: z.string(),
  recommendation: z.string(),
  risk_level: z.enum(['Low', 'Medium', 'High']),
  status: z.enum(['Open', 'In Progress', 'Closed']),
});

const FindingListSchema = z.array(FindingSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FindingsApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    audit_id?: string;
    risk_level?: string;
    status?: string;
    search?: string;
  }): Promise<AuditFinding[]>;
  create(data: CreateFindingInput): Promise<AuditFinding>;
  update(id: string, data: UpdateFindingInput): Promise<AuditFinding>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createFindingsApi(client: ApiClient): FindingsApi {
  return {
    list(query) {
      return client.get('/audit-findings', FindingListSchema, { params: query });
    },

    create(data) {
      return client.post('/audit-findings', FindingSchema, data);
    },

    update(id, data) {
      return client.put(`/audit-findings/${id}`, FindingSchema, data);
    },

    delete(id) {
      return client.delete(`/audit-findings/${id}`, DeleteResponseSchema);
    },
  };
}
