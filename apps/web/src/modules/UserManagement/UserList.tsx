import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mail, Shield, Building, Edit, Trash2, Unlock, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../utils/formatService';

interface UserListProps {
  users: any[];
  getRoleLabel: (role: string) => string;
  onEdit: (user: any) => void;
  onSuspend: (id: string) => void;
  onDelete: (id: string) => void;
  onResetPassword: (id: string) => void;
  onUnlock: (id: string) => void;
}

const UserList: React.FC<UserListProps> = ({
  users,
  getRoleLabel,
  onEdit,
  onSuspend,
  onDelete,
  onResetPassword,
  onUnlock
}) => {
  const { t, i18n } = useTranslation();
  const { translateStatus, formatDateTime, formatNumber, translateName } = useFormat();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {users.map((user, idx) => (
        <motion.div 
          key={user.id}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { delay: idx * 0.05, duration: 0.3 }}
          style={{ willChange: 'opacity, transform' }}
          className="glass-card group hover:shadow-xl hover:shadow-[var(--color-primary)]/5 transition-all duration-500 overflow-hidden flex flex-col"
        >
          <div className="p-4 sm:p-5 space-y-4 flex-1">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--color-bg-soft)] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] group-hover:bg-[var(--color-primary)]/10 group-hover:text-[var(--color-primary)] transition-colors duration-500 flex-shrink-0">
                  <span className="text-base font-bold uppercase">{user.name?.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors truncate">{translateName(user.name)}</h3>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] truncate">@{user.username}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                  user.status === 'Active' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 
                  user.status === 'Locked' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                }`}>
                  {translateStatus(user.status)}
                </span>
                {user.status === 'Locked' && (
                  <div className="flex flex-col items-end gap-0.5">
                    <button 
                      onClick={() => onUnlock(user.id)}
                      className="flex items-center gap-1 text-[8px] font-bold text-[var(--color-success)] hover:underline"
                    >
                      <Unlock size={10} />
                      {t('userManagement.userCard.unlock')}
                    </button>
                    <span className="text-[7px] font-bold text-[var(--color-danger)] uppercase tracking-tighter opacity-80">
                      {formatNumber(user.failed_attempts || 0)} {t('userManagement.userCard.failedAttempts')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Mail size={14} className="opacity-50 flex-shrink-0" />
                <span className="text-[11px] font-bold truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Shield size={14} className="opacity-50 flex-shrink-0" />
                <span className="text-[11px] font-bold truncate">{getRoleLabel(user.role)}</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Building size={14} className="opacity-50 flex-shrink-0" />
                <span className="text-[11px] font-bold truncate">{user.department}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--color-border-soft)] flex items-center justify-between">
              <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('userManagement.userCard.lastLogin')}</span>
              <span className="text-[9px] font-bold text-[var(--color-text-main)] opacity-70 truncate">{user.last_login ? formatDateTime(user.last_login) : t('userManagement.userCard.never')}</span>
            </div>
          </div>

          <div className="px-5 py-3 bg-[var(--color-bg-soft)]/30 border-t border-[var(--color-border-soft)] flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => onEdit(user)}
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-card)] rounded-lg transition-all"
                aria-label={t('common.edit')}
                title={t('common.edit')}
              >
                <Edit size={16} />
              </button>
              <button 
                onClick={() => onResetPassword(user.id)}
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-warning)] hover:bg-[var(--color-card)] rounded-lg transition-all"
                aria-label={t('userManagement.resetPassword')}
                title={t('userManagement.resetPassword')}
              >
                <KeyRound size={16} />
              </button>
              <button 
                onClick={() => onDelete(user.id)}
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-card)] rounded-lg transition-all"
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <button 
              onClick={() => onSuspend(user.id)}
              className={`text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${
                user.status === 'Active' ? 'text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10' : 'text-[var(--color-success)] hover:bg-[var(--color-success)]/10'
              }`}
            >
              {user.status === 'Active' ? t('userManagement.userCard.suspend') : t('userManagement.userCard.activate')}
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default UserList;
