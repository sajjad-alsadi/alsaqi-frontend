import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Eye, 
  Download, 
  Building,
  Tag,
  Mail,
  AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/httpClient';
import { toList, toPagination } from '../../api/utils/envelope';
import Pagination from '../../components/Pagination';
import Modal from '../../components/Modal';
import { useFormat } from '../../utils/formatService';
import { useDebounce } from '../../hooks/useDebounce';
import logger from '../../utils/logger';
import { buildCsv, downloadCsv } from '../../utils/csvExport';
import { Button } from '@/components/ui/button';
import type { Correspondence } from '@alsaqi/shared';

import IncomingForm from './IncomingForm';

interface IncomingRegisterProps {
  language: 'ar' | 'en';
  onViewDetails: (id: number) => void;
}

const IncomingRegister: React.FC<IncomingRegisterProps> = ({ language, onViewDetails }) => {
  const { t } = useTranslation();
  const { formatNumber, formatDate } = useFormat();
  const [items, setItems] = useState<Correspondence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    dept_id: '',
    start_date: '',
    end_date: ''
  });
  const debouncedSearch = useDebounce(filters.search, 500);
  const [departments, setDepartments] = useState<Array<{id: number; name_ar: string; name_en: string}>>([]);
  const [users, setUsers] = useState<Array<{id: number; name: string}>>([]);

  useEffect(() => {
    fetchData();
  }, [debouncedSearch, filters.status, filters.priority, filters.dept_id, filters.start_date, filters.end_date, pagination.page, pagination.pageSize]);

  useEffect(() => {
    fetchMetadata();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.dept_id) params.append('dept_id', filters.dept_id);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);

      const response = await api.get(`/correspondence/incoming?${params.toString()}`);
      const list = toList(response.data);
      setItems(list);
      setPagination(prev => ({ ...prev, ...toPagination(response.data, list.length) }));
    } catch (error) {
      logger.error("Failed to fetch incoming correspondence", error);
      setError(t('correspondence.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [deptsRes, usersRes] = await Promise.all([
        api.get('/org-entities'),
        api.get('/users')
      ]);
      setDepartments(deptsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      logger.error("Failed to fetch metadata", error);
    }
  };

  const handleExport = () => {
    const headers = [
      t('correspondence.seqNumber'),
      t('correspondence.letterNo'),
      t('correspondence.sender'),
      t('correspondence.subject'),
      t('correspondence.date'),
      t('correspondence.status'),
      t('correspondence.priority')
    ];

    const csvData = items.map(item => [
      item.letter_number,
      item.letter_number || '',
      item.sender_entity,
      item.subject,
      item.letter_date,
      item.status,
      item.priority
    ]);

    const csv = buildCsv(headers, csvData);
    downloadCsv(`incoming_correspondence_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Received': return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]';
      case 'Registered': return 'bg-[var(--color-info)]/10 text-[var(--color-info)]';
      case 'Under Review': return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]';
      case 'Referred': return 'bg-purple-500/10 text-purple-500';
      case 'Action Taken': return 'bg-teal-500/10 text-teal-500';
      case 'Closed': return 'bg-[var(--color-success)]/10 text-[var(--color-success)]';
      case 'Archived': return 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]';
      case 'Cancelled': return 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]';
      default: return 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]';
    }
  };

  const getStatusLabel = (status: string) => {
    if (!status) return '';
    return t(`correspondence.${status.toLowerCase().replace(/\s+/g, '_')}`);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Normal': return 'text-[var(--color-text-muted)]';
      case 'Urgent': return 'text-[var(--color-warning)] font-semibold';
      case 'Very Urgent': return 'text-[var(--color-danger)] font-semibold';
      case 'Confidential': return 'text-purple-500 font-semibold';
      case 'Restricted': return 'text-[var(--color-primary)] font-semibold';
      default: return 'text-[var(--color-text-muted)]';
    }
  };

  const getPriorityLabel = (priority: string) => {
    if (!priority) return '';
    return t(`correspondence.${priority.toLowerCase().replace(/\s+/g, '_')}`);
  };

  const isAnyFilterActive = debouncedSearch || filters.status || filters.priority || filters.dept_id || filters.start_date || filters.end_date;

  const clearAllFilters = () => {
    setFilters({ search: '', status: '', priority: '', dept_id: '', start_date: '', end_date: '' });
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="bg-[var(--color-bg-soft)]/50 p-4 rounded-2xl border border-[var(--color-border-soft)] flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={18} />
          <input 
            type="text"
            placeholder={t('correspondence.searchIncomingPlaceholder')}
            className="w-full p-2.5 ps-11 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm font-bold outline-none focus:border-[var(--color-primary)] transition-colors shadow-sm"
            value={filters.search}
            onChange={(e) => setFilters({...filters, search: e.target.value})}
          />
        </div>
        
        <select 
          className="p-2.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm font-bold outline-none focus:border-[var(--color-primary)] transition-colors shadow-sm w-auto"
          value={filters.status}
          onChange={(e) => setFilters({...filters, status: e.target.value})}
        >
          <option value="">{t('correspondence.allStatuses')}</option>
          <option value="Received">{t('correspondence.received')}</option>
          <option value="Registered">{t('correspondence.registered')}</option>
          <option value="Under Review">{t('correspondence.under_review')}</option>
          <option value="Referred">{t('correspondence.referred')}</option>
          <option value="Action Taken">{t('correspondence.action_taken')}</option>
          <option value="Closed">{t('correspondence.closed')}</option>
        </select>

        <select 
          className="p-2.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm font-bold outline-none focus:border-[var(--color-primary)] transition-colors shadow-sm w-auto"
          value={filters.priority}
          onChange={(e) => setFilters({...filters, priority: e.target.value})}
        >
          <option value="">{t('correspondence.allPriorities')}</option>
          <option value="Normal">{t('correspondence.normal')}</option>
          <option value="Urgent">{t('correspondence.urgent')}</option>
          <option value="Very Urgent">{t('correspondence.very_urgent')}</option>
          <option value="Confidential">{t('correspondence.confidential')}</option>
          <option value="Restricted">{t('correspondence.restricted')}</option>
        </select>

        <Button 
          onClick={handleExport}
          variant="outline"
          className="!py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm bg-[var(--color-card)]"
          title={t('correspondence.exportToCSV')}
        >
          <Download size={18} />
          {t('correspondence.export')}
        </Button>

        <Button 
          onClick={() => setShowAddModal(true)}
          className="!py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
        >
          <Plus size={18} />
          {t('correspondence.addNew')}
        </Button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-[var(--color-bg-soft)]/50 border-b border-[var(--color-border-soft)]">
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">
                  {t('correspondence.seqNumber')}
                </th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.letterNo')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.sender')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.subject')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.date')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.status')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.priority')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]/50">
              {loading ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 w-12 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-16 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-28 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-40 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-20 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse bg-[var(--color-border-soft)]/50 rounded-lg" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-14 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-8 w-8 animate-pulse bg-[var(--color-border-soft)]/50 rounded-xl ms-auto" /></td>
                    </tr>
                  ))}
                </>
              ) : error && items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="flex flex-col items-center gap-3 text-center py-16">
                      <div className="w-14 h-14 rounded-2xl bg-[var(--color-danger)]/5 flex items-center justify-center">
                        <AlertCircle size={24} className="text-[var(--color-danger)]" />
                      </div>
                      <p className="text-base font-semibold text-[var(--color-text-main)]">{t('correspondence.failedToLoad')}</p>
                      <p className="text-sm text-[var(--color-text-muted)] max-w-sm">{t('correspondence.checkConnection')}</p>
                      <Button variant="outline" onClick={fetchData}>
                        {t('common.retry')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    {isAnyFilterActive ? (
                      <div className="flex flex-col items-center gap-3 text-center py-16">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)]/5 flex items-center justify-center">
                          <Search size={24} className="text-[var(--color-primary)]" />
                        </div>
                        <p className="text-base font-semibold text-[var(--color-text-main)]">{t('correspondence.noFilterResults')}</p>
                        <p className="text-sm text-[var(--color-text-muted)] max-w-sm">{t('correspondence.adjustFilters')}</p>
                        <Button variant="outline" onClick={clearAllFilters}>
                          {t('correspondence.clearFilters')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-center py-16">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)]/5 flex items-center justify-center">
                          <Mail size={24} className="text-[var(--color-primary)]" />
                        </div>
                        <p className="text-base font-semibold text-[var(--color-text-main)]">{t('correspondence.noIncomingYet')}</p>
                        <p className="text-sm text-[var(--color-text-muted)] max-w-sm">{t('correspondence.incomingDescription')}</p>
                        <Button onClick={() => setShowAddModal(true)}>
                          <Plus size={16} />
                          {t('correspondence.registerIncomingLetter')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id} className="hover:bg-[var(--color-primary)]/5 transition-colors group">
                  <td className="px-6 py-4 text-xs font-bold text-[var(--color-border-strong)] tracking-widest">{formatNumber(item.letter_number)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">{formatNumber(item.letter_number) || '-'}</td>
                  <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">
                    <div className="flex items-center gap-2">
                      <Building size={14} className="text-[var(--color-text-muted)]" />
                      {item.sender_entity}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)] max-w-xs truncate">{item.subject}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[var(--color-text-main)]">{formatDate(item.letter_date)}</span>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('correspondence.recPrefix')}{formatDate(item.receipt_date)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${getStatusColor(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center gap-1.5 text-xs ${getPriorityColor(item.priority)}`}>
                      <Tag size={12} />
                      {getPriorityLabel(item.priority)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => onViewDetails(Number(item.id))}
                        className="p-2 bg-[var(--color-card)] text-[var(--color-primary)] border border-[var(--color-border-soft)] hover:border-[var(--color-primary)]/30 rounded-xl shadow-sm transition-all"
                        title={t('correspondence.viewDetails')}
                      >
                        <Eye size={16} />
                      </button>
                    </div>
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
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
        pageSize={pagination.pageSize}
        onPageSizeChange={(pageSize) => setPagination(prev => ({ ...prev, pageSize, page: 1 }))}
        totalItems={pagination.total}
      />

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('correspondence.registerIncomingTitle')} size="lg">
        <IncomingForm 
          language={language} 
          departments={departments}
          users={users}
          onSuccess={() => {
            setShowAddModal(false);
            fetchData();
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>
    </div>
  );
};

export default IncomingRegister;
