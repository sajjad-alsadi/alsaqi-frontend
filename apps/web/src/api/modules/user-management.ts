/**
 * User Management module API client.
 * Provides typed methods for extended user management operations
 * (roles, permissions, sessions, login history, audit trail, settings, etc.)
 *
 * Typed equivalent of extended operations in: api/compat/userService.ts
 * (Basic CRUD is already covered by api/modules/users.ts)
 */
import { z } from 'zod';
import type {
  Role,
  Permission,
  UserSession,
  JobTitle,
  UserManagementSettings,
} from '@alsaqi/shared';
import type { ApiClient } from '../client';

// Re-export the shared types so existing consumers of this module keep working.
export type {
  Role,
  Permission,
  UserSession,
  JobTitle,
  UserManagementSettings,
} from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const GenericListSchema = z.array(z.record(z.string(), z.unknown()));
const GenericObjectSchema = z.record(z.string(), z.unknown());
const DeleteResponseSchema = z.object({ deleted: z.boolean() });

const UserSummarySchema = z.record(z.string(), z.unknown());

export const RoleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  description: z.string().optional(),
});
// Compile-time only: assert the inferred schema type stays assignable to the
// shared Role type under exactOptionalPropertyTypes. Never executed.
const _roleContract: Role = {} as z.infer<typeof RoleSchema>;
void _roleContract;
const RoleListSchema = z.array(RoleSchema);

export const PermissionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  module: z.string(),
  action: z.string(),
});
const _permissionContract: Permission = {} as z.infer<typeof PermissionSchema>;
void _permissionContract;
const PermissionListSchema = z.array(PermissionSchema);

export const SessionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  user_id: z.union([z.string(), z.number()]),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  created_at: z.string().optional(),
  expires_at: z.string().optional(),
});
const _sessionContract: UserSession = {} as z.infer<typeof SessionSchema>;
void _sessionContract;
const SessionListSchema = z.array(SessionSchema);

export const SettingsSchema = z.object({
  failed_login_threshold: z.number().optional(),
  inactive_account_threshold_days: z.number().optional(),
  password_min_length: z.number().optional(),
  password_require_uppercase: z.number().optional(),
  password_require_lowercase: z.number().optional(),
  password_require_numbers: z.number().optional(),
  password_require_symbols: z.number().optional(),
  password_expiry_days: z.number().optional(),
  enforce_single_session: z.number().optional(),
  session_timeout_minutes: z.number().optional(),
});
const _settingsContract: UserManagementSettings = {} as z.infer<typeof SettingsSchema>;
void _settingsContract;

const LoginHistorySchema = z.array(z.record(z.string(), z.unknown()));
const AuditTrailSchema = z.array(z.record(z.string(), z.unknown()));

export const JobTitleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  name_ar: z.string().optional(),
  name_en: z.string().optional(),
});
const _jobTitleContract: JobTitle = {} as z.infer<typeof JobTitleSchema>;
void _jobTitleContract;
const JobTitleListSchema = z.array(JobTitleSchema);

// ─── Types ────────────────────────────────────────────────────────────────────

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
  getSettings(): Promise<UserManagementSettings>;
  getLoginHistory(params?: LoginHistoryParams): Promise<Array<Record<string, unknown>>>;
  getAuditTrail(params?: AuditTrailParams): Promise<Array<Record<string, unknown>>>;
  getJobTitles(): Promise<JobTitle[]>;
  getResetRequests(): Promise<Array<Record<string, unknown>>>;
  suspendUser(id: string | number): Promise<Record<string, unknown>>;
  resetPassword(id: string | number, data: { newPassword: string }): Promise<Record<string, unknown>>;
  unlockUser(id: string | number): Promise<Record<string, unknown>>;
  approveReset(data: { requestId: string; action: 'approve' | 'reject'; tempPassword?: string }): Promise<Record<string, unknown>>;
  updateRolePermissions(roleId: string | number, data: { permissionIds: string[] }): Promise<Record<string, unknown>>;
  updateSettings(data: UserManagementSettings): Promise<UserManagementSettings>;
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
      return client.get('/v1/roles', RoleListSchema);
    },

    getPermissions() {
      return client.get('/v1/permissions', PermissionListSchema);
    },

    getSessions() {
      return client.get('/v1/user-sessions', SessionListSchema);
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
      return client.get('/v1/job-titles', JobTitleListSchema);
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
