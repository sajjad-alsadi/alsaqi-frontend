import { useUser } from '../context/UserContext';
import { usePermissionsContext } from '../context/PermissionsContext';
import { UserRole } from '../constants';
import { PermissionAction, UserPermissionSet } from '../permissions/types';

export interface UsePermissionsReturn {
  hasPermission(module: string, action: PermissionAction): boolean;
  canView(module: string): boolean;
  canCreate(module: string): boolean;
  canEdit(module: string): boolean;
  canDelete(module: string): boolean;
  canApprove(module: string): boolean;
  isLoading: boolean;
  isFallback: boolean;
  isCustomRole: boolean;
  permissions: UserPermissionSet | null;
  refetch(): Promise<void>;
}

/**
 * Thin selector over the single {@link PermissionsProvider} (Req 11).
 *
 * This hook performs NO fetching of its own — every consumer reads from the one
 * shared permission state served by the provider. It exposes the same public API
 * as before (canView/hasPermission/isLoading/isFallback/refetch/...) so existing
 * callers continue to work unchanged.
 *
 * - Admin role always returns true for all checks.
 * - All other roles are evaluated against the effective permission set, which is
 *   either the server-confirmed set or a narrowing fallback (Req 9).
 * - The backend remains the authoritative access control (Req 9.5); these client
 *   checks are advisory.
 */
export const usePermissions = (): UsePermissionsReturn => {
  const { user } = useUser();
  const { permissions, isLoading, isFallback, refetch } = usePermissionsContext();

  const hasPermission = (module: string, action: PermissionAction): boolean => {
    if (!user) return false;

    // Admin always has all permissions
    if (user.role === UserRole.ADMIN) return true;

    if (!permissions) return false;

    const modulePerms = permissions.permissions[module];
    return modulePerms?.includes(action) ?? false;
  };

  const canView = (module: string) => hasPermission(module, 'View');
  const canCreate = (module: string) => hasPermission(module, 'Create');
  const canEdit = (module: string) => hasPermission(module, 'Edit');
  const canDelete = (module: string) => hasPermission(module, 'Delete');
  const canApprove = (module: string) => hasPermission(module, 'Approve');

  return {
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    isLoading,
    isFallback,
    isCustomRole: permissions?.isCustomRole ?? false,
    permissions,
    refetch,
  };
};
