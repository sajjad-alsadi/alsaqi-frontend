import { UserRole } from './constants';
import { ModuleRegistry } from './permissions/registry';
// Side-effect import: registers every module (the single source of truth) into
// the ModuleRegistry so DEFAULT_PERMISSIONS can be derived from it below.
import './permissions/modules';
import type { PermissionAction } from './permissions/types';

export const ROLES = {
  ADMIN: UserRole.ADMIN,
  INTERNAL_AUDITOR: UserRole.INTERNAL_AUDITOR,
  COMPLIANCE_OFFICER: UserRole.COMPLIANCE_OFFICER,
  RISK_OFFICER: UserRole.RISK_OFFICER,
  MANAGER: UserRole.MANAGER,
  VIEWER: UserRole.VIEWER,
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const MODULES = {
  DASHBOARD: 'Dashboard',
  AUDIT_CHARTER: 'AuditCharter',
  AUDIT_PLANS: 'AuditPlans',
  AUDIT_TASKS: 'AuditTasks',
  AUDIT_PROGRAM_LIBRARY: 'AuditProgramLibrary',
  AUDIT_FINDINGS: 'AuditFindings',
  AUDIT_EVIDENCE: 'AuditEvidence',
  RECOMMENDATIONS: 'Recommendations',
  RISK_REGISTER: 'RiskRegister',
  COMPLIANCE_MATRIX: 'ComplianceMatrix',
  INTEGRITY_MANAGEMENT: 'IntegrityManagement',
  DEPARTMENTS: 'Departments',
  REPORTS: 'Reports',
  CORRESPONDENCE: 'Correspondence',
  NOTIFICATIONS: 'Notifications',
  USER_MANAGEMENT: 'UserManagement',
  SYSTEM_LOGS: 'SystemLogs',
  ORG_STRUCTURE: 'OrgStructure',
  SETTINGS: 'Settings',
} as const;

export type Module = typeof MODULES[keyof typeof MODULES];

export const PERMISSIONS = {
  VIEW: 'View',
  CREATE: 'Create',
  EDIT: 'Edit',
  DELETE: 'Delete',
  APPROVE: 'Approve',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export type RolePermissions = Record<Module, Permission[]>;

/**
 * Default role permissions, DERIVED from the Module_Registry — the single source
 * of truth for module/action definitions (`permissions/modules.ts`).
 *
 * Deriving (rather than duplicating) guarantees that `permissions.ts` and the
 * registry can never diverge (Req 8.1) and that adding or removing a module or
 * action in the registry is reflected here automatically, with no second manual
 * edit (Req 8.4). For each role and module the granted actions are the registry's
 * declared defaults filtered to the actions the module's registry entry lists as
 * valid, so a derived default can never grant an action the registry does not
 * define for that module (Req 8.2). Because the data comes from the registry, the
 * Analytics and Policies modules are included automatically (Req 8.3).
 *
 * The Backend remains the authoritative authority for access control; this matrix
 * is an advisory, offline fallback only (Req 31.4, 31.5).
 */
function deriveDefaultPermissions(): Record<Role, RolePermissions> {
  const result = {} as Record<Role, RolePermissions>;
  const roles = Object.values(ROLES) as Role[];
  const modules = ModuleRegistry.getAllModules();

  for (const role of roles) {
    const rolePermissions = {} as RolePermissions;

    for (const mod of modules) {
      const declared: PermissionAction[] = mod.defaults[role] ?? [];
      // Never grant an action the module's registry entry does not list (Req 8.2).
      const granted = declared.filter((action) => mod.actions.includes(action));
      rolePermissions[mod.name as Module] = [...granted] as Permission[];
    }

    result[role] = rolePermissions;
  }

  return result;
}

export const DEFAULT_PERMISSIONS: Record<Role, RolePermissions> = deriveDefaultPermissions();
