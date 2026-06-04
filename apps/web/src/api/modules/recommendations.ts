/**
 * Recommendations module API client.
 * Provides typed methods for recommendation CRUD endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { Recommendation } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const RecommendationSchema: z.ZodType<Recommendation> = z.object({
  id: z.number().optional(),
  finding_id: z.number(),
  department: z.string(),
  responsible: z.string(),
  due_date: z.string(),
  status: z.enum(['Open', 'In Progress', 'Implemented', 'Overdue']),
  risk_level: z.enum(['Low', 'Medium', 'High']),
});

const RecommendationListSchema = z.array(RecommendationSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateRecommendationInput {
  finding_id: number;
  department: string;
  responsible: string;
  due_date: string;
  status?: 'Open' | 'In Progress' | 'Implemented' | 'Overdue';
  risk_level: 'Low' | 'Medium' | 'High';
}

export interface UpdateRecommendationInput {
  department?: string;
  responsible?: string;
  due_date?: string;
  status?: 'Open' | 'In Progress' | 'Implemented' | 'Overdue';
  risk_level?: 'Low' | 'Medium' | 'High';
}

export interface RecommendationsApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    status?: string;
    finding_id?: number;
  }): Promise<Recommendation[]>;
  getById(id: string): Promise<Recommendation>;
  create(data: CreateRecommendationInput): Promise<Recommendation>;
  update(id: string, data: UpdateRecommendationInput): Promise<Recommendation>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRecommendationsApi(client: ApiClient): RecommendationsApi {
  return {
    list(query) {
      return client.get('/v1/recommendations', RecommendationListSchema, { params: query });
    },

    getById(id) {
      return client.get(`/v1/recommendations/${id}`, RecommendationSchema);
    },

    create(data) {
      return client.post('/v1/recommendations', RecommendationSchema, data);
    },

    update(id, data) {
      return client.put(`/v1/recommendations/${id}`, RecommendationSchema, data);
    },

    delete(id) {
      return client.delete(`/v1/recommendations/${id}`, DeleteResponseSchema);
    },
  };
}
