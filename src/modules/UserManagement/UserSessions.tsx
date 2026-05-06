import React from 'react';
import { motion } from 'motion/react';
import { Monitor, Smartphone, Globe, LogOut, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UserSessionsProps {
  sessions: any[];
  onRevoke: (id: number) => void;
}

const UserSessions: React.FC<UserSessionsProps> = ({
  sessions,
  onRevoke
}) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center text-[var(--color-primary)]">
          <Globe size={24} />
        </div>
        <div>
          <h3 className="text-2xl font-black text-[var(--color-text-main)]">{t('userManagement.sessions.title')}</h3>
          <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('userManagement.sessions.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sessions.map((session, idx) => (
          <motion.div 
            key={session.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card p-8 flex items-center justify-between group"
          >
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-[var(--color-bg-soft)] rounded-2xl flex items-center justify-center text-[var(--color-text-muted)] group-hover:bg-[var(--color-primary)]/10 group-hover:text-[var(--color-primary)] transition-colors">
                {session.device_type === 'mobile' ? <Smartphone size={28} /> : <Monitor size={28} />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-black text-[var(--color-text-main)]">{session.username}</h4>
                  <span className="px-2 py-0.5 bg-[var(--color-success)]/10 text-[var(--color-success)] text-[10px] font-black uppercase rounded-full">{t('userManagement.sessions.active')}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-bold text-[var(--color-text-muted)]">
                  <div className="flex items-center gap-1">
                    <Globe size={14} />
                    {session.ip_address}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    {new Date(session.last_activity).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}
                  </div>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{session.user_agent}</p>
              </div>
            </div>
            <button 
              onClick={() => onRevoke(session.id)}
              className="p-3 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-2xl transition-all"
              title={t('userManagement.sessions.revoke')}
            >
              <LogOut size={20} />
            </button>
          </motion.div>
        ))}
        {sessions.length === 0 && (
          <div className="lg:col-span-2 py-20 text-center border-2 border-dashed border-[var(--color-border-soft)] rounded-[2.5rem]">
            <p className="text-[var(--color-text-muted)] font-bold">{t('userManagement.sessions.noActiveSessions')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSessions;
