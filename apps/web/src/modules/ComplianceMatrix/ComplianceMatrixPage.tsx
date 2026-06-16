import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, Search, Filter, Plus, Edit2, Trash2, Eye, 
  Download, FileText, CheckCircle, AlertTriangle, XCircle, AlertCircle,
  LayoutGrid, List, BarChart3, Calendar, User, Building,
  Tag, Info, MoreHorizontal, ChevronRight, FileDown, Layers, Upload,
  type LucideIcon
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import api from '../../api/httpClient';
import { toList, toData } from '../../api/utils/envelope';
import Modal from '../../components/Modal';
import { useDepartments } from '../../api/hooks/useDepartments';
import { useFormat } from '../../utils/formatService';
import toast from 'react-hot-toast';
import logger from '../../utils/logger';
import { Button } from '@/components/ui/button';
import { useFileUploadValidation } from '../../hooks/useFileUploadValidation';
import { TableSkeleton } from '../../components/SkeletonLoader';
import VirtualizedTable from '../../components/VirtualizedTable';
import { getStaggerDelay } from '../../utils/animation';

// --- Types ---
type ComplianceStatus = 'compliant' | 'partial' | 'non_compliant' | 'under_review';
type SourceType = 'cbi_instruction' | 'law' | 'internal_policy' | 'admin_decision';

interface ComplianceItem {
  id: string;
  ref_number: string;
  title: string;
  source_type: SourceType;
  issuing_authority?: string | null;
  category?: string | null;
  issue_date?: string | null;
  effective_date?: string | null;
  review_date?: string | null;
  compliance_status: ComplianceStatus;
  maturity_score?: number | null;
  gap_notes?: string | null;
  responsible_person_id?: string | null;
  responsible_person_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  description?: string | null;
  keywords?: string | null;
  version?: string | null;
  attachment_path?: string | null;
  open_findings_count?: number;
}

interface ComplianceSummary {
  total?: number;
}

interface UserOption {
  id: string | number;
  name?: string;
  full_name?: string;
  username?: string;
}

// --- Static color lookup maps (Defect 1) ---
// Complete, literal Tailwind class strings keyed by color token. Tailwind's
// content scanner only matches whole literal classes in source, and `apps/web`
// has no `tailwind.config`/safelist, so any string-interpolated color utility
// (a token spliced into a `bg-...-50`-style class) is purged from production
// CSS. These maps emit every class as a complete literal so the matrix tab,
// dashboard tab, and registry status-change dropdown colors survive a
// production build.

// Matrix tab — tokens from statusConfig[*].color: emerald, amber, rose, slate.
const STATUS_COLOR_CLASSES: Record<
  string,
  { header: string; icon: string; badge: string; accentBar: string }
> = {
  emerald: {
    header: 'border-emerald-500/30',
    icon: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    accentBar: 'bg-emerald-400/50 group-hover:bg-emerald-500',
  },
  amber: {
    header: 'border-amber-500/30',
    icon: 'bg-amber-50 text-amber-600 border-amber-100',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    accentBar: 'bg-amber-400/50 group-hover:bg-amber-500',
  },
  rose: {
    header: 'border-rose-500/30',
    icon: 'bg-rose-50 text-rose-600 border-rose-100',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    accentBar: 'bg-rose-400/50 group-hover:bg-rose-500',
  },
  slate: {
    header: 'border-slate-500/30',
    icon: 'bg-slate-50 text-slate-600 border-slate-100',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    accentBar: 'bg-slate-400/50 group-hover:bg-slate-500',
  },
};

// Dashboard tab stat cards — tokens from stats[].color: primary, emerald, rose,
// amber, slate.
const STAT_COLOR_CLASSES: Record<
  string,
  { card: string; icon: string; value: string }
> = {
  primary: {
    card: 'border-b-primary-500 shadow-primary-500/5 hover:shadow-primary-500/10',
    icon: 'bg-primary-50 text-primary-600',
    value: 'group-hover:text-primary-600',
  },
  emerald: {
    card: 'border-b-emerald-500 shadow-emerald-500/5 hover:shadow-emerald-500/10',
    icon: 'bg-emerald-50 text-emerald-600',
    value: 'group-hover:text-emerald-600',
  },
  rose: {
    card: 'border-b-rose-500 shadow-rose-500/5 hover:shadow-rose-500/10',
    icon: 'bg-rose-50 text-rose-600',
    value: 'group-hover:text-rose-600',
  },
  amber: {
    card: 'border-b-amber-500 shadow-amber-500/5 hover:shadow-amber-500/10',
    icon: 'bg-amber-50 text-amber-600',
    value: 'group-hover:text-amber-600',
  },
  slate: {
    card: 'border-b-slate-500 shadow-slate-500/5 hover:shadow-slate-500/10',
    icon: 'bg-slate-50 text-slate-600',
    value: 'group-hover:text-slate-600',
  },
};

// Dashboard tab source distribution bars — tokens from sourceColors[*]:
// primary, purple, emerald, orange.
const SOURCE_COLOR_CLASSES: Record<string, { label: string; bar: string }> = {
  primary: { label: 'text-primary-600', bar: 'from-primary-500 to-primary-600' },
  purple: { label: 'text-purple-600', bar: 'from-purple-500 to-purple-600' },
  emerald: { label: 'text-emerald-600', bar: 'from-emerald-500 to-emerald-600' },
  orange: { label: 'text-orange-600', bar: 'from-orange-500 to-orange-600' },
};

