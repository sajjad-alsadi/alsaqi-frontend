import React from 'react';
import { User, Search, Save, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { UserManagementTab } from '../../constants';
import { useFormat } from '../../utils/formatService';

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
    <div className="space-y-6">
      {/* Page Header — matches system-wide pattern */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20 flex-shrink-0">
            <User size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('userManagement.title')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('userManagement.subtitle')}</p>
          </div>
        </div>

        {activeTab === UserManagementTab.USERS && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={20} />
              <input 
                type="text"
                placeholder={t('userManagement.searchPlaceholder')}
                className="input-field !ps-14"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onExport}
                className="border border-[var(--color-border-soft)] bg-[var(--color-card)] hover:bg-[var(--color-bg-soft)] text-[var(--color-text-main)] inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-6 py-2.5 cursor-pointer gap-2 whitespace-nowrap"
              >
                <Save size={18} />
                <span className="hidden sm:inline">{t('userManagement.export')}</span>
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onAddUser} 
                className="bg-primary text-white hover:bg-primary-hover inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-6 py-2.5 cursor-pointer gap-2 whitespace-nowrap shadow-[0_4px_14px_rgba(10,125,133,0.25)]"
              >
                <UserPlus size={18} />
                <span>{t('userManagement.addUser')}</span>
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs — matches system-wide tab pattern */}
      <div className="flex gap-2 p-1 bg-[var(--color-bg-main)] rounded-2xl w-fit overflow-x-auto no-scrollbar">
        {Object.values(UserManagementTab).map((tab) => (
          <button 
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab 
                ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm' 
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
            }`}
          >
            {t(`userManagement.tabs.${tab}`)}
            {tab === UserManagementTab.RESETS && resetRequestsCount > 0 && (
              <span className="bg-[var(--color-danger)] text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                {formatNumber(resetRequestsCount)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default UserManagementHeader;
