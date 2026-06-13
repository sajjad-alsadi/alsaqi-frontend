/**
 * Audit Plans module API client.
 * Provides typed methods for audit plan CRUD endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { AuditPlan, CreateAuditPlanInput, UpdateAuditPlanInput } from '@alsaqi/shared';
import { metaPagination } from '../utils/envelope';

// ─── Response Schemas ─────────────────────────────────────────────────────────

export const AuditPlanSchema = z.object({
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

/**
 * A page of audit plans plus the server-driven pagination totals.
 *
 * `total` and `totalPages` are read from the `Response_Envelope` `meta.pagination`
 * block, NOT computed from `items.length` (Req 21.1, 21.2). This lets paginated
 * screens report the true server record count even when the current page holds
 * fewer rows than `pageSize`.
 */
export interface PaginatedAuditPlans {
  items: AuditPlan[];
  total: number;
  totalPages: number;
}

export interface AuditPlansApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    status?: string;
    department?: string;
    type?: string;
    search?: string;
  }): Promise<PaginatedAuditPlans>;
  getById(id: string): Promise<AuditPlan>;
  create(data: CreateAuditPlanInput): Promise<AuditPlan>;
  update(id: string, data: UpdateAuditPlanInput): Promise<AuditPlan>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAuditPlansApi(client: ApiClient): AuditPlansApi {
  return {
    async list(query) {
      // Forward page/pageSize (and filters) to the server (Req 21.3) and read
      // the pagination totals from the envelope meta rather than the page length.
      const { data, meta } = await client.getWithMeta('/v1/audit-plans', AuditPlanListSchema, {
        params: query,
      });
      const items = data as AuditPlan[];
      const { total, totalPages } = metaPagination(meta, items.length);
      return { items, total, totalPages };
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
