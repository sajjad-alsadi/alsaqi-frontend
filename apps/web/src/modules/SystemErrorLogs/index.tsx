import React, { useState, useEffect } from 'react';
import api from '../../api/httpClient';
import { toList, toPagination } from '../../api/utils/envelope';
import { AlertCircle, RefreshCw, Trash2, Download, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../utils/formatService';
import Pagination from '../../components/Pagination';
import Modal from '../../components/Modal';
import SystemErrorAnalytics from './SystemErrorAnalytics';
import logger from '../../utils/logger';
import { TableSkeleton } from '../../components/SkeletonLoader';

interface SystemError {
  id: number;
  message: string;
  stack: string;
  module: string;
  timestamp: string;
  severity?: 'error' | 'warning' | 'info';
}

interface SystemErrorLogsProps {
  embedded?: boolean;
}

const SystemErrorLogs: React.FC<SystemErrorLogsProps> = ({ embedded = false }) => {
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const [logs, setLogs] = useState<SystemError[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const list = toList<SystemError>(response.data);
      setLogs(list);
      setPagination(prev => ({ ...prev, ...toPagination(response.data, list.length) }));
      setError(null);
    } catch (error) {
      logger.error('Error fetching logs:', error);
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/system-errors/analytics');
      setAnalytics(response.data);
    } catch (error) {
      logger.error('Error fetching analytics:', error);
    }
  };

  const handleClearLogs = async () => {
    try {
      setIsClearing(true);
      await api.delete('/system-errors');
      await Promise.all([fetchLogs(), fetchAnalytics()]);
      setIsClearModalOpen(false);
    } catch (error) {
      logger.error('Error clearing logs:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const exportLogs = async () => {
    try {
      const response = await api.get('/system-errors/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `system-errors-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Error exporting logs:', error);
    }
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

    const connect = async () => {
      if (!isComponentMounted) return;
      
      try {
        // Fetch a short-lived WebSocket token from the server
        const res = await api.get('/auth/ws-token');
        const wsToken = res.data?.token;
        if (!wsToken) return;

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = (import.meta as any).env as Record<string, string> | undefined;
        const wsBaseUrl = env?.['VITE_WS_URL'] || `${protocol}://${window.location.host}`;
        ws = new WebSocket(`${wsBaseUrl}?token=${wsToken}`);
        
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
          } catch {
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
      } catch {
        // Token fetch failed - retry with backoff
        if (isComponentMounted) {
          const delay = Math.min(5000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(connect, delay);
          reconnectAttempts++;
        }
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
        } catch {
          // Ignore close errors
        }
      }
    };
  }, []); // Empty dependencies!

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'warning': return 'text-[var(--color-warning)] bg-[var(--color-warning)]/10';
      case 'info': return 'text-[var(--color-info)] bg-[var(--color-info)]/10';
      default: return 'text-[var(--color-danger)] bg-[var(--color-danger)]/10';
    }
  };

  return (
    <div className="space-y-6" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-[var(--color-primary)] rounded-xl flex items-center justify-center text-white shadow-[var(--shadow-primary)]">
              <AlertCircle size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-main)] tracking-tight">{t('systemErrorLogs.title')}</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t('common.stayUpdated')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons with labels */}
      <div className="flex items-center gap-2">
        <button onClick={fetchLogs} className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl hover:bg-[var(--color-bg-soft)] transition-colors shadow-sm text-sm text-[var(--color-text-muted)] cursor-pointer">
          <RefreshCw size={16} />
          <span>{t('common.refresh')}</span>
        </button>
        <button onClick={exportLogs} className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl hover:bg-[var(--color-bg-soft)] transition-colors shadow-sm text-sm text-[var(--color-text-muted)] cursor-pointer">
          <Download size={16} />
          <span>{t('common.export')}</span>
        </button>
        <button onClick={() => setIsClearModalOpen(true)} className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl hover:bg-[var(--color-bg-soft)] transition-colors shadow-sm text-sm text-[var(--color-danger)] cursor-pointer">
          <Trash2 size={16} />
          <span>{t('common.clear')}</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      <Modal 
        isOpen={isClearModalOpen} 
        onClose={() => !isClearing && setIsClearModalOpen(false)}
        title={t('systemErrorLogs.confirmClearLogs')}
      >
        <div className="p-6 text-center">
          <div className="w-14 h-14 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} />
          </div>
          <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2">{t('systemErrorLogs.importantAlert')}</h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-6 leading-relaxed">
            {t('systemErrorLogs.clearLogsWarning')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsClearModalOpen(false)}
              disabled={isClearing}
              className="px-5 py-2.5 rounded-xl font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] transition-colors border border-[var(--color-border-soft)] cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleClearLogs}
              disabled={isClearing}
              className="px-5 py-2.5 rounded-xl font-medium bg-[var(--color-danger)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isClearing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-[var(--color-bg-soft)]/50 rounded-xl border border-[var(--color-border-soft)]/50">
        <input 
          type="text" 
          placeholder={t('systemErrorLogs.filterByModule')} 
          value={moduleFilter} 
          onChange={(e) => setModuleFilter(e.target.value)} 
          className="w-full p-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm text-[var(--color-text-main)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all outline-none"
          aria-label={t('systemErrorLogs.filterByModule')}
        />
        
        <input 
          type="text" 
          placeholder={t('systemErrorLogs.filterByUserId')} 
          value={userIdFilter} 
          onChange={(e) => setUserIdFilter(e.target.value)} 
          className="w-full p-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm text-[var(--color-text-main)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all outline-none"
          aria-label={t('systemErrorLogs.filterByUserId')}
        />
        
        <select 
          value={severityFilter} 
          onChange={(e) => setSeverityFilter(e.target.value)} 
          className="w-full p-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm text-[var(--color-text-main)] focus:ring-2 focus:ring-[var(--color-primary)]/20 outline-none cursor-pointer"
          aria-label={t('systemErrorLogs.severity')}
        >
          <option value="">{t('systemErrorLogs.allSeverities')}</option>
          <option value="error">{t('systemErrorLogs.error')}</option>
          <option value="warning">{t('systemErrorLogs.warning')}</option>
          <option value="info">{t('systemErrorLogs.info')}</option>
        </select>

        <input 
          type="date" 
          value={startDate} 
          onChange={(e) => setStartDate(e.target.value)} 
          max={endDate || undefined}
          className="w-full p-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm text-[var(--color-text-main)] outline-none"
          aria-label={t('systemErrorLogs.startDate')}
        />

        <input 
          type="date" 
          value={endDate} 
          onChange={(e) => setEndDate(e.target.value)} 
          min={startDate || undefined}
          className="w-full p-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm text-[var(--color-text-main)] outline-none"
          aria-label={t('systemErrorLogs.endDate')}
        />
      </div>
      
      <SystemErrorAnalytics data={analytics} />
      
      {loading && (Array.isArray(logs) ? logs : []).length === 0 ? (
        <TableSkeleton rows={6} cols={5} />
      ) : error && (Array.isArray(logs) ? logs : []).length === 0 ? (
        <div className="bg-[var(--color-card)] border border-[var(--color-border-soft)] shadow-sm rounded-2xl p-16 text-center" role="alert">
          <AlertCircle className="text-[var(--color-danger)] mx-auto mb-3" size={40} />
          <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
        </div>
      ) : (
      <div className="bg-[var(--color-card)] border border-[var(--color-border-soft)] shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border-soft)]">
                <th className="px-6 py-4 text-start text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t('common.time')}</th>
                <th className="px-6 py-4 text-start text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t('common.module')}</th>
                <th className="px-6 py-4 text-start text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t('systemErrorLogs.severity')}</th>
                <th className="px-6 py-4 text-start text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t('common.message')}</th>
                <th className="px-6 py-4 text-start"><span className="sr-only">{t('common.expand')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]/50">
              {(Array.isArray(logs) ? logs : []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <AlertCircle className="text-[var(--color-border-strong)] mx-auto mb-3" size={40} />
                    <p className="text-sm text-[var(--color-text-muted)]">{t('systemErrorLogs.noErrorsLogged')}</p>
                  </td>
                </tr>
              ) : (Array.isArray(logs) ? logs : []).map(log => (
                <React.Fragment key={log.id}>
                  <tr 
                    className="hover:bg-[var(--color-bg-soft)]/50 cursor-pointer transition-colors group" 
                    onClick={() => toggleRow(log.id)}
                    aria-expanded={expandedRows.includes(log.id)}
                  >
                    <td className="px-6 py-4 text-xs text-[var(--color-text-muted)] font-mono whitespace-nowrap">{formatDate(log.timestamp)}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-0.5 bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] rounded-md text-[10px] font-semibold uppercase tracking-wider">
                        {log.module}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${getSeverityColor(log.severity)}`}>
                        {t(`systemErrorLogs.${log.severity || 'error'}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[var(--color-text-main)] line-clamp-1 group-hover:text-[var(--color-danger)] transition-colors">{log.message}</span>
                    </td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)]">
                      {expandedRows.includes(log.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                  </tr>
                  {expandedRows.includes(log.id) && (
                    <tr className="bg-[var(--color-bg-soft)]/30">
                      <td colSpan={5} className="px-6 py-5">
                        <div className="bg-[var(--color-card)] p-5 rounded-xl border border-[var(--color-border-soft)] space-y-4">
                          {log.stack && (
                            <div className="flex flex-col gap-2">
                              <h4 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t('systemErrorLogs.stackTrace')}</h4>
                              <pre className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-soft)] p-5 rounded-xl overflow-x-auto leading-relaxed border border-[var(--color-border-soft)]">
                                {log.stack}
                              </pre>
                            </div>
                          )}
                          {!log.stack && (
                            <p className="text-sm text-[var(--color-text-muted)] italic">{t('systemErrorLogs.noStackTrace')}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-[var(--color-border-soft)] bg-[var(--color-bg-soft)]/20">
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
      )}
    </div>
  );
};

export default SystemErrorLogs;
