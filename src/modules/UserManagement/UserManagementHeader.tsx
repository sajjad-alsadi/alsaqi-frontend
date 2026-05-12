import React from 'react';
import { User, Search, Save, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { UserManagementTab } from '../../constants';
import { useFormat } from '../../services/formatService';

interface UserManagementHeaderProps {
  activeTab: UserManagementTab;
  searchTerm: string;
  resetRequestsCount: number;
  onTabChange: (tab: UserManagementTab) => void;
  onSearchChange: (term: string) => void;
  onExport: () => void;
  onAddUser: () => void;
}

const UserManagementHeader: React.FC<UserManagementHeaderProps> = ({
  activeTab,
  searchTerm,
  resetRequestsCount,
  onTabChange,
  onSearchChange,
  onExport,
  onAddUser
}) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20 flex-shrink-0">
          <User size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text-main)] tracking-tight leading-tight">{t('userManagement.title')}</h2>
          <p className="text-[11px] text-slate-400 font-bold mt-0.5 opacity-80">{t('userManagement.subtitle')}</p>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex bg-[var(--color-bg-soft)] backdrop-blur-sm p-1 rounded-xl border border-[var(--color-border-soft)] shadow-inner overflow-x-auto no-scrollbar scroll-smooth">
          {Object.values(UserManagementTab).map((tab) => (
            <button 
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab 
                  ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-border-soft)]' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)]/30'
              }`}
            >
              {t(`userManagement.tabs.${tab}`)}
              {tab === UserManagementTab.RESETS && resetRequestsCount > 0 && (
                <span className="bg-[var(--color-danger)] text-white text-[8px] px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                  {formatNumber(resetRequestsCount)}
                </span>
              )}
            </button>
          ))}
        </div>
        {activeTab === UserManagementTab.USERS && (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={16} />
              <input 
                type="text"
                placeholder={t('userManagement.searchPlaceholder')}
                className="input-field !ps-10 !py-2 !text-xs"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onExport}
                className="btn-secondary flex items-center justify-center gap-2 whitespace-nowrap !py-2 !px-4 !text-xs"
              >
                <Save size={16} />
                <span className="hidden sm:inline">{t('userManagement.export')}</span>
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onAddUser} 
                className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap !py-2 !px-4 !text-xs"
              >
                <UserPlus size={18} />
                <span>{t('userManagement.addUser')}</span>
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagementHeader;
