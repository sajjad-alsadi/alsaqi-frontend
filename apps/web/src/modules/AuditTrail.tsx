import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { AuditTrail } from '../types';
import { History, Search, Filter } from 'lucide-react';
import api from '../api/httpClient';
import toast from 'react-hot-toast';
import { useFormat } from '../utils/formatService';
import Pagination from '../components/Pagination';
import logger from '../utils/logger';

interface AuditTrailProps {
  embedded?: boolean;
}

const AuditTrailModule: React.FC<AuditTrailProps> = ({ embedded = false }) => {
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  const { formatDateTime, translateName, translateAction, translateModule } = useFormat();
  const [logs, setLogs] = useState<AuditTrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  
  const modules = ['auth', 'users', 'audit', 'compliance', 'risk', 'correspondence', 'settings', 'system'];
  const actions = ['login', 'logout', 'created', 'updated', 'deleted', 'failed', 'approved', 'rejected'];

  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, [pagination.page, pagination.pageSize, filterModule, filterAction, searchTerm]);

  const fetchLogs = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await api.get('/audit-trail', {
        params: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          module: filterModule !== 'all' ? filterModule : undefined,
          action: filterAction !== 'all' ? filterAction : undefined,
          username: searchTerm || undefined
        },
        ...(signal ? { signal } : {})
      });
      
      const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
      const pagin = res.data.pagination || { total: data.length, totalPages: 1 };
      
      setLogs(data);
      setPagination(prev => ({
        ...prev,
        total: pagin.total,
        totalPages: pagin.totalPages
      }));
    } catch (err: any) {
      if (err?.name !== 'CanceledError') {
        logger.error('Operation failed', err);
        toast.error(t('errorOccurred'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
  };

  const filteredLogs = logs;

  return (
    <div className="space-y-6" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      {!embedded && (
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-[var(--color-primary)] rounded-xl flex items-center justify-center text-white shadow-[var(--shadow-primary)]">
              <History size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)] tracking-tight">{t('common.trail')}</h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t('common.trailSubtitle')}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={18} />
          <input 
            type="text"
            placeholder={t('common.search')}
            className="input-field !ps-11"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={16} className="text-[var(--color-text-muted)]" />
          <select 
            className="input-field py-2 text-sm min-w-[150px]"
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            aria-label={t('common.filterByModule')}
          >
            <option value="all">{t('common.allModules')}</option>
            {modules.map(m => (
              <option key={m} value={m}>{t(`common.modules.${m}`)}</option>
            ))}
          </select>

          <select 
            className="input-field py-2 text-sm min-w-[150px]"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            aria-label={t('common.filterByAction')}
          >
            <option value="all">{t('common.allActions')}</option>
            {actions.map(a => (
              <option key={a} value={a}>
                {t(`common.${a}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-[var(--color-bg-soft)]/50 border-b border-[var(--color-border-soft)]">
                <th className="px-6 py-4 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-start">{t('common.timestamp_label')}</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-start">{t('common.user_label')}</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-start">{t('common.action_label')}</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-start">{t('common.module')}</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-start">{t('common.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]/50">
              {(Array.isArray(filteredLogs) ? filteredLogs : []).map((log) => (
                <tr 
                  key={log.id}
                  className="hover:bg-[var(--color-primary)]/5 transition-colors group"
                >
                  <td className="px-6 py-4 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] flex items-center justify-center text-[10px] font-semibold text-[var(--color-primary)]">
                        {log.user.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-[var(--color-text-main)]">{translateName(log.user)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      (log.action || '').toLowerCase().includes('delete') ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' :
                      (log.action || '').toLowerCase().includes('created') ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                      (log.action || '').toLowerCase().includes('failed') ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    }`}>
                      {translateAction(log.action)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                    {translateModule(log.module)}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-muted)] max-w-xs truncate" title={log.details}>
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination 
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={handlePageChange}
        pageSize={pagination.pageSize}
        onPageSizeChange={handlePageSizeChange}
        totalItems={pagination.total}
      />
    </div>
  );
};

export default AuditTrailModule;
