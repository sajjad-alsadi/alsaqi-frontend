/**
 * Regulatory module API client.
 * Provides typed methods for central bank instructions CRUD endpoints.
 *
 * Typed equivalent of: api/compat/regulatoryService.ts
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { CentralBankInstruction } from '@alsaqi/shared';
import { InstructionSchema } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const InstructionListSchema = z.array(InstructionSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateInstructionInput = Omit<CentralBankInstruction, 'id'>;
export type UpdateInstructionInput = Partial<Omit<CentralBankInstruction, 'id'>>;

export interface RegulatoryApi {
  list(): Promise<CentralBankInstruction[]>;
  create(data: CreateInstructionInput): Promise<CentralBankInstruction>;
  update(id: string, data: UpdateInstructionInput): Promise<CentralBankInstruction>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRegulatoryApi(client: ApiClient): RegulatoryApi {
  return {
    list() {
      return client.get('/central-bank-instructions', InstructionListSchema) as Promise<CentralBankInstruction[]>;
    },

    create(data) {
      return client.post('/central-bank-instructions', InstructionSchema, data) as Promise<CentralBankInstruction>;
    },

    update(id, data) {
      return client.put(`/central-bank-instructions/${id}`, InstructionSchema, data) as Promise<CentralBankInstruction>;
    },

    delete(id) {
      return client.delete(`/central-bank-instructions/${id}`, DeleteResponseSchema);
    },
  };
}