// Registry tab status-change dropdown icons — tokens from statusConfig[*].color.
const STATUS_ICON_CLASSES: Record<string, string> = {
  emerald: 'text-emerald-500',
  amber: 'text-amber-500',
  rose: 'text-rose-500',
  slate: 'text-slate-500',
};

export default function ComplianceMatrix() {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  const statusConfig: Record<ComplianceStatus, { color: string, icon: LucideIcon, label: string }> = {
    compliant: { color: 'emerald', icon: CheckCircle, label: t('complianceMatrix.compliant') },
    partial: { color: 'amber', icon: AlertTriangle, label: t('complianceMatrix.partial') },
    non_compliant: { color: 'rose', icon: XCircle, label: t('complianceMatrix.nonCompliant') },
    under_review: { color: 'slate', icon: AlertCircle, label: t('complianceMatrix.underReview') },
  };

  const sourceLabels: Record<SourceType, string> = {
    cbi_instruction: t('complianceMatrix.cbiInstruction'),
    law: t('complianceMatrix.law'),
    internal_policy: t('complianceMatrix.internalPolicy'),
    admin_decision: t('complianceMatrix.adminDecision'),
  };

  const sourceColors: Record<SourceType, string> = {
    cbi_instruction: 'primary',
    law: 'purple',
    internal_policy: 'emerald',
    admin_decision: 'orange',
  };

  const [activeTab, setActiveTab] = useState<'registry'|'matrix'|'dashboard'>('registry');
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Stable close handler to prevent unnecessary re-renders cascading through Modal → FocusTrap
  const handleModalClose = useCallback(() => { setIsModalOpen(false); setFile(null); }, []);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ComplianceItem | null>(null);
  const [formData, setFormData] = useState<Partial<ComplianceItem>>({ compliance_status: 'under_review' });
  const [file, setFile] = useState<File | null>(null);
  const { validateAndFilter } = useFileUploadValidation({
    allowedExtensions: ['.pdf'],
    allowedMimeTypes: ['application/pdf'],
  });

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Dropdown data
  const [users, setUsers] = useState<UserOption[]>([]);
  const { departments } = useDepartments();

  // Debounce the search input so a burst of keystrokes collapses into a single
  // refetch once typing pauses (Defect 2). Filter selects stay direct deps below.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchItems();
    fetchSummary();
  }, [filterSource, filterStatus, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search) q.append('search', search);
      if (filterSource) q.append('source_type', filterSource);
      if (filterStatus) q.append('compliance_status', filterStatus);
      const res = await api.get('/compliance?' + q.toString());
      setItems(toList(res.data));
      setError(null);
    } catch (e) {
      logger.error('Operation failed', e);
      setError(t('complianceMatrix.loadError'));
      toast.error(t('complianceMatrix.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await api.get('/compliance/summary');
      setSummary(toData(res.data) ?? null);
    } catch (e) {
      logger.error('Operation failed', e);
    }
  };

  const fetchUsers = async () => {
    // Defect 5: request the canonical user-list endpoint (`/users/list`) instead
    // of the statistics summary endpoint (`/users/summary`). Wrap the primary
    // attempt in its own try/catch so a primary-call failure still reaches the
    // `/users` fallback (rather than being swallowed before the fallback runs).
    try {
      const uRes = await api.get('/users/list');
      const listUsers = toList<UserOption>(uRes.data);
      if (listUsers.length > 0) {
        setUsers(listUsers);
        return;
      }
    } catch (e) {
      // Defect 4: log instead of silently swallowing, matching the other fetchers.
      logger.error('Operation failed', e);
    }

    // Fallback to `/users` — reachable even when the primary request failed.
    try {
      const uResFallback = await api.get('/users');
      setUsers(toList<UserOption>(uResFallback.data));
    } catch (e) {
      logger.error('Operation failed', e);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          data.append(key, value.toString());
        }
      });
      if (file) {
        data.append('attachment', file);
      }

      const config = {
        headers: { 'Content-Type': 'multipart/form-data' }
      };

      if (selectedItem?.id) {
        await api.put('/compliance/' + selectedItem.id, data, config);
        toast.success(t('complianceMatrix.updateSuccess'));
      } else {
        await api.post('/compliance', data, config);
        toast.success(t('complianceMatrix.addSuccess'));
      }
      setIsModalOpen(false);
      setFile(null);
      fetchItems();
      fetchSummary();
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('complianceMatrix.saveError'));
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await api.delete('/compliance/' + itemToDelete);
      toast.success(t('complianceMatrix.deleteSuccess'));
      fetchItems();
      fetchSummary();
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (e) {
      logger.error('Operation failed', e);
      toast.error(t('complianceMatrix.deleteError'));
    }
  };

  const handleDelete = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.patch('/compliance/' + id + '/status', { compliance_status: status });
      toast.success(t('complianceMatrix.statusUpdateSuccess'));
      fetchItems();
      fetchSummary();
    } catch (e) {
      logger.error('Operation failed', e);
      toast.error(t('complianceMatrix.statusUpdateError'));
    }
  };

  const getStatusBadge = (status: ComplianceStatus) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm
        ${status === 'compliant' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
          status === 'non_compliant' ? 'bg-rose-50 text-rose-700 border-rose-100' : 
          status === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-100' : 
          'bg-[var(--color-bg-soft)] text-[var(--color-text-main)] border-[var(--color-border-soft)]'}`}>
        <Icon size={12} strokeWidth={3} />
        {config.label}
      </span>
    );
  };

  const getSourceBadge = (type: SourceType) => {
    const label = sourceLabels[type] || type;
    const color = sourceColors[type] || 'slate';
    return (
      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tighter border
        ${color === 'primary' ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20' :
          color === 'purple' ? 'bg-purple-50 text-purple-600 border-purple-100' :
          color === 'emerald' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
          'bg-orange-50 text-orange-600 border-orange-100'}`}>
        {label}
      </span>
    );
  };

  // --- RENDERS ---
  const renderRegistry = () => (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between gap-4 bg-[var(--color-bg-soft)]/50 p-4 rounded-2xl border border-[var(--color-border-soft)]">
        <div className="relative group flex-1 max-w-md">
          <Search className="absolute end-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-primary)] transition-colors" size={18} />
          <input 
            type="text" placeholder={t('complianceMatrix.searchPlaceholder')} 
            className="w-full bg-[var(--color-card)] pe-12 ps-4 py-2.5 rounded-xl border border-[var(--color-border-soft)] text-sm focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all shadow-sm"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3 lg:pb-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-sm cursor-pointer">
            <Filter size={14} className="text-[var(--color-text-muted)]" />
            <select className="bg-transparent text-xs font-medium outline-none border-none p-0 cursor-pointer min-w-[120px]" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option value="">{t('complianceMatrix.allSources')}</option>
              {Object.entries(sourceLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-sm">
            <ShieldCheck size={14} className="text-[var(--color-text-muted)]" />
            <select className="bg-transparent text-xs font-medium outline-none border-none p-0 cursor-pointer min-w-[120px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">{t('complianceMatrix.allStatuses')}</option>
              {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] text-white rounded-xl shadow-md shadow-[var(--color-primary)]/20 text-sm font-bold whitespace-nowrap" 
            onClick={() => { setSelectedItem(null); setFormData({ compliance_status: 'under_review' }); setIsModalOpen(true); }}
          >
            <Plus size={18} /> {t('complianceMatrix.addRecord')}
          </motion.button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <TableSkeleton rows={6} cols={7} />
      ) : error && items.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20" role="alert">
          <AlertCircle size={48} className="text-[var(--color-danger)] mb-4" />
          <p className="text-[var(--color-text-muted)] font-bold">{error}</p>
        </div>
      ) : (
      <div className="glass-card">
        <VirtualizedTable
          items={items}
          rowHeight={85}
          height={700}
          threshold={30}
          colSpan={7}
          getKey={(item) => item.id}
          containerClassName="overflow-x-visible lg:overflow-x-auto"
          tableClassName="w-full text-start"
          bodyClassName="divide-y divide-[var(--color-border-soft)]"
          emptyState={
            <div className="flex flex-col items-center justify-center py-20 bg-[var(--color-card)]/20">
              <div className="bg-[var(--color-bg-main)] p-6 rounded-full border-2 border-dashed border-[var(--color-border-strong)] mb-4 animate-pulse">
                <ShieldCheck size={48} className="text-[var(--color-border-strong)]" />
              </div>
              <p className="text-[var(--color-text-muted)] font-bold">{t('complianceMatrix.noRecords')}</p>
              <p className="text-[var(--color-text-muted)] text-sm mt-1">{t('complianceMatrix.tryAdjustFilters')}</p>
            </div>
          }
          head={
              <tr className="border-b border-[var(--color-border-soft)] bg-[var(--color-bg-soft)]/50">
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('complianceMatrix.ref')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('complianceMatrix.titleData')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('complianceMatrix.source')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('complianceMatrix.complianceStatus')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('complianceMatrix.responsible', t('complianceMatrix.personResp'))}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('complianceMatrix.review')}</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('complianceMatrix.actions')}</th>
              </tr>
          }
          renderRow={(item, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: getStaggerDelay(idx) }}
                    key={item.id} 
                    className="hover:bg-[var(--color-primary)]/5 transition-colors group"
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors bg-[var(--color-bg-main)] px-2 py-1 rounded border border-[var(--color-border-soft)] uppercase">
                        {item.ref_number}
                      </span>
                    </td>
                    <td className="px-6 py-5 min-w-[200px]">
                      <div className="font-bold text-[var(--color-text-main)] leading-tight mb-1 truncate max-w-sm" title={item.title}>{item.title}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-[var(--color-text-muted)] flex items-center gap-1 font-medium">
                          <Tag size={10} /> {item.category || t('complianceMatrix.noCategory')}
                        </span>
                        {item.open_findings_count ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                            <AlertTriangle size={10} /> {formatNumber(item.open_findings_count)} {t('complianceMatrix.remarks')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">{getSourceBadge(item.source_type)}</td>
                    <td className="px-6 py-5 whitespace-nowrap">{getStatusBadge(item.compliance_status)}</td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                         <div className="w-7 h-7 rounded-full bg-[var(--color-bg-main)] flex items-center justify-center border border-[var(--color-border-soft)]">
                            <User size={12} className="text-[var(--color-text-muted)]" />
                         </div>
                         <div className="text-xs font-bold text-[var(--color-text-main)]">{item.responsible_person_name || t('complianceMatrix.notSpecified')}</div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${item.review_date && new Date(item.review_date) < new Date() ? 'text-rose-500' : 'text-[var(--color-text-muted)]'}`}>
                          <Calendar size={10} /> {item.review_date || '-- / -- / --'}
                        </span>
                        {item.review_date && new Date(item.review_date) < new Date() && (
                          <span className="text-[8px] font-bold text-rose-400 uppercase tracking-tighter">{t('complianceMatrix.overdue')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setSelectedItem(item); setFormData(item); setIsViewModalOpen(true); }} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-lg transition-all" title={t('common.view')}><Eye size={18} /></button>
                        <button onClick={() => { setSelectedItem(item); setFormData(item); setIsModalOpen(true); }} className="p-2 text-[var(--color-text-muted)] hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all" title={t('common.edit')}><Edit2 size={18} /></button>
                        
                        <div className="relative group/actions">
                          <button className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] rounded-lg transition-all">
                            <MoreHorizontal size={18} />
                          </button>
                          <div className="absolute start-0 bottom-full mb-1 hidden group-hover/actions:flex flex-col bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-xl z-[100] min-w-[140px] animate-in fade-in slide-in-from-bottom-2 duration-200">
                             <div className="px-3 py-2 text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)] uppercase tracking-widest text-center">{t('complianceMatrix.changeStatus')}</div>
                             {Object.entries(statusConfig).map(([k,v]) => (
                               <button 
                                 key={k}
                                 onClick={() => updateStatus(item.id, k as ComplianceStatus)}
                                 className="px-4 py-2 text-[11px] font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] text-end flex items-center gap-2 transition-colors"
                               >
                                 <v.icon size={12} className={STATUS_ICON_CLASSES[v.color]} />
                                 {v.label}
                               </button>
                             ))}
                             <div className="border-t border-[var(--color-border-soft)] mt-1">
                                <button onClick={() => handleDelete(item.id)} className="w-full px-4 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-50 text-end flex items-center gap-2 transition-colors">
                                  <Trash2 size={12} /> {t('common.delete')}
                                </button>
                             </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                )}
        />
      </div>
      )}
    </div>
  );

  const renderMatrix = () => {
    const statuses: ComplianceStatus[] = ['compliant', 'partial', 'non_compliant', 'under_review'];
    
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-[var(--color-bg-soft)]/50 p-4 rounded-2xl border border-[var(--color-border-soft)]">
           <div>
              <h3 className="font-bold text-[var(--color-text-main)] uppercase tracking-tighter flex items-center gap-2">
                <Layers size={18} className="text-[var(--color-primary)]" /> {t('complianceMatrix.gapMatrix')}
              </h3>
              <p className="text-[10px] text-[var(--color-text-muted)] font-bold">{t('complianceMatrix.gapMatrixDesc')}</p>
           </div>
           <div className="flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-[var(--color-card)] border border-[var(--color-border-soft)] hover:border-[var(--color-border-strong)] text-[var(--color-text-muted)] rounded-xl text-xs font-bold transition-all shadow-sm group">
                <FileDown size={14} className="group-hover:translate-y-0.5 transition-transform" /> {t('complianceMatrix.exportPdf')}
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-[var(--color-card)] border border-[var(--color-border-soft)] hover:border-[var(--color-border-strong)] text-[var(--color-text-muted)] rounded-xl text-xs font-bold transition-all shadow-sm group">
                <BarChart3 size={14} className="group-hover:scale-110 transition-transform" /> {t('complianceMatrix.detailedStats')}
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {statuses.map((status, sIdx) => {
            const stItems = items.filter(i => i.compliance_status === status);
            const config = statusConfig[status];
            const Icon = config.icon;
            const statusColor = STATUS_COLOR_CLASSES[config.color] ?? STATUS_COLOR_CLASSES['slate']!;
            
            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: sIdx * 0.1 }}
                key={status} 
                className="flex flex-col h-[600px] bg-[var(--color-bg-soft)]/50 rounded-3xl border border-[var(--color-border-soft)]/50 overflow-hidden shadow-inner"
              >
                <div className={`p-4 border-b-2 flex justify-between items-center bg-[var(--color-card)] ${statusColor.header}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg border ${statusColor.icon}`}>
                      <Icon size={16} strokeWidth={3} />
                    </div>
                    <span className="font-bold text-[var(--color-text-main)] text-[11px] uppercase tracking-wider">{config.label}</span>
                  </div>
                  <span className={`${statusColor.badge} px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border`}>
                    {formatNumber(stItems.length)}
                  </span>
                </div>

                <div className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-hide">
                  {stItems.map((item, iIdx) => (
                    <motion.div 
                      key={item.id}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => { setSelectedItem(item); setFormData(item); setIsViewModalOpen(true); }}
                      className="group p-4 bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] shadow-sm hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className={`absolute top-0 end-0 w-1 h-full ${statusColor.accentBar} transition-colors`}></div>
                      <div className="text-[9px] font-bold font-mono text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] mb-1 leading-none">{item.ref_number}</div>
                      <div className="font-bold text-[var(--color-text-main)] text-xs mb-2 leading-snug truncate-2-lines">{item.title}</div>
                      
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-border-soft)]/50">
                        {getSourceBadge(item.source_type)}
                        <div className="flex -space-x-1 space-x-reverse">
                           <div className="w-5 h-5 rounded-full bg-[var(--color-primary)]/10 border-2 border-white flex items-center justify-center text-[8px] font-bold text-[var(--color-primary)]" title={item.responsible_person_name || ''}>
                             {(item.responsible_person_name || t('complianceMatrix.notSpecified'))[0]}
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {stItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-[var(--color-border-strong)] opacity-50 space-y-2">
                       <ShieldCheck size={32} />
                       <span className="text-[10px] font-bold uppercase tracking-widest italic">{t('complianceMatrix.noData')}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDashboard = () => {
    const total = summary?.total || items.length;
    const getCount = (st: ComplianceStatus) => items.filter(i => i.compliance_status === st).length;
    
    const overdueItems = items.filter(i => i.review_date && new Date(i.review_date) < new Date()).sort((a,b) => new Date(a.review_date!).getTime() - new Date(b.review_date!).getTime());

    const stats = [
      { label: t('complianceMatrix.totalRecords'), value: total, color: 'primary', icon: BarChart3, highlight: 'primary/10', class: 'text-[var(--color-primary)]' },
      { label: t('complianceMatrix.fullyCompliant'), value: getCount('compliant'), color: 'emerald', icon: CheckCircle, highlight: 'emerald-500/10' },
      { label: t('complianceMatrix.nonCompliantGaps'), value: getCount('non_compliant'), color: 'rose', icon: XCircle, highlight: 'rose-500/10' },
      { label: t('complianceMatrix.overdueReviews'), value: overdueItems.length, color: 'amber', icon: AlertTriangle, highlight: 'amber-500/10' },
      { label: t('complianceMatrix.pendingVerification'), value: getCount('under_review'), color: 'slate', icon: AlertCircle, highlight: 'slate-500/10' },
    ];

    return (
      <div className="space-y-8 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
           {stats.map((stat, idx) => {
             const statColor = STAT_COLOR_CLASSES[stat.color] ?? STAT_COLOR_CLASSES['slate']!;
             return (
             <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`glass-card p-5 border-b-4 shadow-xl ${statColor.card} transition-all group`}
             >
                <div className="flex justify-between items-start mb-3">
                   <div className={`p-2 rounded-xl ${statColor.icon} group-hover:scale-110 transition-transform`}>
                      <stat.icon size={20} />
                   </div>
                   <span className="text-[10px] font-bold text-[var(--color-text-muted)] group-hover:text-[var(--color-text-muted)] uppercase tracking-widest">{stat.label}</span>
                </div>
                <div className={`text-3xl font-bold text-[var(--color-text-main)] ${statColor.value} transition-colors`}>{formatNumber(stat.value)}</div>
             </motion.div>
           );
           })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
           <div className="xl:col-span-2 glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-xl font-bold text-[var(--color-text-main)] tracking-tight flex items-center gap-3">
                       <AlertTriangle className="text-amber-500" /> {t('complianceMatrix.overdueReviews')}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)] font-bold mt-1">{t('complianceMatrix.overdueReviewsDesc')}</p>
                 </div>
                 <button className="text-[10px] font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 uppercase tracking-widest p-2 bg-[var(--color-primary)]/10 rounded-lg transition-colors">
                    {t('complianceMatrix.viewAll')} <ChevronRight size={12} className="ltr:rotate-180" />
                 </button>
              </div>

              <div className="space-y-4 max-h-[450px] overflow-y-auto pe-2 custom-scrollbar">
                {overdueItems.map((item, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: getStaggerDelay(idx) }}
                    key={item.id} 
                    className="group flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl hover:border-amber-200 hover:bg-amber-50/20 transition-all shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 font-bold text-sm shadow-inner group-hover:scale-110 transition-transform">
                          {formatNumber(idx + 1)}
                       </div>
                       <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-main)] px-2 py-0.5 rounded uppercase tracking-tighter">{item.ref_number}</span>
                            <div className="text-sm font-bold text-[var(--color-text-main)] truncate max-w-[200px] lg:max-w-md">{item.title}</div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)] font-bold">
                            <span className="flex items-center gap-1"><Building size={10} /> {item.department_name || t('complianceMatrix.unspecifiedDept')}</span>
                            <span className="flex items-center gap-1"><User size={10} /> {item.responsible_person_name || t('complianceMatrix.notSpecified')}</span>
                          </div>
                       </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 mt-4 sm:mt-0">
                       <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-100 text-rose-700 rounded-xl text-[10px] font-bold border border-rose-200 shadow-sm animate-pulse">
                           {t('complianceMatrix.overdue')} {formatNumber(Math.ceil((new Date().getTime() - new Date(item.review_date!).getTime()) / (1000 * 3600 * 24)))} {t('complianceMatrix.overdueDays')}
                       </div>
                       <div className="text-[10px] font-bold px-2 py-1 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-lg shadow-sm text-[var(--color-text-muted)] font-mono tracking-tighter">
                          {item.review_date}
                       </div>
                    </div>
                  </motion.div>
                ))}
                {overdueItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-[var(--color-border-strong)] italic">
                    <CheckCircle size={48} className="mb-4 opacity-20" />
                    <p className="font-bold uppercase tracking-widest text-xs">{t('complianceMatrix.noOverdue')}</p>
                  </div>
                )}
              </div>
           </div>
           
           <div className="glass-card p-8">
              <h3 className="text-xl font-bold text-[var(--color-text-main)] tracking-tight mb-8 flex items-center gap-3">
                 <Layers size={22} className="text-[var(--color-primary)]" /> {t('complianceMatrix.complianceDist')}
              </h3>
              <div className="space-y-6">
                {(Object.entries(sourceLabels) as [SourceType, string][]).map(([type, label], idx) => {
                  const count = items.filter(i => i.source_type === type).length;
                  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
                  const color = sourceColors[type];
                  const sourceColor = SOURCE_COLOR_CLASSES[color] ?? SOURCE_COLOR_CLASSES['primary']!;
                  
                  return (
                    <motion.div 
                      key={type}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest block mb-1">{label}</span>
                          <span className={`text-xs font-bold ${sourceColor.label}`}>{formatNumber(pct)}% {t('complianceMatrix.ofTotal')}</span>
                        </div>
                        <div className="text-end">
                          <span className="text-xl font-bold text-[var(--color-text-main)] leading-none">{formatNumber(count)}</span>
                          <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest block">{t('complianceMatrix.activeRecord')}</span>
                        </div>
                      </div>
                      <div className="h-3 w-full bg-[var(--color-bg-main)] rounded-full overflow-hidden shadow-inner p-0.5 border border-[var(--color-border-soft)]">
                        <motion.div 
                          initial={{ width: 0 }}
                          whileInView={{ width: `${pct}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className={`h-full rounded-full bg-gradient-to-r ${sourceColor.bar} shadow-sm`}
                        ></motion.div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-12 p-6 rounded-3xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10 shadow-inner relative overflow-hidden group">
                 <div className="absolute top-0 end-0 w-32 h-32 bg-[var(--color-primary)]/5 rounded-full -me-16 -mt-16 blur-2xl group-hover:scale-150 transition-transform duration-1000"></div>
                 <div className="relative z-10">
                    <h4 className="text-sm font-bold text-[var(--color-primary)] mb-2">{t('complianceMatrix.maturityLevel')}</h4>
                    <div className="flex items-end gap-3 mb-4">
                       <span className="text-4xl font-bold text-[var(--color-primary)] leading-none">
                         {formatNumber(Math.round(items.reduce((acc, i) => acc + (i.maturity_score || 0), 0) / (items.length || 1)))}%
                       </span>
                       <span className="text-[10px] font-bold text-[var(--color-primary)] opacity-40 uppercase tracking-widest pb-1 italic leading-none">{t('complianceMatrix.overallRating')}</span>
                    </div>
                    <p className="text-[10px] text-[var(--color-primary)] font-bold leading-relaxed opacity-60">{t('complianceMatrix.maturityDesc')}</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('common.complianceMatrix')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('complianceMatrix.subTitle')}</p>
          </div>
        </div>
      </div>

      {/* Tabs — matches system-wide tab pattern */}
      <div className="flex gap-2 p-1 bg-[var(--color-bg-main)] rounded-2xl w-fit">
        {[
          { id: 'registry', label: t('complianceMatrix.generalRegistry'), icon: List },
          { id: 'matrix', label: t('complianceMatrix.gapMatrixTab'), icon: Layers },
          { id: 'dashboard', label: t('complianceMatrix.dashboard'), icon: LayoutGrid }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'registry' | 'matrix' | 'dashboard')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer
              ${activeTab === tab.id ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'}`}
          >
            <tab.icon size={18} /> {tab.label}
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeTab === 'registry' && renderRegistry()}
        {activeTab === 'matrix' && renderMatrix()}
        {activeTab === 'dashboard' && renderDashboard()}
      </motion.div>

      {/* Write/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={handleModalClose} title={selectedItem ? t('complianceMatrix.editRecord') : t('complianceMatrix.addRecord')}>
        <form onSubmit={handleSave} className="space-y-8 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
               <div className="p-6 bg-[var(--color-bg-soft)]/50 rounded-3xl border border-[var(--color-border-soft)] shadow-inner">
                  <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-[var(--color-border-soft)] pb-2">
                     <Info size={14} /> {t('complianceMatrix.basicData')}
                  </h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.refSymbolic')} *</label>
                      <input type="text" required className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.ref_number || ''} onChange={e => setFormData({...formData, ref_number: e.target.value})} placeholder={t('complianceMatrix.refPlaceholder')} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.titleLabel')}</label>
                      <input type="text" required className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} placeholder={t('complianceMatrix.titlePlaceholder')} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.source')} *</label>
                          <select required className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all appearance-none" value={formData.source_type || ''} onChange={e => setFormData({...formData, source_type: e.target.value as SourceType})}>
                            <option value="">{t('complianceMatrix.selectSource')}</option>
                            {Object.entries(sourceLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.issuingAuthority')}</label>
                          <input type="text" className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.issuing_authority || ''} onChange={e => setFormData({...formData, issuing_authority: e.target.value})} />
                       </div>
                    </div>
                  </div>
               </div>

               <div className="p-6 bg-[var(--color-bg-soft)]/50 rounded-3xl border border-[var(--color-border-soft)] shadow-inner">
                  <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-[var(--color-border-soft)] pb-2">
                     <Building size={14} /> {t('complianceMatrix.responsibilities')}
                  </h4>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.personResp')}</label>
                          <select className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.responsible_person_id || ''} onChange={e => setFormData({...formData, responsible_person_id: e.target.value})}>
                            <option value="">{t('complianceMatrix.selectPerson')}</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.full_name || u.username}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.deptResp')}</label>
                          <select className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.department_id || ''} onChange={e => setFormData({...formData, department_id: e.target.value})}>
                            <option value="">{t('complianceMatrix.selectDept')}</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name_ar || d.name_en || d.name}</option>)}
                          </select>
                       </div>
                    </div>
                  </div>
               </div>

               <div className="p-6 bg-[var(--color-bg-soft)]/50 rounded-3xl border border-[var(--color-border-soft)] shadow-inner">
                  <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-[var(--color-border-soft)] pb-2">
                     <ShieldCheck size={14} /> {t('complianceMatrix.evalMatch')}
                  </h4>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.statusLabel')}</label>
                          <select className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.compliance_status || 'under_review'} onChange={e => setFormData({...formData, compliance_status: e.target.value as ComplianceStatus})}>
                            {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.maturityScoreLabel')}</label>
                          <input type="number" min="0" max="100" className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.maturity_score || ''} onChange={e => { const raw = e.target.value; const parsed = raw === '' ? null : Number(raw); setFormData({...formData, maturity_score: Number.isNaN(parsed as number) ? null : parsed}); }} />
                       </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.requiredActions')}</label>
                      <textarea className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" rows={3} value={formData.gap_notes || ''} onChange={e => setFormData({...formData, gap_notes: e.target.value})} placeholder={t('complianceMatrix.gapNotesPlaceholder')}></textarea>
                    </div>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
               <div className="p-6 bg-[var(--color-bg-soft)]/50 rounded-3xl border border-[var(--color-border-soft)] shadow-inner">
                  <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-[var(--color-border-soft)] pb-2">
                     <Calendar size={14} /> {t('complianceMatrix.importantDates')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.effectiveDate')}</label>
                        <input type="date" className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.effective_date || ''} onChange={e => setFormData({...formData, effective_date: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.nextReviewDate')}</label>
                        <input type="date" className="w-full bg-[var(--color-card)] px-4 py-3 rounded-2xl border border-[var(--color-border-soft)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.review_date || ''} onChange={e => setFormData({...formData, review_date: e.target.value})} />
                     </div>
                  </div>
               </div>

               <div className="p-6 bg-[var(--color-bg-soft)]/50 rounded-3xl border border-[var(--color-border-soft)] shadow-inner">
                  <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-[var(--color-border-soft)] pb-2">
                     <FileText size={14} /> {t('complianceMatrix.docsAttachments')}
                  </h4>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.uploadPdf')}</label>
                    <div className="relative group/file">
                      <input 
                        type="file" 
                        accept=".pdf" 
                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                        onChange={async e => {
                          if (e.target.files?.[0]) {
                            const validFiles = await validateAndFilter([e.target.files[0]]);
                            if (validFiles.length > 0) {
                              setFile(validFiles[0]!);
                            } else {
                              e.target.value = '';
                            }
                          }
                        }}
                      />
                      <div className={`w-full px-4 py-3 rounded-2xl border-2 border-dashed transition-all flex items-center justify-between
                        ${file ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-[var(--color-border-soft)] bg-[var(--color-card)] group-hover/file:border-[var(--color-primary)]/50'}`}>
                        <div className="flex items-center gap-3">
                          <FileText size={18} className={file ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} />
                          <span className={`text-xs font-bold truncate max-w-[200px] ${file ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                            {file ? file.name : (formData.attachment_path ? t('complianceMatrix.fileUploaded') : t('complianceMatrix.dragFile'))}
                          </span>
                        </div>
                        <Upload size={16} className={file ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} />
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="flex justify-end items-center gap-4 mt-12 bg-[var(--color-card)]/50 backdrop-blur-md p-6 -mx-6 -mb-6 border-t border-[var(--color-border-soft)]">
            <button type="button" onClick={handleModalClose} className="px-8 py-3 text-[var(--color-text-muted)] font-bold text-xs uppercase tracking-widest hover:text-[var(--color-text-main)] transition-colors">{t('complianceMatrix.cancel')}</button>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit" 
              className="px-10 py-3 bg-[var(--color-primary)] text-white rounded-2xl text-xs font-bold shadow-xl shadow-[var(--color-primary)]/20 uppercase tracking-widest hover:bg-[var(--color-primary-hover)] transition-all"
            >
              {t('complianceMatrix.saveChanges')}
            </motion.button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }} 
        title={t('deleteConfirm')}
      >
        <div className="space-y-6 pt-2">
          <div className="flex items-center gap-4 p-4 bg-[var(--color-danger-light)] rounded-2xl border border-[var(--color-danger)]/20">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-danger)] flex items-center justify-center text-white shadow-lg shadow-[var(--color-danger)]/20">
              <Trash2 size={24} />
            </div>
            <div>
              <h4 className="font-bold text-[var(--color-danger)] text-sm">{t('deleteConfirm')}</h4>
              <p className="text-[var(--color-text-muted)] text-[10px] font-bold">{t('deleteMessage')}</p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-2">
            <Button 
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setItemToDelete(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDelete}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title={t('complianceMatrix.viewDetails')}>
        {selectedItem && (
          <div className="space-y-8 p-1">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                   <span className="text-[10px] font-bold font-mono text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 rounded border border-[var(--color-primary)]/20 uppercase tracking-tighter">
                      {selectedItem.ref_number}
                   </span>
                   {getSourceBadge(selectedItem.source_type)}
                </div>
                <h2 className="text-2xl font-bold text-[var(--color-text-main)] tracking-tight leading-tight">{selectedItem.title}</h2>
              </div>
              <div className="shrink-0">{getStatusBadge(selectedItem.compliance_status)}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: t('complianceMatrix.deptResp'), value: selectedItem.department_name || '-', icon: Building, color: 'primary' },
                { label: t('complianceMatrix.personResp'), value: selectedItem.responsible_person_name || '-', icon: User, color: 'emerald' },
                { label: t('complianceMatrix.issueDate'), value: selectedItem.issue_date || '-', icon: Calendar, color: 'slate' },
                { label: t('complianceMatrix.nextReview'), value: selectedItem.review_date || '-', icon: Calendar, color: 'warning' }
              ].map((info, idx) => (
                <div key={idx} className="bg-[var(--color-bg-soft)]/50 p-4 rounded-2xl border border-[var(--color-border-soft)] shadow-sm relative overflow-hidden group">
                   <div className={`absolute top-0 end-0 w-1 h-full bg-${info.color === 'primary' ? '[var(--color-primary)]' : 
                                                                     info.color === 'warning' ? 'amber-500' :
                                                                     info.color === 'emerald' ? 'emerald-500' : 'slate-500'} group-hover:w-2 transition-all`}></div>
                   <div className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1 flex items-center gap-1.5 leading-none">
                      <info.icon size={10} /> {info.label}
                   </div>
                   <div className="text-xs font-bold text-[var(--color-text-main)] truncate">{info.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               <div className="md:col-span-2 space-y-8">
                  {selectedItem.description && (
                    <section>
                      <h3 className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Info size={14} className="text-[var(--color-primary)]" /> {t('complianceMatrix.reqDesc')}
                      </h3>
                      <div className="p-6 bg-[var(--color-card)] rounded-3xl border border-[var(--color-border-soft)] shadow-sm text-sm text-[var(--color-text-muted)] font-bold leading-relaxed">
                         {selectedItem.description}
                      </div>
                    </section>
                  )}

                  {selectedItem.gap_notes && (
                    <section>
                      <h3 className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-3 flex items-center gap-2">
                         <AlertTriangle size={14} className="text-amber-500" /> {t('complianceMatrix.gapsAndCorrectiveActions')}
                      </h3>
                      <div className="p-6 bg-amber-50/50 rounded-3xl border border-amber-100 text-sm text-amber-900 font-bold leading-relaxed shadow-inner">
                         {selectedItem.gap_notes}
                      </div>
                    </section>
                  )}
               </div>

               <div className="space-y-6">
                  <div className="p-6 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl shadow-sm relative overflow-hidden group">
                    <div className="absolute -bottom-8 -end-8 w-32 h-32 bg-[var(--color-primary)]/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000 pointer-events-none"></div>
                    <div className="relative z-10">
                       <h3 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-6 border-b border-[var(--color-border-soft)] pb-2">{t('complianceMatrix.maturityEvaluation')}</h3>
                       <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">{t('complianceMatrix.percentage')}</span>
                          <span className="text-3xl font-bold text-[var(--color-text-main)]">{formatNumber(selectedItem.maturity_score || 0)}%</span>
                       </div>
                       <div className="h-2 w-full bg-[var(--color-bg-main)] rounded-full overflow-hidden shadow-inner flex p-0.5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${selectedItem.maturity_score || 0}%` }}
                            transition={{ duration: 1.5, ease: 'backOut' }}
                            className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-sm shadow-[var(--color-primary)]/50"
                          ></motion.div>
                       </div>
                       <div className="mt-8 pt-6 border-t border-[var(--color-border-soft)]">
                          <button className="w-full py-3 bg-[var(--color-bg-soft)] hover:bg-[var(--color-bg-main)] border border-[var(--color-border-soft)] hover:border-[var(--color-border-soft)] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all">{t('complianceMatrix.updateEvaluation')}</button>
                       </div>
                    </div>
                  </div>

                  <div className="glass-card p-6 border-[var(--color-border-soft)]">
                    <h3 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-4">{t('complianceMatrix.attachmentsDocs')}</h3>
                    {selectedItem.attachment_path ? (
                      <a href={selectedItem.attachment_path} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 bg-[var(--color-primary)]/10 rounded-2xl border border-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors group">
                         <div className="p-2 bg-[var(--color-card)] rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                            <FileText size={18} />
                         </div>
                         <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{t('complianceMatrix.originalDoc')}</div>
                            <div className="text-[9px] font-bold opacity-60">{t('complianceMatrix.viewAttachedFile')}</div>
                         </div>
                         <Download size={14} className="ms-auto" />
                      </a>
                    ) : (
                      <div className="p-4 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)] text-[var(--color-text-muted)] text-[10px] font-bold text-center italic">
                        {t('complianceMatrix.noFilesAttached')}
                      </div>
                    )}
                  </div>
               </div>
            </div>

            <div className="flex justify-end border-t border-[var(--color-border-soft)] pt-6">
              <button onClick={() => setIsViewModalOpen(false)} className="px-8 py-3 bg-[var(--color-bg-main)] text-[var(--color-text-muted)] rounded-2xl text-xs font-bold shadow-inner shadow-[var(--color-border-soft)] uppercase tracking-widest hover:bg-[var(--color-bg-main)] transition-all">{t('complianceMatrix.closeWindow')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
