import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { AlertCircle, RefreshCw, Trash2, Download, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../services/formatService';
import Pagination from '../../components/Pagination';
import Modal from '../../components/Modal';
import SystemErrorAnalytics from './SystemErrorAnalytics';

interface SystemError {
  id: number;
  message: string;
  stack: string;
  module: string;
  timestamp: string;
  severity?: 'error' | 'warning' | 'info';
}

const SystemErrorLogs: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const [logs, setLogs] = useState<SystemError[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [moduleFilter, setModuleFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [expandedRows, setExpandedRows] = useState<number[]>([]);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/system-errors', {
        params: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          module: moduleFilter || undefined,
          user_id: userIdFilter || undefined,
          severity: severityFilter || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined
        }
      });
      if (response.data.data) {
        setLogs(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        }));
      } else {
        setLogs(response.data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/system-errors/analytics');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const handleClearLogs = async () => {
    try {
      setIsClearing(true);
      await api.delete('/system-errors');
      await Promise.all([fetchLogs(), fetchAnalytics()]);
      setIsClearModalOpen(false);
    } catch (error) {
      console.error('Error clearing logs:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const exportLogs = () => {
    window.location.href = '/api/system-errors/export';
  };

  const fetchLogsRef = React.useRef(fetchLogs);
  const fetchAnalyticsRef = React.useRef(fetchAnalytics);

  useEffect(() => {
    fetchLogsRef.current = fetchLogs;
    fetchAnalyticsRef.current = fetchAnalytics;
  });

  useEffect(() => {
    fetchLogs();
    fetchAnalytics();
  }, [pagination.page, pagination.pageSize, moduleFilter, userIdFilter, severityFilter, startDate, endDate]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;
    let reconnectAttempts = 0;
    let isComponentMounted = true;

    const connect = () => {
      if (!isComponentMounted) return;
      
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${window.location.host}`);
        
        ws.onopen = () => {
          reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'NEW_SYSTEM_ERROR') {
              fetchLogsRef.current();
              fetchAnalyticsRef.current();
            }
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (isComponentMounted) {
            const delay = Math.min(5000 * Math.pow(2, reconnectAttempts), 30000);
            reconnectTimeout = setTimeout(connect, delay);
            reconnectAttempts++;
          }
        };

        ws.onerror = () => {
          // Error handled by onclose
        };
      } catch (e) {
        console.error("Failed to initiate WebSocket:", e);
      }
    };

    connect();

    return () => {
      isComponentMounted = false;
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null; // Prevent reconnect on unmount
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch (e) {
          // Ignore close errors
        }
      }
    };
  }, []); // Empty dependencies!

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'info': return 'text-blue-600 bg-blue-100';
      default: return 'text-red-600 bg-red-100';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 space-y-10" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <AlertCircle size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">{t('systemErrorLogs.title')}</h1>
            <p className="text-sm text-slate-400 font-bold mt-2">{t('common.stayUpdated')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLogs} title={t('common.refresh')} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors shadow-sm">
            <RefreshCw size={20} className="text-slate-600" />
          </button>
          <button onClick={exportLogs} title={t('common.export')} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors shadow-sm">
            <Download size={20} className="text-slate-600" />
          </button>
          <button onClick={() => setIsClearModalOpen(true)} title={t('common.clear')} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors text-rose-500 shadow-sm">
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal 
        isOpen={isClearModalOpen} 
        onClose={() => !isClearing && setIsClearModalOpen(false)}
        title={t('systemErrorLogs.confirmClearLogs')}
      >
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={32} />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">{t('systemErrorLogs.importantAlert')}</h3>
          <p className="text-slate-500 font-bold mb-8 leading-relaxed">
            {t('systemErrorLogs.clearLogsWarning')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsClearModalOpen(false)}
              disabled={isClearing}
              className="px-6 py-3 rounded-xl font-black text-slate-500 hover:bg-slate-50 transition-colors border border-slate-100"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleClearLogs}
              disabled={isClearing}
              className="px-6 py-3 rounded-xl font-black bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isClearing ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  {t('systemErrorLogs.clearing')}
                </>
              ) : (
                t('systemErrorLogs.confirmDelete')
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Search & Filters Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-6 bg-slate-100/50 rounded-2xl border border-slate-200/50 shadow-inner">
        <div className="relative group">
          <input 
            type="text" 
            placeholder={t('systemErrorLogs.filterByModule')} 
            value={moduleFilter} 
            onChange={(e) => setModuleFilter(e.target.value)} 
            className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all outline-none" 
          />
        </div>
        
        <input 
          type="text" 
          placeholder={t('systemErrorLogs.filterByUserId')} 
          value={userIdFilter} 
          onChange={(e) => setUserIdFilter(e.target.value)} 
          className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all outline-none" 
        />
        
        <select 
          value={severityFilter} 
          onChange={(e) => setSeverityFilter(e.target.value)} 
          className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-700 focus:ring-2 focus:ring-[var(--color-primary)]/20 outline-none cursor-pointer"
        >
          <option value="">{t('systemErrorLogs.allSeverities')}</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>

        <div className="relative">
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none" 
          />
        </div>

        <div className="relative">
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none" 
          />
        </div>
      </div>
      
      <SystemErrorAnalytics data={analytics} />
      
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-8 py-6 text-start text-xs font-black text-slate-400 uppercase tracking-widest">{t('common.time')}</th>
                <th className="px-8 py-6 text-start text-xs font-black text-slate-400 uppercase tracking-widest">{t('common.module')}</th>
                <th className="px-8 py-6 text-start text-xs font-black text-slate-400 uppercase tracking-widest">{t('systemErrorLogs.severity')}</th>
                <th className="px-8 py-6 text-start text-xs font-black text-slate-400 uppercase tracking-widest">{t('common.message')}</th>
                <th className="px-8 py-6 text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <RefreshCw className="animate-spin text-[var(--color-primary)] mx-auto mb-4" size={32} />
                    <p className="text-slate-400 font-bold">{t('common.loading')}</p>
                  </td>
                </tr>
              ) : (Array.isArray(logs) ? logs : []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <AlertCircle className="text-slate-200 mx-auto mb-4" size={48} />
                    <p className="text-slate-400 font-bold">{t('systemErrorLogs.noErrorsLogged')}</p>
                  </td>
                </tr>
              ) : (Array.isArray(logs) ? logs : []).map(log => (
                <React.Fragment key={log.id}>
                  <tr 
                    className="hover:bg-slate-50/50 cursor-pointer transition-all duration-200 group" 
                    onClick={() => toggleRow(log.id)}
                  >
                    <td className="px-8 py-5 text-sm font-bold text-slate-500 font-mono">{formatDate(log.timestamp)}</td>
                    <td className="px-8 py-5">
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                        {log.module}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getSeverityColor(log.severity)}`}>
                        {t(`systemErrorLogs.${log.severity || 'error'}`)}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-rose-600 transition-colors">{log.message}</span>
                    </td>
                    <td className="px-8 py-5 text-slate-400 group-hover:text-slate-600">
                      {expandedRows.includes(log.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </td>
                  </tr>
                  {expandedRows.includes(log.id) && (
                    <tr className="bg-slate-50/30">
                      <td colSpan={5} className="px-8 py-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
                          <div className="flex flex-col gap-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('systemErrorLogs.stackTrace')}</h4>
                            <div className="relative group">
                              <pre className="text-xs font-mono text-slate-500 bg-slate-900/95 p-6 rounded-2xl overflow-x-auto leading-relaxed border-l-4 border-rose-500">
                                {log.stack}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-8 border-t border-slate-50 bg-slate-50/20">
          <Pagination 
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
            pageSize={pagination.pageSize}
            onPageSizeChange={(pageSize) => setPagination(prev => ({ ...prev, pageSize, page: 1 }))}
            totalItems={pagination.total}
          />
        </div>
      </div>
    </div>
  );
};

export default SystemErrorLogs;
