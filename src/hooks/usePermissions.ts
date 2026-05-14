import { useAppContext } from '../context/AppContext';
import { DEFAULT_PERMISSIONS, Module, Permission, Role } from '../permissions';
import { UserRole } from '../constants';

export const usePermissions = () => {
  const { user } = useAppContext();
  
  const hasPermission = (module: Module, permission: Permission): boolean => {
    if (!user) return false;
    
    // Admin has all permissions
    if (user.role === UserRole.ADMIN) return true;
    
    // Static permission matrix (single source of truth)
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
