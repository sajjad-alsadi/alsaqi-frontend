/**
 * Tasks module API client.
 * Provides typed methods for audit task CRUD endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { AuditTask, CreateTaskInput, UpdateTaskInput } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

// @ts-expect-error -- Zod .optional() produces T | undefined which conflicts with exactOptionalPropertyTypes
const TaskSchema: z.ZodType<AuditTask> = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  task_number: z.string(),
  title: z.string(),
  plan_id: z.string(),
  program_id: z.string().optional(),
  audit_type: z.string(),
  status: z.enum(['draft', 'in_progress', 'review', 'approved', 'completed']),
  assigned_to: z.string().optional(),
  audited_unit_id: z.string().optional(),
  planned_hours: z.number().optional(),
  actual_hours: z.number().optional(),
  period_from: z.string().optional(),
  period_to: z.string().optional(),
  due_date: z.string().optional(),
  approved_by: z.string().optional(),
  approved_at: z.string().optional(),
  created_by: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  deleted_at: z.string().optional(),
  audit_id: z.union([z.number(), z.string()]).optional(),
  procedure: z.string().optional(),
  responsible: z.string().optional(),
  evidence_link: z.string().optional(),
  evidence_id: z.number().optional(),
});

const TaskListSchema = z.array(TaskSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TasksApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    status?: string;
    plan_id?: string;
  }): Promise<AuditTask[]>;
  getById(id: string): Promise<AuditTask>;
  create(data: CreateTaskInput): Promise<AuditTask>;
  update(id: string, data: UpdateTaskInput): Promise<AuditTask>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTasksApi(client: ApiClient): TasksApi {
  return {
    list(query) {
      return client.get('/audit-tasks', TaskListSchema, { params: query });
    },

    getById(id) {
      return client.get(`/audit-tasks/${id}`, TaskSchema);
    },

    create(data) {
      return client.post('/audit-tasks', TaskSchema, data);
    },

    update(id, data) {
      return client.put(`/audit-tasks/${id}`, TaskSchema, data);
    },

    delete(id) {
      return client.delete(`/audit-tasks/${id}`, DeleteResponseSchema);
    },
  };
}
