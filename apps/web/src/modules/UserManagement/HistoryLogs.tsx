import React, { useState, useMemo } from 'react';
import { History, Clock, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import Pagination from '../../components/Pagination';
import VirtualTable, { ColumnDef } from '../../components/VirtualTable';

import { useFormat } from '../../utils/formatService';

interface HistoryLogsProps {
  loginHistory: any[];
  activityLogs: any[];
  historyPagination: any;
  activityPagination: any;
  onHistoryPageChange: (page: number) => void;
  onHistoryPageSizeChange: (size: number) => void;
  onActivityPageChange: (page: number) => void;
  onActivityPageSizeChange: (size: number) => void;
}

const HistoryLogs: React.FC<HistoryLogsProps> = ({
  loginHistory,
  activityLogs,
  historyPagination,
  activityPagination,
  onHistoryPageChange,
  onHistoryPageSizeChange,
  onActivityPageChange,
  onActivityPageSizeChange
}) => {
  const { t, i18n } = useTranslation();
  const { translateStatus, translateName } = useFormat();
  const [logTab, setLogTab] = useState<'login' | 'activity'>('login');

  const currentLogs = logTab === 'login' ? loginHistory : activityLogs;
  const ROW_HEIGHT = 56;

  // Column definitions for VirtualTable
  const columns: ColumnDef<any>[] = useMemo(() => [
    { key: 'user', header: t('userManagement.history.user'), width: '25%' },
    { key: 'info', header: logTab === 'login' ? t('userManagement.history.ipAddress') : t('userManagement.history.action'), width: '25%' },
    { key: 'date', header: t('common.date'), width: '25%' },
    { key: 'status', header: t('common.statusLabel'), width: '25%' },
  ], [t, logTab]);

  // Row renderer for VirtualTable — preserves existing cell rendering logic
  const renderVirtualRow = (log: any, _index: number) => (
    <div className="flex items-center w-full h-full hover:bg-[var(--color-bg-soft)]/50 transition-colors border-b border-[var(--color-border-soft)]">
      <div className="px-8 py-6" style={{ width: '25%' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-bg-soft)] rounded-lg flex items-center justify-center text-[var(--color-text-muted)]">
            <User size={14} />
          </div>
          <span className="text-sm font-bold text-[var(--color-text-main)]">
            {logTab === 'login' ? log.username : translateName(log.user)}
          </span>
        </div>
      </div>
      <div className="px-8 py-6" style={{ width: '25%' }}>
        <span className="text-sm font-bold text-[var(--color-text-muted)]">{logTab === 'login' ? log.ip_address : log.action}</span>
        {logTab === 'activity' && log.module && (
          <span className="ms-2 px-2 py-0.5 bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] text-[10px] font-bold uppercase rounded-md border border-[var(--color-border-soft)]">{log.module}</span>
        )}
      </div>
      <div className="px-8 py-6" style={{ width: '25%' }}>
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
          <Clock size={14} />
          {new Date(logTab === 'login' ? log.login_time : log.timestamp).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}
        </div>
      </div>
      <div className="px-8 py-6" style={{ width: '25%' }}>
        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
          (log.status === 'Success' || log.status === 'Completed' || logTab === 'activity') ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
        }`}>
          {translateStatus(log.status || (logTab === 'activity' ? 'Completed' : 'Success'))}
        </span>
      </div>
    </div>
  );

  // Use VirtualTable when data exceeds 50 rows (Req 3.2)
  const useVirtualization = currentLogs.length > 50;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center text-[var(--color-primary)]">
            <History size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-[var(--color-text-main)]">{t('userManagement.history.title')}</h3>
            <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('userManagement.history.subtitle')}</p>
          </div>
        </div>
        <div className="flex bg-[var(--color-bg-soft)] p-1 rounded-xl self-start border border-[var(--color-border-soft)]">
          <button 
            onClick={() => setLogTab('login')}
            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${logTab === 'login' ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'}`}
          >
            {t('userManagement.history.loginHistory')}
          </button>
          <button 
            onClick={() => setLogTab('activity')}
            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${logTab === 'activity' ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'}`}
          >
            {t('userManagement.history.activityLogs')}
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden border-[var(--color-border-soft)]">
        {useVirtualization ? (
          <div style={{ height: '600px' }}>
            <VirtualTable<any>
              data={currentLogs}
              rowHeight={ROW_HEIGHT}
              overscan={10}
              columns={columns}
              renderRow={renderVirtualRow}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest text-start">{t('userManagement.history.user')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest text-start">{logTab === 'login' ? t('userManagement.history.ipAddress') : t('userManagement.history.action')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest text-start">{t('common.date')}</th>
                  <th className="px-8 py-6 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest text-start">{t('common.statusLabel')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-soft)]">
                {currentLogs.map((log, idx) => (
                  <tr key={log.id} className="hover:bg-[var(--color-bg-soft)]/50 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[var(--color-bg-soft)] rounded-lg flex items-center justify-center text-[var(--color-text-muted)]">
                          <User size={14} />
                        </div>
                        <span className="text-sm font-bold text-[var(--color-text-main)]">
                          {logTab === 'login' ? log.username : translateName(log.user)}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-sm font-bold text-[var(--color-text-muted)]">{logTab === 'login' ? log.ip_address : log.action}</span>
                      {logTab === 'activity' && log.module && (
                        <span className="ms-2 px-2 py-0.5 bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] text-[10px] font-bold uppercase rounded-md border border-[var(--color-border-soft)]">{log.module}</span>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                        <Clock size={14} />
                        {new Date(logTab === 'login' ? log.login_time : log.timestamp).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        (log.status === 'Success' || log.status === 'Completed' || logTab === 'activity') ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                      }`}>
                        {translateStatus(log.status || (logTab === 'activity' ? 'Completed' : 'Success'))}
                      </span>
                    </td>
                  </tr>
                ))}
                {currentLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center text-[var(--color-text-muted)] font-bold">
                      {t('userManagement.history.noLogs')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination 
        currentPage={logTab === 'login' ? historyPagination.page : activityPagination.page}
        totalPages={logTab === 'login' ? historyPagination.totalPages : activityPagination.totalPages}
        onPageChange={logTab === 'login' ? onHistoryPageChange : onActivityPageChange}
        pageSize={logTab === 'login' ? historyPagination.pageSize : activityPagination.pageSize}
        onPageSizeChange={logTab === 'login' ? onHistoryPageSizeChange : onActivityPageSizeChange}
        totalItems={logTab === 'login' ? historyPagination.total : activityPagination.total}
      />
    </div>
  );
};

export default HistoryLogs;
