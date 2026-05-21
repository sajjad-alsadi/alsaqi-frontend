// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { usePermissions } from '../usePermissions';
import { UserRole } from '../../constants';
import { MODULES, PERMISSIONS, DEFAULT_PERMISSIONS, Module, Permission } from '../../permissions';

// Mock the UserContext
const mockUser = { user: null as any };
vi.mock('../../context/UserContext', () => ({
  useUser: () => mockUser,
}));

describe('usePermissions', () => {
  beforeEach(() => {
    mockUser.user = null;
  });

  describe('hasPermission - مع صلاحيات محددة لكل وحدة وإجراء', () => {
    it('should return true for permissions the Internal Auditor role has', () => {
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      // Internal Auditor can View, Create, Edit AuditPlans
      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(true);
      expect(result.current.hasPermission('AuditPlans', 'Create')).toBe(true);
      expect(result.current.hasPermission('AuditPlans', 'Edit')).toBe(true);
    });

    it('should return false for permissions the Internal Auditor role does not have', () => {
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Test' };

      const { result } = renderHook(() => usePermissions());

      // Internal Auditor cannot Delete or Approve AuditPlans
      expect(result.current.hasPermission('AuditPlans', 'Delete')).toBe(false);
      expect(result.current.hasPermission('AuditPlans', 'Approve')).toBe(false);
    });

    it('should correctly check Compliance Officer permissions', () => {
      mockUser.user = { id: '2', role: UserRole.COMPLIANCE_OFFICER, name: 'Compliance' };

      const { result } = renderHook(() => usePermissions());

      // Compliance Officer can View, Create, Edit ComplianceMatrix
      expect(result.current.hasPermission('ComplianceMatrix', 'View')).toBe(true);
      expect(result.current.hasPermission('ComplianceMatrix', 'Create')).toBe(true);
      expect(result.current.hasPermission('ComplianceMatrix', 'Edit')).toBe(true);
      // Cannot Delete ComplianceMatrix
      expect(result.current.hasPermission('ComplianceMatrix', 'Delete')).toBe(false);
    });

    it('should correctly check Risk Officer permissions', () => {
      mockUser.user = { id: '3', role: UserRole.RISK_OFFICER, name: 'Risk' };

      const { result } = renderHook(() => usePermissions());

      // Risk Officer can View, Create, Edit, Approve RiskRegister
      expect(result.current.hasPermission('RiskRegister', 'View')).toBe(true);
      expect(result.current.hasPermission('RiskRegister', 'Create')).toBe(true);
      expect(result.current.hasPermission('RiskRegister', 'Edit')).toBe(true);
      expect(result.current.hasPermission('RiskRegister', 'Approve')).toBe(true);
      // Cannot Delete RiskRegister
      expect(result.current.hasPermission('RiskRegister', 'Delete')).toBe(false);
    });

    it('should correctly check Manager permissions', () => {
      mockUser.user = { id: '4', role: UserRole.MANAGER, name: 'Manager' };

      const { result } = renderHook(() => usePermissions());

      // Manager can Approve AuditPlans
      expect(result.current.hasPermission('AuditPlans', 'Approve')).toBe(true);
      // Manager cannot Create or Edit AuditPlans
      expect(result.current.hasPermission('AuditPlans', 'Create')).toBe(false);
      expect(result.current.hasPermission('AuditPlans', 'Edit')).toBe(false);
    });

    it('should return false for modules with empty permissions array', () => {
      mockUser.user = { id: '5', role: UserRole.VIEWER, name: 'Viewer' };

      const { result } = renderHook(() => usePermissions());

      // Viewer has no permissions for UserManagement
      expect(result.current.hasPermission('UserManagement', 'View')).toBe(false);
      expect(result.current.hasPermission('UserManagement', 'Create')).toBe(false);
    });

    it('should validate all permissions match the DEFAULT_PERMISSIONS matrix for a given role', () => {
      mockUser.user = { id: '6', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      const rolePerms = DEFAULT_PERMISSIONS[UserRole.INTERNAL_AUDITOR];
      const allModules = Object.values(MODULES) as Module[];
      const allPermissions = Object.values(PERMISSIONS) as Permission[];

      for (const mod of allModules) {
        for (const perm of allPermissions) {
          const expected = rolePerms[mod]?.includes(perm) ?? false;
          expect(result.current.hasPermission(mod, perm)).toBe(expected);
        }
      }
    });
  });

  describe('Admin bypass - السماح بكل شيء', () => {
    it('should return true for all modules and all permissions when user is Admin', () => {
      mockUser.user = { id: '1', role: UserRole.ADMIN, name: 'Admin' };

      const { result } = renderHook(() => usePermissions());

      const allModules = Object.values(MODULES) as Module[];
      const allPermissions = Object.values(PERMISSIONS) as Permission[];

      for (const mod of allModules) {
        for (const perm of allPermissions) {
          expect(result.current.hasPermission(mod, perm)).toBe(true);
        }
      }
    });

    it('should bypass permission matrix for Admin even for modules with limited static permissions', () => {
      mockUser.user = { id: '1', role: UserRole.ADMIN, name: 'Admin' };

      const { result } = renderHook(() => usePermissions());

      // Admin can do everything even on modules that only have View in the matrix
      expect(result.current.hasPermission('Notifications', 'Delete')).toBe(true);
      expect(result.current.hasPermission('SystemLogs', 'Edit')).toBe(true);
      expect(result.current.hasPermission('Dashboard', 'Create')).toBe(true);
    });

    it('should return true for all convenience methods when user is Admin', () => {
      mockUser.user = { id: '1', role: UserRole.ADMIN, name: 'Admin' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canView('AuditPlans')).toBe(true);
      expect(result.current.canCreate('AuditPlans')).toBe(true);
      expect(result.current.canEdit('AuditPlans')).toBe(true);
      expect(result.current.canDelete('AuditPlans')).toBe(true);
      expect(result.current.canApprove('AuditPlans')).toBe(true);
    });
  });

  describe('مستخدم بدون صلاحيات - رفض الكل', () => {
    it('should return false for all permissions when user is null', () => {
      mockUser.user = null;

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(false);
      expect(result.current.hasPermission('Dashboard', 'View')).toBe(false);
      expect(result.current.canView('AuditPlans')).toBe(false);
      expect(result.current.canCreate('AuditPlans')).toBe(false);
    });

    it('should return false for all modules and permissions when user is null', () => {
      mockUser.user = null;

      const { result } = renderHook(() => usePermissions());

      const allModules = Object.values(MODULES) as Module[];
      const allPermissions = Object.values(PERMISSIONS) as Permission[];

      for (const mod of allModules) {
        for (const perm of allPermissions) {
          expect(result.current.hasPermission(mod, perm)).toBe(false);
        }
      }
    });

    it('should return false for Viewer role on modules with no permissions', () => {
      mockUser.user = { id: '1', role: UserRole.VIEWER, name: 'Viewer' };

      const { result } = renderHook(() => usePermissions());

      // Viewer has empty array for IntegrityManagement, UserManagement, SystemLogs
      expect(result.current.hasPermission('IntegrityManagement', 'View')).toBe(false);
      expect(result.current.hasPermission('UserManagement', 'View')).toBe(false);
      expect(result.current.hasPermission('SystemLogs', 'View')).toBe(false);
    });

    it('should return false for an unknown role', () => {
      mockUser.user = { id: '1', role: 'UnknownRole', name: 'Unknown' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('AuditPlans', 'View')).toBe(false);
      expect(result.current.hasPermission('Dashboard', 'View')).toBe(false);
    });
  });

  describe('convenience methods', () => {
    it('canView should check View permission', () => {
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canView('AuditPlans')).toBe(true);
      expect(result.current.canView('UserManagement')).toBe(false);
    });

    it('canCreate should check Create permission', () => {
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canCreate('AuditPlans')).toBe(true);
      expect(result.current.canCreate('ComplianceMatrix')).toBe(false);
    });

    it('canEdit should check Edit permission', () => {
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEdit('AuditFindings')).toBe(true);
      expect(result.current.canEdit('ComplianceMatrix')).toBe(false);
    });

    it('canDelete should check Delete permission', () => {
      mockUser.user = { id: '1', role: UserRole.INTERNAL_AUDITOR, name: 'Auditor' };

      const { result } = renderHook(() => usePermissions());

      // Internal Auditor cannot delete anything
      expect(result.current.canDelete('AuditPlans')).toBe(false);
      expect(result.current.canDelete('AuditFindings')).toBe(false);
    });

    it('canApprove should check Approve permission', () => {
      mockUser.user = { id: '1', role: UserRole.MANAGER, name: 'Manager' };

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canApprove('AuditPlans')).toBe(true);
      expect(result.current.canApprove('Correspondence')).toBe(false);
    });
  });
});
