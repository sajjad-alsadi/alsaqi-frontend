/**
 * Correspondence module API client.
 * Provides typed methods for incoming/outgoing correspondence endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type {
  Correspondence,
  CreateIncomingCorrespondenceInput,
  UpdateIncomingCorrespondenceInput,
  CreateOutgoingCorrespondenceInput,
  UpdateOutgoingCorrespondenceInput,
} from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

export const CorrespondenceSchema = z.object({
  id: z.string(),
  type: z.string(),
  letter_number: z.string(),
  subject: z.string(),
  letter_date: z.string(),
  classification: z.string(),
  priority: z.string(),
  status: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  // Incoming-specific fields
  sender_entity: z.string().optional(),
  sender_entity_type: z.string().optional(),
  receipt_date: z.string().optional(),
  method: z.string().optional(),
  receiving_dept_id: z.string().nullable().optional(),
  assigned_dept_id: z.string().nullable().optional(),
  assigned_user_id: z.string().nullable().optional(),
  follow_up_required: z.boolean().optional(),
  follow_up_date: z.string().nullable().optional(),
  response_required: z.boolean().optional(),
  response_due_date: z.string().nullable().optional(),
  // Outgoing-specific fields
  recipient_entity: z.string().optional(),
  sending_method: z.string().optional(),
  attachment_file: z.string().nullable().optional(),
});

const CorrespondenceListSchema = z.array(CorrespondenceSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

const StatsResponseSchema = z.record(z.string(), z.unknown());

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorrespondenceApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    type?: string;
    status?: string;
  }): Promise<Correspondence[]>;
  getById(id: string): Promise<Correspondence>;
  getStats(): Promise<Record<string, unknown>>;
  getIncoming(query?: { page?: number; pageSize?: number; search?: string; status?: string; type?: string }): Promise<Correspondence[]>;
  getOutgoing(query?: { page?: number; pageSize?: number; search?: string; status?: string; type?: string }): Promise<Correspondence[]>;
  getArchive(query?: { page?: number; pageSize?: number; search?: string; status?: string; type?: string }): Promise<Correspondence[]>;
  getDetails(type: string, id: number | string): Promise<Correspondence>;
  createIncoming(data: CreateIncomingCorrespondenceInput): Promise<Correspondence>;
  updateIncoming(id: string, data: UpdateIncomingCorrespondenceInput): Promise<Correspondence>;
  createOutgoing(data: CreateOutgoingCorrespondenceInput): Promise<Correspondence>;
  updateOutgoing(id: string, data: UpdateOutgoingCorrespondenceInput): Promise<Correspondence>;
  delete(id: string): Promise<{ deleted: boolean }>;
  deleteIncoming(id: number | string): Promise<{ deleted: boolean }>;
  deleteOutgoing(id: number | string): Promise<{ deleted: boolean }>;
  archiveIncoming(id: number | string): Promise<Correspondence>;
  archiveOutgoing(id: number | string): Promise<Correspondence>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createCorrespondenceApi(client: ApiClient): CorrespondenceApi {
  return {
    list(query) {
      return client.get('/v1/correspondence', CorrespondenceListSchema, { params: query }) as Promise<Correspondence[]>;
    },

    getById(id) {
      return client.get(`/v1/correspondence/${id}`, CorrespondenceSchema) as Promise<Correspondence>;
    },

    getStats() {
      return client.get('/v1/correspondence/stats', StatsResponseSchema);
    },

    getIncoming(query) {
      return client.get('/v1/correspondence/incoming', CorrespondenceListSchema, { params: query }) as Promise<Correspondence[]>;
    },

    getOutgoing(query) {
      return client.get('/v1/correspondence/outgoing', CorrespondenceListSchema, { params: query }) as Promise<Correspondence[]>;
    },

    getArchive(query) {
      return client.get('/v1/correspondence/archive', CorrespondenceListSchema, { params: query }) as Promise<Correspondence[]>;
    },

    getDetails(type, id) {
      return client.get(`/v1/correspondence/details/${type}/${id}`, CorrespondenceSchema) as Promise<Correspondence>;
    },

    createIncoming(data) {
      return client.post('/v1/correspondence/incoming', CorrespondenceSchema, data) as Promise<Correspondence>;
    },

    updateIncoming(id, data) {
      return client.put(`/v1/correspondence/incoming/${id}`, CorrespondenceSchema, data) as Promise<Correspondence>;
    },

    createOutgoing(data) {
      return client.post('/v1/correspondence/outgoing', CorrespondenceSchema, data) as Promise<Correspondence>;
    },

    updateOutgoing(id, data) {
      return client.put(`/v1/correspondence/outgoing/${id}`, CorrespondenceSchema, data) as Promise<Correspondence>;
    },

    delete(id) {
      return client.delete(`/v1/correspondence/${id}`, DeleteResponseSchema);
    },

    deleteIncoming(id) {
      return client.delete(`/v1/correspondence/incoming/${id}`, DeleteResponseSchema);
    },

    deleteOutgoing(id) {
      return client.delete(`/v1/correspondence/outgoing/${id}`, DeleteResponseSchema);
    },

    archiveIncoming(id) {
      return client.put(`/v1/correspondence/archive/incoming/${id}`, CorrespondenceSchema) as Promise<Correspondence>;
    },

    archiveOutgoing(id) {
      return client.put(`/v1/correspondence/archive/outgoing/${id}`, CorrespondenceSchema) as Promise<Correspondence>;
    },
  };
}
