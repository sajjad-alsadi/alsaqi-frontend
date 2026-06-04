/**
 * Auth module API client.
 * Provides typed methods for authentication endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { User } from '@alsaqi/shared';

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

const LoginResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

const RegisterResponseSchema = z.object({
  user: UserSchema,
});

const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

const LogoutResponseSchema = z.object({
  success: z.boolean(),
});

const ChangePasswordResponseSchema = z.object({
  success: z.boolean(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthApi {
  login(data: { usernameOrEmail: string; password: string; rememberMe?: boolean }): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }>;
  logout(): Promise<{ success: boolean }>;
  refresh(data: { refreshToken: string }): Promise<{
    accessToken: string;
    refreshToken: string;
  }>;
  register(data: {
    username: string;
    password: string;
    name: string;
    email: string;
    role: string;
    department?: string | null;
    job_title_id?: string | null;
    unit?: string | null;
    reporting_manager_id?: string | null;
    access_scope?: string | null;
    phone_number?: string | null;
    notes?: string | null;
    status?: 'Active' | 'Inactive' | 'Suspended';
  }): Promise<{ user: User }>;
  changePassword(data: { newPassword: string }): Promise<{ success: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    login(data) {
      return client.post('/v1/auth/login', LoginResponseSchema, data) as Promise<{
        user: User;
        accessToken: string;
        refreshToken: string;
      }>;
    },

    logout() {
      return client.post('/v1/auth/logout', LogoutResponseSchema);
    },

    refresh(data) {
      return client.post('/v1/auth/refresh', RefreshResponseSchema, data);
    },

    register(data) {
      return client.post('/v1/auth/register', RegisterResponseSchema, data) as Promise<{
        user: User;
      }>;
    },

    changePassword(data) {
      return client.post('/v1/auth/change-password', ChangePasswordResponseSchema, data);
    },
  };
}
