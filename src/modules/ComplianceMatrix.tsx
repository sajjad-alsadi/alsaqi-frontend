import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, Search, Filter, Plus, Edit2, Trash2, Eye, 
  Download, FileText, CheckCircle, AlertTriangle, XCircle, AlertCircle,
  LayoutGrid, List, BarChart3, ArrowRight, Calendar, User, Building,
  Tag, Info, MoreHorizontal, ChevronRight, FileDown, Layers, Upload
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import api from '../services/api';
import Modal from '../components/Modal';
import { useDepartments } from '../hooks/useDepartments';
import toast from 'react-hot-toast';

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

export default function ComplianceMatrix() {
  const { t } = useTranslation();

  const statusConfig: Record<ComplianceStatus, { color: string, icon: any, label: string }> = {
    compliant: { color: 'emerald', icon: CheckCircle, label: t('complianceMatrix.compliant') },
    partial: { color: 'amber', icon: AlertTriangle, label: t('complianceMatrix.partial') },
    non_compliant: { color: 'rose', icon: XCircle, label: t('complianceMatrix.nonCompliant') },
    under_review: { color: 'slate', icon: AlertCircle, label: t('complianceMatrix.underReview') },
  };

  const sourceLabelsAR: Record<SourceType, string> = {
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
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ComplianceItem | null>(null);
  const [formData, setFormData] = useState<Partial<ComplianceItem>>({ compliance_status: 'under_review' });
  const [file, setFile] = useState<File | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Dropdown data
  const [users, setUsers] = useState<any[]>([]);
  const { departments } = useDepartments();

  useEffect(() => {
    fetchItems();
    fetchSummary();
  }, [filterSource, filterStatus, search]);

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
      if (res.data.success) setItems(res.data.data);
    } catch (e) {
      console.error(e);
      toast.error(t('complianceMatrix.loadError', 'فشل تحميل البيانات'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await api.get('/compliance/summary');
      if (res.data.success) setSummary(res.data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    try {
      const uRes = await api.get('/users/summary');
      if (uRes.data?.success) setUsers(uRes.data.data);
      else {
        const uResFallback = await api.get('/users');
        if (uResFallback.data?.success) setUsers(uResFallback.data.data);
      }
    } catch (e) {}
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
        toast.success(t('complianceMatrix.updateSuccess', 'تم التحديث بنجاح'));
      } else {
        await api.post('/compliance', data, config);
        toast.success(t('complianceMatrix.addSuccess', 'تمت الإضافة بنجاح'));
      }
      setIsModalOpen(false);
      setFile(null);
      fetchItems();
      fetchSummary();
    } catch (err) {
      console.error(err);
      toast.error(t('complianceMatrix.saveError', 'حدث خطأ أثناء الحفظ'));
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await api.delete('/compliance/' + itemToDelete);
      toast.success(t('complianceMatrix.deleteSuccess', 'تم الحذف بنجاح'));
      fetchItems();
      fetchSummary();
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (e) {
      console.error(e);
      toast.error(t('complianceMatrix.deleteError', 'فشل حذف العنصر'));
    }
  };

  const handleDelete = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.patch('/compliance/' + id + '/status', { compliance_status: status });
      toast.success(t('complianceMatrix.statusUpdateSuccess', 'تم تحديث الحالة'));
      fetchItems();
      fetchSummary();
    } catch (e) {
      console.error(e);
      toast.error(t('complianceMatrix.statusUpdateError', 'فشل تحديث الحالة'));
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
          'bg-slate-50 text-slate-700 border-slate-100'}`}>
        <Icon size={12} strokeWidth={3} />
        {config.label}
      </span>
    );
  };

  const getSourceBadge = (type: SourceType) => {
    const label = sourceLabelsAR[type] || type;
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
      <div className="flex flex-col lg:flex-row justify-between gap-4 bg-white/40 p-4 rounded-2xl border border-white/60 backdrop-blur-sm shadow-sm">
        <div className="relative group flex-1 max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--color-primary)] transition-colors" size={18} />
          <input 
            type="text" placeholder={t('complianceMatrix.searchPlaceholder', 'بحث بالمرجع أو العنوان أو الكلمات الدالة...')} 
            className="w-full bg-white pr-12 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all shadow-sm"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3 lg:pb-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm cursor-pointer">
            <Filter size={14} className="text-slate-400" />
            <select className="bg-transparent text-xs font-medium outline-none border-none p-0 cursor-pointer min-w-[120px]" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option value="">{t('complianceMatrix.allSources', 'جميع المصادر')}</option>
              {Object.entries(sourceLabelsAR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm">
            <ShieldCheck size={14} className="text-slate-400" />
            <select className="bg-transparent text-xs font-medium outline-none border-none p-0 cursor-pointer min-w-[120px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">{t('complianceMatrix.allStatuses', 'جميع الحالات')}</option>
              {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] text-white rounded-xl shadow-md shadow-[var(--color-primary)]/20 text-sm font-bold whitespace-nowrap" 
            onClick={() => { setSelectedItem(null); setFormData({ compliance_status: 'under_review' }); setIsModalOpen(true); }}
          >
            <Plus size={18} /> {t('complianceMatrix.addRecord', 'إضافة سجل')}
          </motion.button>
        </div>
      </div>

      <div className="glass-card">
        <div className="overflow-x-visible lg:overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{t('complianceMatrix.ref', 'المرجع')}</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{t('complianceMatrix.titleData', 'العنوان والبيانات')}</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{t('complianceMatrix.source', 'المصدر')}</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{t('complianceMatrix.complianceStatus', 'حالة المطابقة')}</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{t('complianceMatrix.responsible', t('complianceMatrix.personResp', 'المسؤول'))}</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{t('complianceMatrix.review', 'المراجعة')}</th>
                <th className="px-6 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">{t('complianceMatrix.actions', 'إجراءات')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {items.map((item, idx) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    key={item.id} 
                    className="hover:bg-[var(--color-primary)]/5 transition-colors group"
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className="text-[10px] font-black font-mono text-slate-400 group-hover:text-[var(--color-primary)] transition-colors bg-slate-100 px-2 py-1 rounded border border-slate-200 uppercase">
                        {item.ref_number}
                      </span>
                    </td>
                    <td className="px-6 py-5 min-w-[200px]">
                      <div className="font-bold text-slate-800 leading-tight mb-1 truncate max-w-sm" title={item.title}>{item.title}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-slate-400 flex items-center gap-1 font-medium">
                          <Tag size={10} /> {item.category || t('complianceMatrix.noCategory', 'بدون تصنيف')}
                        </span>
                        {item.open_findings_count ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                            <AlertTriangle size={10} /> {item.open_findings_count} {t('complianceMatrix.remarks', 'ملاحظات')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">{getSourceBadge(item.source_type)}</td>
                    <td className="px-6 py-5 whitespace-nowrap">{getStatusBadge(item.compliance_status)}</td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                         <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                            <User size={12} className="text-slate-400" />
                         </div>
                         <div className="text-xs font-bold text-slate-700">{item.responsible_person_name || t('complianceMatrix.notSpecified', 'غير محدد')}</div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${item.review_date && new Date(item.review_date) < new Date() ? 'text-rose-500' : 'text-slate-500'}`}>
                          <Calendar size={10} /> {item.review_date || '-- / -- / --'}
                        </span>
                        {item.review_date && new Date(item.review_date) < new Date() && (
                          <span className="text-[8px] font-bold text-rose-400 uppercase tracking-tighter">{t('complianceMatrix.overdue', 'متجاوز للموعد ⚠️')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setSelectedItem(item); setFormData(item); setIsViewModalOpen(true); }} className="p-2 text-slate-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-lg transition-all" title="عرض"><Eye size={18} /></button>
                        <button onClick={() => { setSelectedItem(item); setFormData(item); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all" title="تعديل"><Edit2 size={18} /></button>
                        
                        <div className="relative group/actions">
                          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all">
                            <MoreHorizontal size={18} />
                          </button>
                          <div className="absolute left-0 bottom-full mb-1 hidden group-hover/actions:flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl z-[100] min-w-[140px] animate-in fade-in slide-in-from-bottom-2 duration-200">
                             <div className="px-3 py-2 text-[10px] font-black text-slate-400 bg-slate-50 border-b border-slate-100 uppercase tracking-widest text-center">{t('complianceMatrix.changeStatus', 'تغيير الحالة')}</div>
                             {Object.entries(statusConfig).map(([k,v]) => (
                               <button 
                                 key={k}
                                 onClick={() => updateStatus(item.id, k as ComplianceStatus)}
                                 className="px-4 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 text-right flex items-center gap-2 transition-colors"
                               >
                                 <v.icon size={12} className={`text-${v.color}-500`} />
                                 {v.label}
                               </button>
                             ))}
                             <div className="border-t border-slate-100 mt-1">
                                <button onClick={() => handleDelete(item.id)} className="w-full px-4 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-50 text-right flex items-center gap-2 transition-colors">
                                  <Trash2 size={12} /> {t('common.delete', 'حذف')}
                                </button>
                             </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {(loading || items.length === 0) && (
            <div className="flex flex-col items-center justify-center py-20 bg-white/20">
               {loading ? (
                 <div className="animate-spin rounded-full h-10 w-10 border-4 border-[var(--color-primary)] border-t-transparent shadow-lg shadow-[var(--color-primary)]/20"></div>
               ) : (
                 <>
                  <div className="bg-slate-100 p-6 rounded-full border-2 border-dashed border-slate-300 mb-4 animate-pulse">
                    <ShieldCheck size={48} className="text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-bold">{t('complianceMatrix.noRecords', 'لم يتم العثور على أي سجلات')}</p>
                  <p className="text-slate-400 text-sm mt-1">حاول تعديل الفلاتر أو {t('complianceMatrix.addRecord', 'إضافة سجل')} جديد</p>
                 </>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderMatrix = () => {
    const statuses: ComplianceStatus[] = ['compliant', 'partial', 'non_compliant', 'under_review'];
    
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white/40 p-4 rounded-2xl border border-white/60 backdrop-blur-sm shadow-sm">
           <div>
              <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                <Layers size={18} className="text-[var(--color-primary)]" /> {t('complianceMatrix.gapMatrix', 'مصفوفة الفجوات التحليلية')}
              </h3>
              <p className="text-[10px] text-slate-500 font-bold">{t('complianceMatrix.gapMatrixDesc', 'توزيع السجلات حسب مستويات الامتثال الحالية')}</p>
           </div>
           <div className="flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl text-xs font-bold transition-all shadow-sm group">
                <FileDown size={14} className="group-hover:translate-y-0.5 transition-transform" /> {t('complianceMatrix.exportPdf', 'تصدير PDF')}
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl text-xs font-bold transition-all shadow-sm group">
                <BarChart3 size={14} className="group-hover:scale-110 transition-transform" /> {t('complianceMatrix.detailedStats', 'إحصائيات مفصلة')}
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {statuses.map((status, sIdx) => {
            const stItems = items.filter(i => i.compliance_status === status);
            const config = statusConfig[status];
            const Icon = config.icon;
            
            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: sIdx * 0.1 }}
                key={status} 
                className="flex flex-col h-[600px] bg-slate-50/50 rounded-3xl border border-slate-200/50 overflow-hidden shadow-inner"
              >
                <div className={`p-4 border-b-2 flex justify-between items-center bg-white border-${config.color}-500/30`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 bg-${config.color}-50 rounded-lg text-${config.color}-600 border border-${config.color}-100`}>
                      <Icon size={16} strokeWidth={3} />
                    </div>
                    <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider">{config.label}</span>
                  </div>
                  <span className={`bg-${config.color}-100 text-${config.color}-700 px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono border border-${config.color}-200`}>
                    {stItems.length}
                  </span>
                </div>

                <div className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-hide">
                  {stItems.map((item, iIdx) => (
                    <motion.div 
                      key={item.id}
                      whileHover={{ scale: 1.02, x: -4 }}
                      onClick={() => { setSelectedItem(item); setFormData(item); setIsViewModalOpen(true); }}
                      className="group p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className={`absolute top-0 right-0 w-1 h-full bg-${config.color}-400/50 group-hover:bg-${config.color}-500 transition-colors`}></div>
                      <div className="text-[9px] font-black font-mono text-slate-400 group-hover:text-[var(--color-primary)] mb-1 leading-none">{item.ref_number}</div>
                      <div className="font-bold text-slate-800 text-xs mb-2 leading-snug truncate-2-lines">{item.title}</div>
                      
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                        {getSourceBadge(item.source_type)}
                        <div className="flex -space-x-1 space-x-reverse">
                           <div className="w-5 h-5 rounded-full bg-[var(--color-primary)]/10 border-2 border-white flex items-center justify-center text-[8px] font-black text-[var(--color-primary)]" title={item.responsible_person_name || ''}>
                             {(item.responsible_person_name || t('complianceMatrix.notSpecified', '؟'))[0]}
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {stItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-300 opacity-50 space-y-2">
                       <ShieldCheck size={32} />
                       <span className="text-[10px] font-black uppercase tracking-widest italic">{t('complianceMatrix.noData', 'لا توجد بيانات')}</span>
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
      { label: t('complianceMatrix.totalRecords', 'إجمالي السجلات'), value: total, color: 'primary', icon: BarChart3, highlight: 'primary/10', class: 'text-[var(--color-primary)]' },
      { label: t('complianceMatrix.fullyCompliant', 'ملتزم بنسبة كاملة'), value: getCount('compliant'), color: 'emerald', icon: CheckCircle, highlight: 'emerald-500/10' },
      { label: t('complianceMatrix.nonCompliantGaps', 'غير ملتزم / فجوات'), value: getCount('non_compliant'), color: 'rose', icon: XCircle, highlight: 'rose-500/10' },
      { label: t('complianceMatrix.overdueReviews', 'مراجعات متأخرة'), value: overdueItems.length, color: 'amber', icon: AlertTriangle, highlight: 'amber-500/10' },
      { label: t('complianceMatrix.pendingVerification', 'قيد التحقق'), value: getCount('under_review'), color: 'slate', icon: AlertCircle, highlight: 'slate-500/10' },
    ];

    return (
      <div className="space-y-8 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
           {stats.map((stat, idx) => (
             <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`glass-card p-5 border-b-4 border-b-${stat.color}-500 shadow-xl shadow-${stat.color}-500/5 hover:shadow-${stat.color}-500/10 transition-all group`}
             >
                <div className="flex justify-between items-start mb-3">
                   <div className={`p-2 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 group-hover:scale-110 transition-transform`}>
                      <stat.icon size={20} />
                   </div>
                   <span className="text-[10px] font-black text-slate-400 group-hover:text-slate-600 uppercase tracking-widest">{stat.label}</span>
                </div>
                <div className={`text-3xl font-black text-slate-800 group-hover:text-${stat.color}-600 transition-colors`}>{stat.value}</div>
             </motion.div>
           ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
           <div className="xl:col-span-2 glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                       <AlertTriangle className="text-amber-500" /> تنبيهات {t('complianceMatrix.review', 'المراجعة')} المتأخرة
                    </h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">قائمة السجلات التي تجاوزت موعد {t('complianceMatrix.review', 'المراجعة')} الدورية المجدولة</p>
                 </div>
                 <button className="text-[10px] font-black text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 uppercase tracking-widest p-2 bg-[var(--color-primary)]/10 rounded-lg transition-colors">
                    {t('complianceMatrix.viewAll', 'عرض الكل')} <ChevronRight size={12} className="rotate-180" />
                 </button>
              </div>

              <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                {overdueItems.map((item, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={item.id} 
                    className="group flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-white border border-slate-100 rounded-2xl hover:border-amber-200 hover:bg-amber-50/20 transition-all shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 font-black text-sm shadow-inner group-hover:scale-110 transition-transform">
                          0{idx + 1}
                       </div>
                       <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-tighter">{item.ref_number}</span>
                            <div className="text-sm font-black text-slate-800 truncate max-w-[200px] lg:max-w-md">{item.title}</div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold">
                            <span className="flex items-center gap-1"><Building size={10} /> {item.department_name || t('complianceMatrix.unspecifiedDept', 'إدارة غير محددة')}</span>
                            <span className="flex items-center gap-1"><User size={10} /> {item.responsible_person_name || t('complianceMatrix.notSpecified', 'غير محدد')}</span>
                          </div>
                       </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 mt-4 sm:mt-0">
                       <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-100 text-rose-700 rounded-xl text-[10px] font-black border border-rose-200 shadow-sm animate-pulse">
                           {t('complianceMatrix.overdue', 'تأخر')} {Math.ceil((new Date().getTime() - new Date(item.review_date!).getTime()) / (1000 * 3600 * 24))} {t('complianceMatrix.overdueDays', 'يوم')}
                       </div>
                       <div className="text-[10px] font-black px-2 py-1 bg-white border border-slate-100 rounded-lg shadow-sm text-slate-400 font-mono tracking-tighter">
                          {item.review_date}
                       </div>
                    </div>
                  </motion.div>
                ))}
                {overdueItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-300 italic">
                    <CheckCircle size={48} className="mb-4 opacity-20" />
                    <p className="font-black uppercase tracking-widest text-xs">{t('complianceMatrix.noOverdue', 'لا توجد مراجعات متأخرة حالياً')}</p>
                  </div>
                )}
              </div>
           </div>
           
           <div className="glass-card p-8">
              <h3 className="text-xl font-black text-slate-800 tracking-tight mb-8 flex items-center gap-3">
                 <Layers size={22} className="text-[var(--color-primary)]" /> {t('complianceMatrix.complianceDist', 'توزيع سجلات الامتثال')}
              </h3>
              <div className="space-y-6">
                {(Object.entries(sourceLabelsAR) as [SourceType, string][]).map(([type, label], idx) => {
                  const count = items.filter(i => i.source_type === type).length;
                  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
                  const color = sourceColors[type];
                  
                  return (
                    <motion.div 
                      key={type}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{label}</span>
                          <span className={`text-xs font-black text-${color}-600`}>{pct}% {t('complianceMatrix.ofTotal', 'من الإجمالي')}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-black text-slate-800 leading-none">{count}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{t('complianceMatrix.activeRecord', 'سجل نشط')}</span>
                        </div>
                      </div>
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner p-0.5 border border-slate-200">
                        <motion.div 
                          initial={{ width: 0 }}
                          whileInView={{ width: `${pct}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className={`h-full rounded-full bg-gradient-to-r from-${color}-500 to-${color}-600 shadow-sm`}
                        ></motion.div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-12 p-6 rounded-3xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10 shadow-inner relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-primary)]/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-150 transition-transform duration-1000"></div>
                 <div className="relative z-10">
                    <h4 className="text-sm font-black text-[var(--color-primary)] mb-2">{t('complianceMatrix.maturityLevel', 'مستوى النضج العام')}</h4>
                    <div className="flex items-end gap-3 mb-4">
                       <span className="text-4xl font-black text-[var(--color-primary)] leading-none">
                         {Math.round(items.reduce((acc, i) => acc + (i.maturity_score || 0), 0) / (items.length || 1))}%
                       </span>
                       <span className="text-[10px] font-black text-[var(--color-primary)] opacity-40 uppercase tracking-widest pb-1 italic leading-none">{t('complianceMatrix.overallRating', 'معدل التقييم الكلي')}</span>
                    </div>
                    <p className="text-[10px] text-[var(--color-primary)] font-bold leading-relaxed opacity-60">{t('complianceMatrix.maturityDesc', 'يعتمد هذا المؤشر على متوسط درجة النضج المسجلة لكل بند من بنود الامتثال والمطابقة.')}</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-8 max-w-screen-2xl mx-auto" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('common.complianceMatrix', 'مصفوفة الامتثال')}</h2>
            <p className="text-sm text-slate-400 font-bold mt-2">{t('complianceMatrix.subTitle', 'الرقابة والامتثال للمتطلبات التنظيمية والقانونية')}</p>
          </div>
        </div>

        <div className="flex items-center bg-white/40 p-1.5 rounded-2xl border border-white/60 backdrop-blur-sm shadow-sm">
          {[
            { id: 'registry', label: t('complianceMatrix.generalRegistry', 'السجل العام'), icon: List },
            { id: 'matrix', label: t('complianceMatrix.gapMatrixTab', 'مصفوفة الفجوات'), icon: Layers },
            { id: 'dashboard', label: t('complianceMatrix.dashboard', 'لوحة المؤشرات'), icon: LayoutGrid }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all
                ${activeTab === tab.id ? 'bg-white text-[var(--color-primary)] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
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
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedItem ? t('complianceMatrix.editRecord', 'تعديل سجل') : t('complianceMatrix.addRecord')}>
        <form onSubmit={handleSave} className="space-y-8 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
               <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-inner">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-200 pb-2">
                     <Info size={14} /> {t('complianceMatrix.basicData', 'البيانات الأساسية')}
                  </h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.refSymbolic')} *</label>
                      <input type="text" required className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.ref_number || ''} onChange={e => setFormData({...formData, ref_number: e.target.value})} placeholder={t('complianceMatrix.refPlaceholder')} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.titleLabel')}</label>
                      <input type="text" required className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} placeholder={t('complianceMatrix.titlePlaceholder')} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.source')} *</label>
                          <select required className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all appearance-none" value={formData.source_type || ''} onChange={e => setFormData({...formData, source_type: e.target.value as SourceType})}>
                            <option value="">{t('complianceMatrix.selectSource')}</option>
                            {Object.entries(sourceLabelsAR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.issuingAuthority')}</label>
                          <input type="text" className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.issuing_authority || ''} onChange={e => setFormData({...formData, issuing_authority: e.target.value})} />
                       </div>
                    </div>
                  </div>
               </div>

               <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-inner">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-200 pb-2">
                     <Building size={14} /> {t('complianceMatrix.responsibilities')}
                  </h4>
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.personResp')}</label>
                          <select className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.responsible_person_id || ''} onChange={e => setFormData({...formData, responsible_person_id: e.target.value})}>
                            <option value="">{t('complianceMatrix.selectPerson')}</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.full_name || u.username}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.deptResp')}</label>
                          <select className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.department_id || ''} onChange={e => setFormData({...formData, department_id: e.target.value})}>
                            <option value="">{t('complianceMatrix.selectDept')}</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name_ar || d.name_en || d.name}</option>)}
                          </select>
                       </div>
                    </div>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
               <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-inner">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-200 pb-2">
                     <ShieldCheck size={14} /> {t('complianceMatrix.evalMatch')}
                  </h4>
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.statusLabel')}</label>
                          <select className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.compliance_status || 'under_review'} onChange={e => setFormData({...formData, compliance_status: e.target.value as ComplianceStatus})}>
                            {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.maturityScoreLabel')}</label>
                          <input type="number" min="0" max="100" className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.maturity_score || ''} onChange={e => setFormData({...formData, maturity_score: parseInt(e.target.value)})} />
                       </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.requiredActions')}</label>
                      <textarea className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" rows={3} value={formData.gap_notes || ''} onChange={e => setFormData({...formData, gap_notes: e.target.value})} placeholder={t('complianceMatrix.gapNotesPlaceholder')}></textarea>
                    </div>
                  </div>
               </div>

               <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-inner">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-200 pb-2">
                     <Calendar size={14} /> {t('complianceMatrix.importantDates')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.effectiveDate')}</label>
                        <input type="date" className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.effective_date || ''} onChange={e => setFormData({...formData, effective_date: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.nextReviewDate')}</label>
                        <input type="date" className="w-full bg-white px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] outline-none transition-all" value={formData.review_date || ''} onChange={e => setFormData({...formData, review_date: e.target.value})} />
                     </div>
                  </div>
               </div>

               <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-inner">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-200 pb-2">
                     <FileText size={14} /> {t('complianceMatrix.docsAttachments')}
                  </h4>
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('complianceMatrix.uploadPdf')}</label>
                    <div className="relative group/file">
                      <input 
                        type="file" 
                        accept=".pdf" 
                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                        onChange={e => {
                          if (e.target.files?.[0]) {
                            setFile(e.target.files[0]);
                          }
                        }}
                      />
                      <div className={`w-full px-4 py-3 rounded-2xl border-2 border-dashed transition-all flex items-center justify-between
                        ${file ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-slate-200 bg-white group-hover/file:border-[var(--color-primary)]/50'}`}>
                        <div className="flex items-center gap-3">
                          <FileText size={18} className={file ? 'text-[var(--color-primary)]' : 'text-slate-400'} />
                          <span className={`text-xs font-bold truncate max-w-[200px] ${file ? 'text-[var(--color-primary)]' : 'text-slate-400'}`}>
                            {file ? file.name : (formData.attachment_path ? t('complianceMatrix.fileUploaded', 'تم رفع ملف - اضغط للتغيير') : t('complianceMatrix.dragFile', 'اسحب أو اختر ملف PDF'))}
                          </span>
                        </div>
                        <Upload size={16} className={file ? 'text-[var(--color-primary)]' : 'text-slate-400'} />
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="flex justify-end items-center gap-4 mt-12 bg-white/50 backdrop-blur-md p-6 -mx-6 -mb-6 border-t border-slate-100">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-700 transition-colors">{t('complianceMatrix.cancel', 'إلغاء')}</button>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit" 
              className="px-10 py-3 bg-[var(--color-primary)] text-white rounded-2xl text-xs font-black shadow-xl shadow-[var(--color-primary)]/20 uppercase tracking-widest hover:bg-[var(--color-primary-hover)] transition-all"
            >
              {t('complianceMatrix.saveChanges', 'حفظ التغييرات')}
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
          <div className="flex items-center gap-4 p-4 bg-rose-50 rounded-2xl border border-rose-100">
            <div className="w-12 h-12 rounded-xl bg-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-200">
              <Trash2 size={24} />
            </div>
            <div>
              <h4 className="font-black text-rose-900 text-sm">{t('deleteConfirm')}</h4>
              <p className="text-rose-700/70 text-[10px] font-bold">{t('deleteMessage')}</p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-2">
            <button 
              onClick={() => {
                setIsDeleteModalOpen(false);
                setItemToDelete(null);
              }}
              className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={confirmDelete}
              className="px-8 py-3 rounded-2xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 shadow-xl shadow-rose-200 transition-all"
            >
              {t('delete')}
            </button>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title={t('complianceMatrix.viewDetails', 'عرض تفاصيل الامتثال')}>
        {selectedItem && (
          <div className="space-y-8 p-1">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                   <span className="text-[10px] font-black font-mono text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 rounded border border-[var(--color-primary)]/20 uppercase tracking-tighter">
                      {selectedItem.ref_number}
                   </span>
                   {getSourceBadge(selectedItem.source_type)}
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{selectedItem.title}</h2>
              </div>
              <div className="shrink-0">{getStatusBadge(selectedItem.compliance_status)}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: t('complianceMatrix.deptResp', 'الإدارة المعنية'), value: selectedItem.department_name || '-', icon: Building, color: 'primary' },
                { label: t('complianceMatrix.personResp', 'المسؤول'), value: selectedItem.responsible_person_name || '-', icon: User, color: 'emerald' },
                { label: t('complianceMatrix.issueDate', 'تاريخ الإصدار'), value: selectedItem.issue_date || '-', icon: Calendar, color: 'slate' },
                { label: t('complianceMatrix.nextReview', 'المراجعة القادمة'), value: selectedItem.review_date || '-', icon: Calendar, color: 'warning' }
              ].map((info, idx) => (
                <div key={idx} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                   <div className={`absolute top-0 right-0 w-1 h-full bg-${info.color === 'primary' ? '[var(--color-primary)]' : 
                                                                     info.color === 'warning' ? 'amber-500' :
                                                                     info.color === 'emerald' ? 'emerald-500' : 'slate-500'} group-hover:w-2 transition-all`}></div>
                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5 leading-none">
                      <info.icon size={10} /> {info.label}
                   </div>
                   <div className="text-xs font-black text-slate-700 truncate">{info.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               <div className="md:col-span-2 space-y-8">
                  {selectedItem.description && (
                    <section>
                      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Info size={14} className="text-[var(--color-primary)]" /> {t('complianceMatrix.reqDesc', 'وصف المتطلب')}
                      </h3>
                      <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm text-sm text-slate-600 font-bold leading-relaxed">
                         {selectedItem.description}
                      </div>
                    </section>
                  )}

                  {selectedItem.gap_notes && (
                    <section>
                      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <AlertTriangle size={14} className="text-amber-500" /> الفجوات وال{t('complianceMatrix.actions', 'إجراءات')} التصحيحية
                      </h3>
                      <div className="p-6 bg-amber-50/50 rounded-3xl border border-amber-100 text-sm text-amber-900 font-bold leading-relaxed shadow-inner">
                         {selectedItem.gap_notes}
                      </div>
                    </section>
                  )}
               </div>

               <div className="space-y-6">
                  <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm relative overflow-hidden group">
                    <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-[var(--color-primary)]/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000 pointer-events-none"></div>
                    <div className="relative z-10">
                       <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">{t('complianceMatrix.maturityEvaluation', 'تقييم النضج')}</h3>
                       <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-black text-slate-400">{t('complianceMatrix.percentage', 'النسبة المئوية')}</span>
                          <span className="text-3xl font-black text-slate-800">{selectedItem.maturity_score || 0}%</span>
                       </div>
                       <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner flex p-0.5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${selectedItem.maturity_score || 0}%` }}
                            transition={{ duration: 1.5, ease: 'backOut' }}
                            className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-sm shadow-[var(--color-primary)]/50"
                          ></motion.div>
                       </div>
                       <div className="mt-8 pt-6 border-t border-slate-100">
                          <button className="w-full py-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 hover:border-slate-200 text-slate-500 hover:text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">{t('complianceMatrix.updateEvaluation', 'تحديث التقييم')}</button>
                       </div>
                    </div>
                  </div>

                  <div className="glass-card p-6 border-slate-200">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t('complianceMatrix.attachmentsDocs', 'المرفقات والوثائق')}</h3>
                    {selectedItem.attachment_path ? (
                      <a href={selectedItem.attachment_path} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 bg-[var(--color-primary)]/10 rounded-2xl border border-[var(--color-primary)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors group">
                         <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                            <FileText size={18} />
                         </div>
                         <div className="min-w-0">
                            <div className="text-xs font-black truncate">{t('complianceMatrix.originalDoc', 'الوثيقة الأصلية')}</div>
                            <div className="text-[9px] font-bold opacity-60">{t('complianceMatrix.viewAttachedFile', 'عرض الملف المرفق')}</div>
                         </div>
                         <Download size={14} className="mr-auto" />
                      </a>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-[10px] font-black text-center italic">
                        {t('complianceMatrix.noFilesAttached', 'لا توجد ملفات مرفقة')}
                      </div>
                    )}
                  </div>
               </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-6">
              <button onClick={() => setIsViewModalOpen(false)} className="px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black shadow-inner shadow-slate-200 uppercase tracking-widest hover:bg-slate-200 transition-all">{t('complianceMatrix.closeWindow', 'إغلاق النافذة')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
