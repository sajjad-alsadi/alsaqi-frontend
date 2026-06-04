/**
 * Audit Plans module API client.
 * Provides typed methods for audit plan CRUD endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { AuditPlan, CreateAuditPlanInput, UpdateAuditPlanInput } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const AuditPlanSchema = z.object({
  id: z.string().optional(),
  plan_code: z.string().optional(),
  title: z.string(),
  department: z.string(),
  type: z.string(),
  risk_rating: z.enum(['Low', 'Medium', 'High', 'Critical']),
  planned_start_date: z.string(),
  planned_end_date: z.string(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  status: z.enum(['Planned', 'Fieldwork', 'Reporting', 'Closed']),
  lead_auditor: z.string(),
  notes: z.string().optional(),
});

const AuditPlanListSchema = z.array(AuditPlanSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditPlansApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    status?: string;
    department?: string;
  }): Promise<AuditPlan[]>;
  getById(id: string): Promise<AuditPlan>;
  create(data: CreateAuditPlanInput): Promise<AuditPlan>;
  update(id: string, data: UpdateAuditPlanInput): Promise<AuditPlan>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAuditPlansApi(client: ApiClient): AuditPlansApi {
  return {
    list(query) {
      return client.get('/v1/audit-plans', AuditPlanListSchema, { params: query }) as Promise<AuditPlan[]>;
    },

    getById(id) {
      return client.get(`/v1/audit-plans/${id}`, AuditPlanSchema) as Promise<AuditPlan>;
    },

    create(data) {
      return client.post('/v1/audit-plans', AuditPlanSchema, data) as Promise<AuditPlan>;
    },

    update(id, data) {
      return client.put(`/v1/audit-plans/${id}`, AuditPlanSchema, data) as Promise<AuditPlan>;
    },

    delete(id) {
      return client.delete(`/v1/audit-plans/${id}`, DeleteResponseSchema);
    },
  };
}
