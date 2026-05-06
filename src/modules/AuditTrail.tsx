import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { AuditTrail } from '../types';
import { History, Search, Filter, Clock, User, Activity, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import api from '../services/api';
import { useFormat } from '../services/formatService';
import Pagination from '../components/Pagination';

const AuditTrailModule: React.FC = () => {
  const { token } = useAppContext();
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
    fetchLogs();
  }, [pagination.page, pagination.pageSize, filterModule, filterAction, searchTerm]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit-trail', {
        params: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          module: filterModule !== 'all' ? filterModule : undefined,
          action: filterAction !== 'all' ? filterAction : undefined,
          username: searchTerm || undefined
        }
      });
      
      const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
      const pagin = res.data.pagination || { total: data.length, totalPages: 1 };
      
      setLogs(data);
      setPagination(prev => ({
        ...prev,
        total: pagin.total,
        totalPages: pagin.totalPages
      }));
    } catch (err) {
      console.error(err);
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
    <div className="space-y-10" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <History size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('common.trail')}</h2>
            <p className="text-sm text-slate-400 font-bold mt-2">{t('common.trailSubtitle')}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder={t('common.search')}
              className="input-field !ps-14"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select 
              className="input-field py-2 text-sm min-w-[150px]"
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
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
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.timestamp_label')}</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.user_label')}</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.action_label')}</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.module')}</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(Array.isArray(filteredLogs) ? filteredLogs : []).map((log, idx) => (
                <motion.tr 
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-primary/5 transition-colors group"
                >
                  <td className="px-10 py-6 text-xs font-bold text-slate-400 whitespace-nowrap">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-[10px] font-black text-primary shadow-sm">
                        {log.user.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-black text-slate-800">{translateName(log.user)}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <span className={`inline-flex items-center px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      log.action.toLowerCase().includes('delete') ? 'bg-rose-100 text-rose-600' :
                      log.action.toLowerCase().includes('created') ? 'bg-emerald-100 text-emerald-600' :
                      log.action.toLowerCase().includes('failed') ? 'bg-rose-100 text-rose-600' : 'bg-primary/10 text-primary'
                    }`}>
                      {translateAction(log.action)}
                    </span>
                  </td>
                  <td className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">
                    {translateModule(log.module)}
                  </td>
                  <td className="px-10 py-6 text-sm font-bold text-slate-500 max-w-xs truncate" title={log.details}>
                    {log.details}
                  </td>
                </motion.tr>
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
