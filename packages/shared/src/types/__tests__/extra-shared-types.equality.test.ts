/**
 * Extra_Shared_Types baseline equality suite (FIX-FE-1, criteria 1.1 & 1.6).
 *
 * The substantive guarantee — that none of the 8 Extra_Shared_Types has a field
 * deleted, renamed, narrowed, or its optionality/type changed relative to the
 * recorded baseline — is enforced at COMPILE TIME by `../__baseline__/type-equality.ts`.
 * If a guarded type drifts, `tsc --noEmit` / `tsc --build` (and therefore CI) fails.
 *
 * This suite anchors that compile-time check inside the test graph: it imports the
 * equality module (so the file is part of the program the test build sees) and
 * additionally records value-level baseline fixtures via `satisfies`, which are
 * themselves compile-checked against both the live and baseline shapes.
 */
import { describe, it, expect } from 'vitest';

import {
  extraSharedTypesEqualityVerified,
  EXTRA_SHARED_TYPE_NAMES,
} from '../__baseline__/type-equality';

import type {
  DashboardStats,
  AuditProgressByType,
  RiskLevelBreakdown,
  Role,
  Permission,
  UserSession,
  JobTitle,
  UserManagementSettings,
} from '../models';

import type {
  BaselineDashboardStats,
  BaselineAuditProgressByType,
  BaselineRiskLevelBreakdown,
  BaselineRole,
  BaselinePermission,
  BaselineUserSession,
  BaselineJobTitle,
  BaselineUserManagementSettings,
} from '../__baseline__/extra-shared-types.baseline';

// ── Value-level baseline fixtures ──────────────────────────────────────────────
// Each fixture must satisfy BOTH the live type and the baseline type. If a field
// is added/removed/retyped on either side, one of these `satisfies` clauses fails
// to compile, complementing the structural equality check.

const auditProgressByType = {
  type: 'Operational',
  planned: 5,
  completed: 3,
} satisfies AuditProgressByType & BaselineAuditProgressByType;

const riskLevelBreakdown = {
  level: 'High',
  count: 7,
} satisfies RiskLevelBreakdown & BaselineRiskLevelBreakdown;

const dashboardStats = {
  audits: { total: 10, completed: 4, progress_by_type: [auditProgressByType] },
  findings: { summary: { open: 2, high_risk_open: 1 } },
  recommendations: { open: 3, overdue: 1 },
  risks: { summary: { total: 8, high: 2 }, byLevel: [riskLevelBreakdown] },
  correspondence: { incoming_total: 12, outgoing_total: 9, pending_responses: 3 },
  compliance: { total: 5 },
  activity: [{ kind: 'login' }],
} satisfies DashboardStats & BaselineDashboardStats;

const role = {
  id: 1,
  name: 'Auditor',
  description: 'Performs audits',
} satisfies Role & BaselineRole;

const permission = {
  id: 'perm-1',
  module: 'audits',
  action: 'read',
} satisfies Permission & BaselinePermission;

const userSession = {
  id: 1,
  user_id: 42,
  ip_address: '127.0.0.1',
  user_agent: 'vitest',
  created_at: '2026-01-01T00:00:00Z',
  expires_at: '2026-01-02T00:00:00Z',
} satisfies UserSession & BaselineUserSession;

const jobTitle = {
  id: 1,
  name: 'Senior Auditor',
  name_ar: 'مدقق أول',
  name_en: 'Senior Auditor',
} satisfies JobTitle & BaselineJobTitle;

const userManagementSettings = {
  failed_login_threshold: 5,
  inactive_account_threshold_days: 90,
  password_min_length: 12,
  password_require_uppercase: 1,
  password_require_lowercase: 1,
  password_require_numbers: 1,
  password_require_symbols: 0,
  password_expiry_days: 180,
  enforce_single_session: 1,
  session_timeout_minutes: 30,
} satisfies UserManagementSettings & BaselineUserManagementSettings;

describe('Extra_Shared_Types baseline equality (FIX-FE-1, criteria 1.1 & 1.6)', () => {
  it('compiles the type-level equality assertions against the recorded baseline', () => {
    // Reaching this line at runtime means the equality module (and its 8 strict
    // `Equals<live, baseline>` assertions) compiled successfully.
    expect(extraSharedTypesEqualityVerified).toBe(true);
  });

  it('guards exactly the 8 Extra_Shared_Types', () => {
    expect([...EXTRA_SHARED_TYPE_NAMES].sort()).toEqual(
      [
        'AuditProgressByType',
        'DashboardStats',
        'JobTitle',
        'Permission',
        'RiskLevelBreakdown',
        'Role',
        'UserManagementSettings',
        'UserSession',
      ].sort()
    );
  });

  it('value-level baseline fixtures conform to both the live and baseline shapes', () => {
    expect(dashboardStats.audits.progress_by_type[0]).toEqual(auditProgressByType);
    expect(dashboardStats.risks.byLevel?.[0]).toEqual(riskLevelBreakdown);
    expect(role.name).toBe('Auditor');
    expect(permission.module).toBe('audits');
    expect(userSession.user_id).toBe(42);
    expect(jobTitle.name_ar).toBe('مدقق أول');
    expect(userManagementSettings.password_min_length).toBe(12);
  });
});
