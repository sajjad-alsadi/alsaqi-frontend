/**
 * Departments module API client.
 * Provides typed methods for department CRUD endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { Department } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const DepartmentSchema: z.ZodType<Department> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    name_ar: z.string(),
    name_en: z.string().nullable(),
    entity_code: z.string(),
    entity_type: z.string(),
    parent_id: z.string().nullable(),
    manager_name: z.string().nullable(),
    level: z.number(),
    status: z.string(),
    display_order: z.number(),
    description: z.string().optional(),
    location: z.string().optional(),
    cost_center_code: z.string().optional(),
    children: z.array(DepartmentSchema).optional(),
  })
) as z.ZodType<Department>;

const DepartmentListSchema = z.array(DepartmentSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateDepartmentInput {
  name: string;
  name_ar: string;
  name_en?: string | null;
  entity_code: string;
  entity_type: string;
  parent_id?: string | null;
  manager_name?: string | null;
  level: number;
  status: string;
  display_order: number;
  description?: string;
  location?: string;
  cost_center_code?: string;
}

export interface UpdateDepartmentInput {
  name?: string;
  name_ar?: string;
  name_en?: string | null;
  entity_code?: string;
  entity_type?: string;
  parent_id?: string | null;
  manager_name?: string | null;
  level?: number;
  status?: string;
  display_order?: number;
  description?: string;
  location?: string;
  cost_center_code?: string;
}

export interface DepartmentsApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<Department[]>;
  getById(id: string): Promise<Department>;
  create(data: CreateDepartmentInput): Promise<Department>;
  update(id: string, data: UpdateDepartmentInput): Promise<Department>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDepartmentsApi(client: ApiClient): DepartmentsApi {
  return {
    list(query) {
      return client.get('/departments', DepartmentListSchema, { params: query });
    },

    getById(id) {
      return client.get(`/departments/${id}`, DepartmentSchema);
    },

    create(data) {
      return client.post('/departments', DepartmentSchema, data);
    },

    update(id, data) {
      return client.put(`/departments/${id}`, DepartmentSchema, data);
    },

    delete(id) {
      return client.delete(`/departments/${id}`, DeleteResponseSchema);
    },
  };
}
