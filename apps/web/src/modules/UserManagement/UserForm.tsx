import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { AccessScope } from '../../constants';
import { ROLES } from '../../permissions';
import { ChevronDown, AlertCircle } from 'lucide-react';

import { useFormat } from '../../utils/formatService';
import { useDepartments } from '../../api/hooks/useDepartments';
import { Button } from '@/components/ui/button';

interface UserFormProps {
  editingUser: any;
  newUser: any;
  userError: string;
  jobTitles: any[];
  users: any[];
  allRoles: any[];
  isLoading?: boolean;
  getRoleLabel: (role: string) => string;
  onCancel: () => void;
  onSave: () => void;
  onUpdateNewUser: (data: any) => void;
}

const UserForm: React.FC<UserFormProps> = ({
  editingUser,
  newUser,
  userError,
  jobTitles,
  users,
  allRoles,
  isLoading = false,
  getRoleLabel,
  onCancel,
  onSave,
  onUpdateNewUser
}) => {
  const { t } = useTranslation();
  const { translateName } = useFormat();
  const { departments } = useDepartments();

  const isFormDisabled = isLoading;

  // Inline validation
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (newUser.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email)) {
      errors['email'] = t('userManagement.form.invalidEmail', 'Invalid email format');
    }
    if (!editingUser && newUser.password && newUser.password.length < 8) {
      errors['password'] = t('userManagement.form.passwordMinLength', 'Minimum 8 characters');
    }
    return errors;
  }, [newUser.email, newUser.password, editingUser, t]);

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    const pw = newUser.password || '';
    if (!pw) return { level: 0, label: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: t('userManagement.form.weak', 'Weak'), color: 'var(--color-danger)' };
    if (score <= 2) return { level: 2, label: t('userManagement.form.fair', 'Fair'), color: 'var(--color-warning)' };
    if (score <= 3) return { level: 3, label: t('userManagement.form.good', 'Good'), color: 'var(--color-info)' };
    return { level: 4, label: t('userManagement.form.strong', 'Strong'), color: 'var(--color-success)' };
  }, [newUser.password, t]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 border-[var(--color-primary)]/20"
    >
      <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-6">{editingUser ? t('userManagement.editUser') : t('userManagement.addUser')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.username')}</label>
          <input className="input-field !py-2 !text-xs" placeholder={t('userManagement.form.username')} value={newUser.username || ''} onChange={e => onUpdateNewUser({ username: e.target.value })} disabled={!!editingUser || isFormDisabled} />
        </div>
        {!editingUser && (
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.password')}</label>
            <input className={`input-field !py-2 !text-xs ${fieldErrors['password'] ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]/30' : ''}`} type="password" placeholder={t('userManagement.form.password')} value={newUser.password || ''} onChange={e => onUpdateNewUser({ password: e.target.value })} disabled={isFormDisabled} aria-invalid={!!fieldErrors['password']} />
            {newUser.password && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1 rounded-full bg-[var(--color-border-soft)] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(passwordStrength.level / 4) * 100}%`, backgroundColor: passwordStrength.color }} />
                </div>
                <span className="text-[9px] font-bold" style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
              </div>
            )}
            {fieldErrors['password'] && (
              <p className="text-[10px] text-[var(--color-danger)] font-bold flex items-center gap-1 mt-0.5"><AlertCircle size={10} />{fieldErrors['password']}</p>
            )}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.fullName')}</label>
          <input className="input-field !py-2 !text-xs" placeholder={t('userManagement.form.fullName')} value={newUser.name || ''} onChange={e => onUpdateNewUser({ name: e.target.value })} disabled={isFormDisabled} />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.email')}</label>
          <input className={`input-field !py-2 !text-xs ${fieldErrors['email'] ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]/30' : ''}`} placeholder={t('userManagement.form.email')} value={newUser.email || ''} onChange={e => onUpdateNewUser({ email: e.target.value })} disabled={isFormDisabled} aria-invalid={!!fieldErrors['email']} />
          {fieldErrors['email'] && (
            <p className="text-[10px] text-[var(--color-danger)] font-bold flex items-center gap-1 mt-0.5"><AlertCircle size={10} />{fieldErrors['email']}</p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.phoneNumber')}</label>
          <input className="input-field !py-2 !text-xs" placeholder={t('userManagement.form.phoneNumber')} value={newUser.phone_number || ''} onChange={e => onUpdateNewUser({ phone_number: e.target.value })} disabled={isFormDisabled} />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.jobTitle')}</label>
          <select className="input-field !py-2 !text-xs" value={newUser.job_title_id || ''} onChange={e => onUpdateNewUser({ job_title_id: e.target.value })} disabled={isFormDisabled}>
            <option value="">{t('userManagement.form.selectJobTitle')}</option>
            {jobTitles.map(title => (
              <option key={title.id} value={title.id}>{title.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.department')}</label>
          <select className="input-field !py-2 !text-xs" value={newUser.department || ''} onChange={e => onUpdateNewUser({ department: e.target.value })} disabled={isFormDisabled}>
            <option value="">{t('userManagement.form.selectDepartment')}</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.name}>{dept.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.unit')}</label>
          <input className="input-field !py-2 !text-xs" placeholder={t('userManagement.form.unit')} value={newUser.unit || ''} onChange={e => onUpdateNewUser({ unit: e.target.value })} disabled={isFormDisabled} />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.reportingManager')}</label>
          <select className="input-field !py-2 !text-xs" value={newUser.reporting_manager_id || ''} onChange={e => onUpdateNewUser({ reporting_manager_id: e.target.value })} disabled={isFormDisabled}>
            <option value="">{t('userManagement.form.selectManager')}</option>
            {users.filter(u => u.id !== editingUser?.id).map(u => (
              <option key={u.id} value={u.id}>{translateName(u.name)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.accessScope')}</label>
          <select className="input-field !py-2 !text-xs" value={newUser.access_scope || AccessScope.GLOBAL} onChange={e => onUpdateNewUser({ access_scope: e.target.value })} disabled={isFormDisabled}>
            <option value={AccessScope.GLOBAL}>{t('userManagement.form.global')}</option>
            <option value={AccessScope.DEPARTMENT}>{t('userManagement.form.department')}</option>
            <option value={AccessScope.UNIT}>{t('userManagement.form.unit')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('common.role')}</label>
          <div className="relative">
            <select 
              className="input-field appearance-none !py-2 !text-xs cursor-pointer pe-8"
              value={newUser.role || ROLES.VIEWER} 
              onChange={e => onUpdateNewUser({ role: e.target.value })} 
              disabled={isFormDisabled}
            >
              {allRoles.length === 0 ? (
                <option value="">{t('userManagement.form.loadingRoles')}</option>
              ) : (
                allRoles.map(role => (
                  <option key={role.id} value={role.name}>{getRoleLabel(role.name)}</option>
                ))
              )}
            </select>
            <div className="absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-muted)]">
              <ChevronDown size={14} />
            </div>
          </div>
        </div>
        <div className="lg:col-span-1 space-y-1">
          <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.form.notes')}</label>
          <textarea 
            className="input-field !py-2 !text-xs min-h-[42px]" 
            placeholder={t('userManagement.form.additionalNotes')} 
            value={newUser.notes || ''} 
            onChange={e => onUpdateNewUser({ notes: e.target.value })}
            disabled={isFormDisabled}
          />
        </div>
      </div>
      {userError && (
        <div className="mt-4 p-2 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-xs">
          {userError}
        </div>
      )}
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onCancel} className="!py-2 !px-4 !text-xs" disabled={isFormDisabled}>{t('common.cancel')}</Button>
        <Button 
          onClick={onSave} 
          className="flex items-center gap-2 !py-2 !px-4 !text-xs"
          disabled={isFormDisabled}
        >
          {isLoading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {editingUser ? t('common.save') : t('userManagement.addUser')}
        </Button>
      </div>

    </motion.div>
  );
};

export default UserForm;
