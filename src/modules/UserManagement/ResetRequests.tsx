import React from 'react';
import { motion } from 'motion/react';
import { Clock, UserCheck, Key, Copy, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ResetRequestsProps {
  requests: any[];
  tempPassword: string;
  onApprove: (id: number) => void;
}

const ResetRequests: React.FC<ResetRequestsProps> = ({
  requests,
  tempPassword,
  onApprove
}) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[var(--color-danger)]/10 rounded-2xl flex items-center justify-center text-[var(--color-danger)]">
          <Key size={24} />
        </div>
        <div>
          <h3 className="text-2xl font-black text-[var(--color-text-main)]">{t('userManagement.resets.title')}</h3>
          <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('userManagement.resets.pendingRequests')}</p>
        </div>
      </div>

      {tempPassword && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 bg-[var(--color-success)]/10 border-2 border-[var(--color-success)]/20 rounded-2xl space-y-4"
        >
          <div className="flex items-center gap-3 text-[var(--color-success)]">
            <CheckCircle size={24} />
            <h4 className="text-lg font-black">{t('userManagement.resets.passwordResetSuccess')}</h4>
          </div>
          <p className="text-sm text-[var(--color-success)] font-bold opacity-80">
            {t('userManagement.resets.tempPasswordGeneratedNote')}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-[var(--color-card)] p-4 rounded-2xl border border-[var(--color-success)]/20 font-mono text-2xl font-black text-center tracking-widest text-[var(--color-success)]">
              {tempPassword}
            </div>
            <button 
              onClick={() => navigator.clipboard.writeText(tempPassword)}
              className="p-4 bg-[var(--color-card)] rounded-2xl border border-[var(--color-success)]/20 text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors"
            >
              <Copy size={24} />
            </button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {requests.map((req, idx) => (
          <motion.div 
            key={req.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card p-8 flex items-center justify-between group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[var(--color-bg-soft)] rounded-2xl flex items-center justify-center text-[var(--color-text-muted)] group-hover:bg-[var(--color-primary)]/10 group-hover:text-[var(--color-primary)] transition-colors">
                <span className="text-lg font-black uppercase">{req.username?.charAt(0)}</span>
              </div>
              <div>
                <h4 className="text-lg font-black text-[var(--color-text-main)]">@{req.username}</h4>
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                  <Clock size={14} />
                  {new Date(req.created_at).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}
                </div>
              </div>
            </div>
            <button 
              onClick={() => onApprove(req.id)}
              className="btn-primary py-2 px-6 text-xs flex items-center gap-2"
            >
              <UserCheck size={16} />
              {t('userManagement.resets.approve')}
            </button>
          </motion.div>
        ))}
        {requests.length === 0 && (
          <div className="md:col-span-2 py-20 text-center border-2 border-dashed border-[var(--color-border-soft)] rounded-2xl">
            <p className="text-[var(--color-text-muted)] font-bold">{t('userManagement.resets.noPendingRequests')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetRequests;
