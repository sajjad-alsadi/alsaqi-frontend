/**
 * User Management module API client.
 * Provides typed methods for extended user management operations
 * (roles, permissions, sessions, login history, audit trail, settings, etc.)
 *
 * Typed equivalent of extended operations in: api/compat/userService.ts
 * (Basic CRUD is already covered by api/modules/users.ts)
 */
import { z } from 'zod';
import {
  RoleSchema,
  PermissionSchema,
  SessionSchema,
  SettingsSchema,
  JobTitleSchema,
} from '@alsaqi/shared';
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

const RoleListSchema = z.array(RoleSchema);

const PermissionListSchema = z.array(PermissionSchema);

const SessionListSchema = z.array(SessionSchema);

const LoginHistorySchema = z.array(z.record(z.string(), z.unknown()));
const AuditTrailSchema = z.array(z.record(z.string(), z.unknown()));

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
