/**
 * Users module API client.
 * Provides typed methods for user management endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { User, CreateUserInput, UpdateUserInput } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const UserSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  username: z.string(),
  password: z.string().optional(),
  name: z.string(),
  email: z.string(),
  department: z.string(),
  job_title: z.string().optional(),
  role: z.string(),
  profile_picture: z.string().optional(),
  status: z.enum(['Active', 'Disabled']),
  last_login: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
  permissions: z
    .array(z.object({ module: z.string(), action: z.string() }))
    .optional(),
});

const UserListSchema = z.array(UserSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsersApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    role?: string;
    status?: string;
  }): Promise<User[]>;
  getById(id: string): Promise<User>;
  create(data: CreateUserInput): Promise<User>;
  update(id: string, data: UpdateUserInput): Promise<User>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createUsersApi(client: ApiClient): UsersApi {
  return {
    list(query) {
      return client.get('/v1/users', UserListSchema, { params: query }) as Promise<User[]>;
    },

    getById(id) {
      return client.get(`/v1/users/${id}`, UserSchema) as Promise<User>;
    },

    create(data) {
      return client.post('/v1/users', UserSchema, data) as Promise<User>;
    },

    update(id, data) {
      return client.put(`/v1/users/${id}`, UserSchema, data) as Promise<User>;
    },

    delete(id) {
      return client.delete(`/v1/users/${id}`, DeleteResponseSchema);
    },
  };
}
