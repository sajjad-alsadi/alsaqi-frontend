/**
 * User Management module API client.
 * Provides typed methods for extended user management operations
 * (roles, permissions, sessions, login history, audit trail, settings, etc.)
 *
 * Typed equivalent of extended operations in: api/compat/userService.ts
 * (Basic CRUD is already covered by api/modules/users.ts)
 */
import { z } from 'zod';
import type { ApiClient } from '../client';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const GenericListSchema = z.array(z.record(z.string(), z.unknown()));
const GenericObjectSchema = z.record(z.string(), z.unknown());
const SuccessResponseSchema = z.object({ success: z.boolean() });
const DeleteResponseSchema = z.object({ deleted: z.boolean() });

const UserSummarySchema = z.record(z.string(), z.unknown());

const RoleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  description: z.string().optional(),
});
const RoleListSchema = z.array(RoleSchema);

const PermissionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  module: z.string(),
  action: z.string(),
});
const PermissionListSchema = z.array(PermissionSchema);

const SessionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  user_id: z.union([z.string(), z.number()]),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  created_at: z.string().optional(),
  expires_at: z.string().optional(),
});
const SessionListSchema = z.array(SessionSchema);

const SettingsSchema = z.record(z.string(), z.unknown());

const LoginHistorySchema = z.array(z.record(z.string(), z.unknown()));
const AuditTrailSchema = z.array(z.record(z.string(), z.unknown()));

const JobTitleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  name_ar: z.string().optional(),
  name_en: z.string().optional(),
});
const JobTitleListSchema = z.array(JobTitleSchema);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Role {
  id: string | number;
  name: string;
  description?: string;
}

export interface Permission {
  id: string | number;
  module: string;
  action: string;
}

export interface UserSession {
  id: string | number;
  user_id: string | number;
  ip_address?: string;
  user_agent?: string;
  created_at?: string;
  expires_at?: string;
}

export interface JobTitle {
  id: string | number;
  name: string;
  name_ar?: string;
  name_en?: string;
}

export interface UserManagementSettings {
  failed_login_threshold?: number;
  inactive_account_threshold_days?: number;
  password_min_length?: number;
  password_require_uppercase?: number;
  password_require_lowercase?: number;
  password_require_numbers?: number;
  password_require_symbols?: number;
  password_expiry_days?: number;
  enforce_single_session?: number;
  session_timeout_minutes?: number;
}

export interface LoginHistoryParams {
  page?: number;
  pageSize?: number;
  userId?: string;
  status?: string;
}

export interface AuditTrailParams {
  page?: number;
  pageSize?: number;
  module?: string;
  action?: string;
  username?: string;
}

export interface UserManagementApi {
  init(): Promise<Record<string, unknown>>;
  getSummary(): Promise<Record<string, unknown>>;
  getRoles(): Promise<Role[]>;
  getPermissions(): Promise<Permission[]>;
  getSessions(): Promise<UserSession[]>;
  getSettings(): Promise<Record<string, unknown>>;
  getLoginHistory(params?: LoginHistoryParams): Promise<Array<Record<string, unknown>>>;
  getAuditTrail(params?: AuditTrailParams): Promise<Array<Record<string, unknown>>>;
  getJobTitles(): Promise<JobTitle[]>;
  getResetRequests(): Promise<Array<Record<string, unknown>>>;
  suspendUser(id: string | number): Promise<Record<string, unknown>>;
  resetPassword(id: string | number, data: { newPassword: string }): Promise<Record<string, unknown>>;
  unlockUser(id: string | number): Promise<Record<string, unknown>>;
  approveReset(data: { requestId: string; action: 'approve' | 'reject'; tempPassword?: string }): Promise<Record<string, unknown>>;
  updateRolePermissions(roleId: string | number, data: { permissionIds: string[] }): Promise<Record<string, unknown>>;
  updateSettings(data: UserManagementSettings): Promise<Record<string, unknown>>;
  revokeSession(sessionId: string | number): Promise<{ deleted: boolean }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createUserManagementApi(client: ApiClient): UserManagementApi {
  return {
    init() {
      return client.get('/v1/users/init', GenericObjectSchema);
    },

    getSummary() {
      return client.get('/v1/users/summary', UserSummarySchema);
    },

    getRoles() {
      return client.get('/v1/roles', RoleListSchema) as Promise<Role[]>;
    },

    getPermissions() {
      return client.get('/v1/permissions', PermissionListSchema);
    },

    getSessions() {
      return client.get('/v1/user-sessions', SessionListSchema) as Promise<UserSession[]>;
    },

    getSettings() {
      return client.get('/v1/user-management-settings', SettingsSchema);
    },

    getLoginHistory(params) {
      return client.get('/v1/login-history', LoginHistorySchema, { params });
    },

    getAuditTrail(params) {
      return client.get('/v1/audit-trail', AuditTrailSchema, { params });
    },

    getJobTitles() {
      return client.get('/v1/job-titles', JobTitleListSchema) as Promise<JobTitle[]>;
    },

    getResetRequests() {
      return client.get('/v1/auth/reset-requests', GenericListSchema);
    },

    suspendUser(id) {
      return client.post(`/v1/users/${id}/suspend`, GenericObjectSchema);
    },

    resetPassword(id, data) {
      return client.post(`/v1/users/${id}/reset-password`, GenericObjectSchema, data);
    },

    unlockUser(id) {
      return client.post(`/v1/users/${id}/unlock`, GenericObjectSchema);
    },

    approveReset(data) {
      return client.post('/v1/auth/approve-reset', GenericObjectSchema, data);
    },

    updateRolePermissions(roleId, data) {
      return client.post(`/v1/roles/${roleId}/permissions`, GenericObjectSchema, data);
    },

    updateSettings(data) {
      return client.put('/v1/user-management-settings', SettingsSchema, data);
    },

    revokeSession(sessionId) {
      return client.delete(`/v1/user-sessions/${sessionId}`, DeleteResponseSchema);
    },
  };
}
