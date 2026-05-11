import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Save, CheckCircle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '../../permissions';
import { useFormat } from '../../services/formatService';

interface RolePermissionsProps {
  allRoles: any[];
  allPermissions: any[];
  showSaveSuccess: boolean;
  getRoleLabel: (role: string) => string;
  onSave: (modifiedRoles: any[]) => void;
}

const RolePermissions: React.FC<RolePermissionsProps> = ({
  allRoles,
  allPermissions,
  showSaveSuccess,
  getRoleLabel,
  onSave
}) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [localRoles, setLocalRoles] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [modifiedRoleIds, setModifiedRoleIds] = useState<Set<number>>(new Set());

  // Initialize selected role and local state when roles are loaded
  useEffect(() => {
    if (allRoles.length > 0 && selectedRoleId === null) {
      setSelectedRoleId(allRoles[0].id);
    }
    if (!isDirty && allRoles.length > 0) {
      setLocalRoles(JSON.parse(JSON.stringify(allRoles)));
      setModifiedRoleIds(new Set());
    }
  }, [allRoles, selectedRoleId, isDirty]);

  const handleToggle = (roleId: number, permId: number, checked: boolean) => {
    setLocalRoles(prev => prev.map(role => {
      if (role.id === roleId) {
        const perms = role.permissions || [];
        if (checked) {
          const permObj = allPermissions.find(p => p.id === permId);
          return { ...role, permissions: [...perms, permObj] };
        } else {
          return { ...role, permissions: perms.filter((p: any) => p.id !== permId) };
        }
      }
      return role;
    }));
    setModifiedRoleIds(prev => new Set(prev).add(roleId));
    setIsDirty(true);
  };

  const handleSave = () => {
    const rolesToSave = localRoles.filter(r => modifiedRoleIds.has(r.id));
    onSave(rolesToSave);
    setIsDirty(false);
    setModifiedRoleIds(new Set());
  };

  // Group permissions by module
  const fallbackModules = ['Audit', 'Finding', 'Risk', 'Recommendation', 'Correspondence', 'User', 'Setting'];
  const modules = allPermissions.length > 0 
    ? Array.from(new Set(allPermissions.map(p => p.module)))
    : fallbackModules;
    
  const actions = Object.values(PERMISSIONS);

  const selectedRole = localRoles.find(r => r.id === selectedRoleId);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--color-primary)]/10 rounded-xl flex items-center justify-center text-[var(--color-primary)]">
            <Shield size={20} />
          </div>
          <div>
            <h3 className="text-xl font-black text-[var(--color-text-main)]">{t('userManagement.roles.title')}</h3>
            <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.roles.subtitle')}</p>
          </div>
        </div>
        <button 
          onClick={handleSave} 
          disabled={!isDirty}
          className={`btn-primary flex items-center gap-2 !py-2 !px-4 !text-xs ${!isDirty ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Save size={16} />
          {t('common.save')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Roles Sidebar */}
        <div className="lg:col-span-1 space-y-1.5">
          <p className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-wider px-2 mb-2">{t('userManagement.roles.rolesLabel')}</p>
          {localRoles.length > 0 ? localRoles.map(role => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                selectedRoleId === role.id 
                  ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/10 translate-x-1' 
                  : 'bg-[var(--color-card)] text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)]'
              }`}
            >
              <div className="text-start truncate">
                <p className="text-xs font-black truncate">{getRoleLabel(role.name)}</p>
                <p className={`text-[9px] ${selectedRoleId === role.id ? 'text-white/70' : 'text-[var(--color-text-muted)]'}`}>
                  {formatNumber((role.permissions || []).length)} {t('userManagement.roles.permissionsLabel')}
                </p>
              </div>
              <ChevronRight size={14} className={selectedRoleId === role.id ? 'opacity-100 flex-shrink-0' : 'opacity-0'} />
            </button>
          )) : (
            <div className="p-4 text-center text-[var(--color-text-muted)] text-[10px]">{t('common.loading')}</div>
          )}
        </div>

        {/* Permissions Matrix */}
        <div className="lg:col-span-4">
          <div className="glass-card overflow-hidden border-[var(--color-border-soft)]">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
                    <th className="px-5 py-3 text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-wider text-start min-w-[140px]">{t('userManagement.roles.module')}</th>
                    {actions.map(action => (
                      <th key={action} className="px-4 py-3 text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-wider text-center">
                        {t(`permissions.${action}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-soft)]">
                  <AnimatePresence>
                    {modules.map((module, idx) => (
                      <motion.tr 
                        key={`${selectedRoleId}-${module}`}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.01 }}
                        className="hover:bg-[var(--color-bg-soft)]/50 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <span className="text-xs font-black text-[var(--color-text-main)]">{t(`modules.${module}`)}</span>
                        </td>
                        {actions.map(action => {
                          const perm = allPermissions.find(p => p.module === module && p.action === action);
                          
                          // If no real permission object, show a dummy toggle that doesn't do anything for now 
                          // or just show a greyed out one
                          const hasPermission = perm ? (selectedRole?.permissions || []).some((p: any) => p.id === perm.id) : false;
                          const disabled = !perm || !selectedRoleId;
                          
                          return (
                            <td key={action} className="px-4 py-3 text-center">
                              <label className={`relative inline-flex items-center ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'} group`}>
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer"
                                  checked={hasPermission}
                                  disabled={disabled}
                                  onChange={(e) => perm && handleToggle(selectedRoleId!, perm.id, e.target.checked)}
                                />
                                <div className="w-9 h-5 bg-[var(--color-border-soft)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)] group-hover:shadow-sm transition-all"></div>
                              </label>
                            </td>
                          );
                        })}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
          {allPermissions.length === 0 && localRoles.length > 0 && (
            <p className="mt-2 text-[9px] text-[var(--color-warning)] font-bold text-center italic">{t('userManagement.roles.matrix')} (Preview Mode)</p>
          )}
        </div>
      </div>


      {showSaveSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-10 end-10 bg-[var(--color-success)] text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50"
        >
          <CheckCircle size={24} />
          <span className="font-black uppercase tracking-widest text-xs">{t('settingsSavedSuccessfully')}</span>
        </motion.div>
      )}
    </div>
  );
};

export default RolePermissions;
