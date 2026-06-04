/**
 * Risk Register module API client.
 * Provides typed methods for risk register CRUD endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { RiskItem } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const RiskItemSchema: z.ZodType<RiskItem> = z.object({
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

const RiskItemListSchema = z.array(RiskItemSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateRiskItemInput = Omit<RiskItem, 'id'>;
export type UpdateRiskItemInput = Partial<Omit<RiskItem, 'id'>>;

export interface RiskRegisterApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    status?: string;
    rating?: string;
  }): Promise<RiskItem[]>;
  getById(id: string): Promise<RiskItem>;
  create(data: CreateRiskItemInput): Promise<RiskItem>;
  update(id: string, data: UpdateRiskItemInput): Promise<RiskItem>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRiskRegisterApi(client: ApiClient): RiskRegisterApi {
  return {
    list(query) {
      return client.get('/v1/risk-register', RiskItemListSchema, { params: query });
    },

    getById(id) {
      return client.get(`/v1/risk-register/${id}`, RiskItemSchema);
    },

    create(data) {
      return client.post('/v1/risk-register', RiskItemSchema, data);
    },

    update(id, data) {
      return client.put(`/v1/risk-register/${id}`, RiskItemSchema, data);
    },

    delete(id) {
      return client.delete(`/v1/risk-register/${id}`, DeleteResponseSchema);
    },
  };
}
