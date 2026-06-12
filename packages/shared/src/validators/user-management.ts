/**
 * User management (roles, permissions, sessions, job titles, settings)
 * validation schemas.
 * Single source of validation truth for both API and Frontend.
 */
import { z } from 'zod';
import type {
  Role,
  Permission,
  UserSession,
  JobTitle,
  UserManagementSettings,
} from '../types/models';

/**
 * A role record returned by `GET /v1/roles`.
 *
 * Field definitions and validation rules are identical to the original schema
 * previously defined in apps/web/src/api/modules/user-management.ts. The type
 * is derived via z.infer (FIX-FE-4 pattern: no z.ZodType<T> annotation) so the
 * schema and its type cannot drift.
 */
export const RoleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  description: z.string().optional(),
});

/**
 * A permission record returned by `GET /v1/permissions`.
 *
 * Field definitions and validation rules are identical to the original schema
 * previously defined in apps/web/src/api/modules/user-management.ts.
 */
export const PermissionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  module: z.string(),
  action: z.string(),
});

/**
 * An active user session returned by `GET /v1/user-sessions`.
 *
 * Field definitions and validation rules are identical to the original schema
 * previously defined in apps/web/src/api/modules/user-management.ts.
 */
export const SessionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  user_id: z.union([z.string(), z.number()]),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  created_at: z.string().optional(),
  expires_at: z.string().optional(),
});

/**
 * User-management policy settings returned by
 * `GET /v1/user-management-settings`.
 *
 * Field definitions and validation rules are identical to the original schema
 * previously defined in apps/web/src/api/modules/user-management.ts.
 */
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

/**
 * A job-title record returned by `GET /v1/job-titles`.
 *
 * Field definitions and validation rules are identical to the original schema
 * previously defined in apps/web/src/api/modules/user-management.ts.
 */
export const JobTitleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  name_ar: z.string().optional(),
  name_en: z.string().optional(),
});

/**
 * Inferred types for the user-management schemas.
 *
 * Exported under non-conflicting names (the canonical `Role`, `Permission`,
 * `UserSession`, `JobTitle`, and `UserManagementSettings` models live in
 * types/models.ts and are re-exported from the package root). The compile-time
 * assertions below guarantee the inferred types stay assignable to those
 * models under exactOptionalPropertyTypes, without a `z.ZodType<T>` annotation
 * or any suppression.
 */
export type RoleValidated = z.infer<typeof RoleSchema>;
export type PermissionValidated = z.infer<typeof PermissionSchema>;
export type UserSessionValidated = z.infer<typeof SessionSchema>;
export type UserManagementSettingsValidated = z.infer<typeof SettingsSchema>;
export type JobTitleValidated = z.infer<typeof JobTitleSchema>;

const _roleContract: Role = {} as RoleValidated;
void _roleContract;

const _permissionContract: Permission = {} as PermissionValidated;
void _permissionContract;

const _sessionContract: UserSession = {} as UserSessionValidated;
void _sessionContract;

const _settingsContract: UserManagementSettings = {} as UserManagementSettingsValidated;
void _settingsContract;

const _jobTitleContract: JobTitle = {} as JobTitleValidated;
void _jobTitleContract;
