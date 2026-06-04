import React from 'react';
import { motion } from 'motion/react';
import { User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../utils/formatService';

interface UserDetailsModalProps {
  user: any;
  onClose: () => void;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({ user, onClose }) => {
  const { t } = useTranslation();
  const { translateStatus } = useFormat();

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--color-card)] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-[var(--color-border-soft)]"
      >
        <div className="p-10">
          <div className="flex items-start justify-between mb-10">
            <div className="flex items-center gap-8">
              <div className="w-24 h-24 rounded-2xl bg-[var(--color-bg-soft)] border-4 border-[var(--color-card)] shadow-xl overflow-hidden">
                {user.profile_picture ? (
                  <img src={user.profile_picture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">
                    <User size={40} />
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-3xl font-bold text-[var(--color-text-main)] mb-2">{user.name}</h3>
                <div className="flex items-center gap-4">
                  <span className="px-4 py-1 bg-[var(--color-primary)] text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
                    {user.role}
                  </span>
                  <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${user.status === 'Active' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]'}`} />
                    {translateStatus(user.status)}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-[var(--color-bg-soft)] rounded-2xl transition-colors">
              <X size={24} className="text-[var(--color-text-muted)]" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-8">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest border-b border-[var(--color-border-soft)] pb-4">{t('common.basicInformation')}</h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('settings.userId')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user.employee_id || user.id}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.username')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">@{user.username}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.email')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.department')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user.department || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.jobTitle')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user.job_title || '-'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest border-b border-[var(--color-border-soft)] pb-4">{t('common.securityAccess')}</h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.accessScope')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user.access_scope || t('common.global')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.reportingManager')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user.reporting_manager_name || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.lastLogin')}</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user.last_login ? new Date(user.last_login).toLocaleString() : t('common.never')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{t('common.failedAttempts')}</p>
                  <p className={`text-sm font-bold ${user.failed_attempts >= 3 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-main)]'}`}>{user.failed_attempts}</p>
                </div>
              </div>
            </div>
          </div>

          {user.notes && (
            <div className="mt-10 p-6 bg-[var(--color-bg-soft)] rounded-3xl border border-[var(--color-border-soft)]">
              <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">{t('common.administrativeNotes')}</h4>
              <p className="text-sm text-[var(--color-text-main)] font-bold italic opacity-80">{user.notes}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default UserDetailsModal;
