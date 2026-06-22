/**
 * Users module API client.
 * Provides typed methods for user management endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { User, CreateUserInput, UpdateUserInput } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

/**
 * Resilient user schema.
 *
 * The backend returns a wider variety of user shapes than the strict typed
 * `User` interface implies: `status` can be any of `Active`, `Inactive`,
 * `Suspended`, `Locked`, `Disabled`, optional metadata fields (`department`,
 * `email`, ...) can be `null`, and extra columns (`failed_attempts`,
 * `job_title_id`, `unit`, `phone_number`, `notes`, ...) are present that the UI
 * relies on. A strict schema here causes `z.array(...).parse()` to throw on the
 * whole response, which silently empties the entire user list while the summary
 * (validated loosely) still reports a non-zero count.
 *
 * To stay robust we:
 *  - accept any non-empty `status` string instead of a narrow enum,
 *  - allow nullable/optional metadata fields,
 *  - `passthrough()` unknown keys so UI-only fields survive validation.
 */
export const UserSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    username: z.string(),
    password: z.string().optional(),
    name: z.string(),
    email: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    job_title: z.string().optional().nullable(),
    role: z.string(),
    profile_picture: z.string().optional().nullable(),
    status: z.string(),
    last_login: z.string().optional().nullable(),
    theme: z.enum(['light', 'dark']).optional(),
    permissions: z
      .array(z.object({ module: z.string(), action: z.string() }))
      .optional(),
  })
  .passthrough();

const UserListSchema = z.array(UserSchema);

/**
 * Resilient list-payload schema.
 *
 * After the client's envelope interceptor unwraps `{ success, data }`, the users
 * list endpoint may surface EITHER a bare `User[]` OR a paginated object such as
 * `{ data: User[], pagination }` (the same shape `api/utils/envelope.toList`
 * already guards against, and that `ComplianceMatrixPage` relies on). A bare
 * `z.array(...)` throws on the object form, which silently empties the whole
 * list. We normalise both shapes to the inner array before validating each user.
 */
const UserListPayloadSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return (value as { data: unknown[] }).data;
  }
  return value;
}, UserListSchema);

const DeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsersApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: string;
    status?: string;
    department?: string;
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
      return client.get('/users', UserListPayloadSchema, { params: query }) as Promise<User[]>;
    },

    getById(id) {
      return client.get(`/users/${id}`, UserSchema) as Promise<User>;
    },

    create(data) {
      return client.post('/users', UserSchema, data) as Promise<User>;
    },

    update(id, data) {
      return client.put(`/users/${id}`, UserSchema, data) as Promise<User>;
    },

    delete(id) {
      return client.delete(`/users/${id}`, DeleteResponseSchema);
    },
  };
}
