/**
 * Risk Register module API client.
 * Provides typed methods for risk register CRUD endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import { RiskItemSchema, type RiskItem } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────
// `RiskItemSchema` is the single source of validation truth, relocated to
// `@alsaqi/shared` (packages/shared/src/validators/risk-register.ts).

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
    type?: string;
    rating?: string;
    status?: string;
    search?: string;
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
      return client.get('/risk-register', RiskItemListSchema, { params: query });
    },

    getById(id) {
      return client.get(`/risk-register/${id}`, RiskItemSchema);
    },

    create(data) {
      return client.post('/risk-register', RiskItemSchema, data);
    },

    update(id, data) {
      return client.put(`/risk-register/${id}`, RiskItemSchema, data);
    },

    delete(id) {
      return client.delete(`/risk-register/${id}`, DeleteResponseSchema);
    },
  };
}
