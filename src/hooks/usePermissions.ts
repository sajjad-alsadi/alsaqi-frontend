import { useAppContext } from '../context/AppContext';
import { DEFAULT_PERMISSIONS, Module, Permission, Role } from '../permissions';
import { PERMISSION_MODULE_MAP } from '../constants';

export const usePermissions = () => {
  const { user } = useAppContext();
  
  const hasPermission = (module: Module, permission: Permission): boolean => {
    if (!user) return false;
    
    // Admin has all permissions
    if (user.role === 'Admin') return true;
    
    // DB-sourced permissions (primary source of truth)
    if (user.permissions && user.permissions.length > 0) {
      const dbModule = PERMISSION_MODULE_MAP[module] || module;
      return user.permissions.some(p => p.module === dbModule && p.action === permission);
    }
    
    // Fallback to static defaults when DB permissions unavailable
    const rolePermissions = DEFAULT_PERMISSIONS[user.role as Role];
    if (!rolePermissions) return false;
    const modulePermissions = rolePermissions[module];
    if (!modulePermissions) return false;
    return modulePermissions.includes(permission);
  };

  const canView = (module: Module) => hasPermission(module, 'View');
  const canCreate = (module: Module) => hasPermission(module, 'Create');
  const canEdit = (module: Module) => hasPermission(module, 'Edit');
  const canDelete = (module: Module) => hasPermission(module, 'Delete');
  const canApprove = (module: Module) => hasPermission(module, 'Approve');

  return { hasPermission, canView, canCreate, canEdit, canDelete, canApprove };
};
