import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Search, Plus, Edit2, Archive, ChevronRight, ChevronDown, 
  MapPin, User, Hash, Info, Building2, LayoutGrid, BarChart3, List,
  Filter, AlertCircle, Network
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/httpClient';
import { extractErrorMessage } from '../../utils/errorService';
import { useDepartments, Department } from '../../api/hooks/useDepartments';
import { useFormat } from '../../utils/formatService';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';
import { useUser } from '../../context/UserContext';
import { UserRole } from '../../constants';
import logger from '../../utils/logger';
import { Button } from '@/components/ui/button';

// --- Components ---

interface TreeNodeProps {
  node: Department;
  level: number;
  onEdit: (node: Department) => void;
  onAddChild: (parentId: string) => void;
  onArchive: (node: Department) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, level, onEdit, onAddChild, onArchive }) => {
  const [isExpanded, setIsExpanded] = useState(level < 1);
  const { i18n, t } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Top Management': return 'bg-blue-900 text-white';
      case 'Department':      return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Division':        return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'Unit':            return 'bg-green-100 text-green-700 border-green-200';
      case 'Branch':          return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Office':          return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Committee':       return 'bg-[var(--color-bg-main)] text-[var(--color-text-main)] border-[var(--color-border-soft)]';
      default:                return 'bg-[var(--color-bg-soft)] text-[var(--color-text-muted)] border-[var(--color-border-soft)]';
    }
  };

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="mb-2">
      <div 
        className={`group flex items-center p-3 rounded-xl border transition-all duration-200 ${
          isExpanded ? 'bg-[var(--color-card)] shadow-sm border-[var(--color-border-soft)]' : 'bg-[var(--color-card)]/50 border-transparent hover:bg-[var(--color-card)] hover:border-[var(--color-border-soft)]'
        }`}
        style={{ [isRTL ? 'marginRight' : 'marginLeft']: `${level * 24}px` }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1 rounded-lg hover:bg-[var(--color-bg-main)] transition-colors ${!hasChildren && 'opacity-0 cursor-default'}`}
            disabled={!hasChildren}
          >
            {isExpanded ? <ChevronDown size={16} /> : (isRTL ? <ChevronRight size={16} className="rotate-180" /> : <ChevronRight size={16} />)}
          </button>
          
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-1.5 py-0.5 bg-[var(--color-bg-main)] text-[var(--color-text-muted)] text-[10px] font-mono rounded border border-[var(--color-border-soft)] uppercase tracking-tighter shrink-0">
                {node.entity_code}
              </span>
              <h4 className="font-bold text-[var(--color-text-main)] truncate">{node.name_ar}</h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0 ${getTypeBadgeColor(node.entity_type)}`}>
                {t(`orgTypes.${node.entity_type}`, node.entity_type)}
              </span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${node.status === 'Active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-slate-300'}`} />
            </div>
            
            <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
              {node.manager_name && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <User size={12} className="shrink-0" />
                  <span className="truncate">{node.manager_name}</span>
                </div>
              )}
              {node.name_en && (
                <div className="flex items-center gap-1.5 min-w-0 italic opacity-60">
                  <span className="truncate">{node.name_en}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onAddChild(node.id)}
            className="p-2 text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] rounded-lg transition-colors"
            title={t('addChildUnit')}
          >
            <Plus size={16} />
          </button>
          <button 
            onClick={() => onEdit(node)}
            className="p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] rounded-lg transition-colors"
            title={t('editUnit')}
          >
            <Edit2 size={16} />
          </button>
          <button 
            onClick={() => onArchive(node)}
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title={t('archiveUnit')}
          >
            <Archive size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {node.children!.map(child => (
              <TreeNode 
                key={child.id} 
                node={child} 
                level={level + 1} 
                onEdit={onEdit}
                onAddChild={onAddChild}
                onArchive={onArchive}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main Component ---

const OrgStructure: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { formatNumber } = useFormat();
  const isRTL = i18n.language === 'ar';
  const { user } = useUser();
  const isAdmin = [UserRole.ADMIN, UserRole.MANAGER].includes(user?.role as any || '');

  const [activeTab, setActiveTab] = useState<'tree' | 'table' | 'stats'>('tree');
  const { departments, refresh, loading: flatLoading, error } = useDepartments();
  const [treeData, setTreeData] = useState<Department[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Partial<Department> | null>(null);

  const fetchTree = async () => {
    setTreeLoading(true);
    try {
      const res = await api.get('/departments/tree');
      setTreeData(res.data);
    } catch (e) {
      logger.error('Operation failed', e);
      toast.error(t('errorLoadingTree'));
    } finally {
      setTreeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tree') fetchTree();
  }, [activeTab]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const filteredList = useMemo(() => {
    return departments.filter(d => {
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        (d.name_ar || '').toLowerCase().includes(searchLower) || 
        (d.name_en || '').toLowerCase().includes(searchLower) || 
        (d.entity_code || '').toLowerCase().includes(searchLower);
      const matchesType = filterType === 'All' || d.entity_type === filterType;
      const matchesStatus = filterStatus === 'All' || d.status === filterStatus;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [departments, search, filterType, filterStatus]);

  const stats = useMemo(() => {
    const activeUnits = departments.filter(d => d.status === 'Active').length;
    const inactiveUnits = departments.filter(d => d.status === 'Inactive').length;
    const noManager = departments.filter(d => d.status === 'Active' && !d.manager_name).length;
    const byType = departments.reduce((acc, d) => {
      acc[d.entity_type] = (acc[d.entity_type] || 0) + (d.status === 'Active' ? 1 : 0);
      return acc;
    }, {} as Record<string, number>);

    return { activeUnits, inactiveUnits, noManager, byType };
  }, [departments]);

  const handleEdit = (node: Department) => {
    setEditingNode(node);
    setIsModalOpen(true);
  };

  const handleAddChild = (parentId: string) => {
    setEditingNode({ parent_id: parentId });
    setIsModalOpen(true);
  };

  const handleArchive = async (node: Department) => {
    if (node.children && node.children.length > 0) {
      toast.error(t('cannotDeleteParent'));
      return;
    }

    if (!window.confirm(t('confirmArchiveUnit'))) return;

    try {
      await api.delete(`/departments/${node.id}`);
      toast.success(t('archiveSuccess'));
      refresh();
      if (activeTab === 'tree') fetchTree();
    } catch (error: any) {
      toast.error(extractErrorMessage(error, t('archiveFailed')));
    }
  };

  const entityTypes = [
    'Top Management', 'Department', 'Division', 'Unit', 'Branch', 'Office', 'Committee', 'Other'
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <Network size={32} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">
              {t('organizationalStructure')}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('orgStructureDesc')}</p>
          </div>
        </div>
        
        {isAdmin && (
          <Button 
            onClick={() => { setEditingNode({}); setIsModalOpen(true); }}
          >
            <Plus size={20} className={isRTL ? 'ml-2' : 'mr-2'} />
            {t('addUnit')}
          </Button>
        )}
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[var(--color-bg-main)] rounded-2xl w-fit">
        {[
          { id: 'tree', icon: LayoutGrid, label: t('treeView') },
          { id: 'table', icon: List, label: t('listView') },
          { id: 'stats', icon: BarChart3, label: t('statistics') },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer duration-200 ${
              activeTab === tab.id 
                ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm' 
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-card)]/50'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === 'tree' && (
          <div className="glass-card p-6 min-h-[500px]">
            {treeLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-[var(--color-text-muted)] font-bold">{t('loadingTree')}</p>
              </div>
            ) : treeData.length > 0 ? (
              <div className="space-y-1">
                {treeData.map(node => (
                  <TreeNode 
                    key={node.id} 
                    node={node} 
                    level={0} 
                    onEdit={handleEdit}
                    onAddChild={handleAddChild}
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center uppercase tracking-widest gap-4">
                <div className="w-20 h-20 bg-[var(--color-bg-soft)] rounded-full flex items-center justify-center text-slate-200 border border-[var(--color-border-soft)]">
                  <LayoutGrid size={40} />
                </div>
                <p className="text-[var(--color-text-muted)] font-bold text-sm">{t('noStructureDefined')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'table' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="glass-card p-4 flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={18} />
                <input 
                  type="text"
                  placeholder={t('searchUnits')}
                  className="input-field ps-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select 
                  className="input-field w-full md:w-40"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="All">{t('allTypes')}</option>
                  {entityTypes.map(type => <option key={type} value={type}>{t(`orgTypes.${type}`, type)}</option>)}
                </select>
                <select 
                  className="input-field w-full md:w-32"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="All">{t('allStatuses')}</option>
                  <option value="Active">{t('common.active')}</option>
                  <option value="Inactive">{t('common.inactive')}</option>
                </select>
              </div>
            </div>

            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-start">
                  <thead className="bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
                    <tr className="text-[var(--color-text-muted)] font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-6 py-4">{t('code')}</th>
                      <th className="px-6 py-4">{t('unitName')}</th>
                      <th className="px-6 py-4">{t('entityType')}</th>
                      <th className="px-6 py-4">{t('parent')}</th>
                      <th className="px-6 py-4">{t('manager')}</th>
                      <th className="px-6 py-4">{t('status')}</th>
                      <th className="px-6 py-4 text-center">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-soft)]">
                    {filteredList.map(item => (
                      <tr key={item.id} className="hover:bg-[var(--color-bg-soft)]/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-[10px] text-[var(--color-text-muted)] uppercase">{item.entity_code}</td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-[var(--color-text-main)]">{item.name_ar}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)]">{item.name_en}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-card)] text-[var(--color-text-muted)]">
                            {item.entity_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[var(--color-text-muted)]">
                          {departments.find(d => d.id === item.parent_id)?.name_ar || '-'}
                        </td>
                        <td className="px-6 py-4 text-[var(--color-text-muted)] font-medium">
                          {item.manager_name || <span className="text-rose-400 italic text-[10px] font-bold">{t('notAssigned')}</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]'
                          }`}>
                            {t(`common.status.${(item.status || '').toLowerCase()}`)}
                          </span>
                        </td>
                        <td className="px-6 py-4 flex items-center justify-center gap-2">
                          <button onClick={() => handleEdit(item)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] rounded-lg transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleArchive(item)} className="p-2 text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                            <Archive size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="glass-card p-6 space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-green-100 text-green-700 rounded-xl">
                  <LayoutGrid size={24} />
                </div>
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">{t('activeUnits')}</span>
              </div>
              <h3 className="text-3xl font-bold text-[var(--color-text-main)]">{formatNumber(stats.activeUnits)}</h3>
              <p className="text-sm text-[var(--color-text-muted)] font-bold">{t('totalActiveUnits')}</p>
            </div>
            
            <div className="glass-card p-6 space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <User size={24} />
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">{t('missingManager')}</span>
              </div>
              <h3 className="text-3xl font-bold text-[var(--color-text-main)]">{formatNumber(stats.noManager)}</h3>
              <p className="text-sm text-[var(--color-text-muted)] font-bold">{t('unitsWithoutManager')}</p>
            </div>

            <div className="glass-card p-6 space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-[var(--color-bg-main)] text-[var(--color-text-main)] rounded-xl">
                  <AlertCircle size={24} />
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-soft)] px-2 py-1 rounded-full">{t('inactiveLabel')}</span>
              </div>
              <h3 className="text-3xl font-bold text-[var(--color-text-main)]">{formatNumber(stats.inactiveUnits)}</h3>
              <p className="text-sm text-[var(--color-text-muted)] font-bold">{t('suspendedUnits')}</p>
            </div>

            <div className="glass-card p-6 flex flex-col justify-center">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-4">{t('distributionByType')}</h4>
              <div className="space-y-3">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-[var(--color-text-muted)]">{type}</span>
                      <span className="text-[var(--color-text-muted)]">{formatNumber(count as number)}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--color-bg-main)] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[var(--color-primary-light)]0 transition-all duration-500" 
                        style={{ width: `${(count / stats.activeUnits) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <OrgUnitModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingNode={editingNode}
        departments={departments}
        onSave={() => {
          refresh();
          if (activeTab === 'tree') fetchTree();
        }}
      />
    </div>
  );
};

interface OrgUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingNode: Partial<Department> | null;
  departments: Department[];
  onSave: () => void;
}

const OrgUnitModal: React.FC<OrgUnitModalProps> = ({ isOpen, onClose, editingNode, departments, onSave }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (editingNode) {
      setFormData({
        entity_code: (editingNode as any).entity_code || (editingNode as any).code || '',
        name_ar: editingNode.name_ar || '',
        name_en: editingNode.name_en || '',
        entity_type: editingNode.entity_type || 'Department',
        parent_id: editingNode.parent_id || null,
        manager_name: editingNode.manager_name || '',
        description: editingNode.description || '',
        location: editingNode.location || '',
        cost_center_code: editingNode.cost_center_code || '',
        status: editingNode.status || 'Active'
      });
    }
  }, [editingNode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingNode?.id) {
        await api.put(`/departments/${editingNode.id}`, formData);
        toast.success(t('updateSuccess'));
      } else {
        await api.post('/departments', formData);
        toast.success(t('createSuccess'));
      }
      onSave();
      onClose();
    } catch (error: any) {
      toast.error(extractErrorMessage(error, t('saveFailed')));
    } finally {
      setLoading(false);
    }
  };

  const handleEntityCodeBlur = () => {
    if (!formData.entity_code) {
      const typePrefix = formData.entity_type?.substring(0, 4).toUpperCase() || 'DEPT';
      setFormData({ ...formData, entity_code: `${typePrefix}-${Date.now().toString().slice(-6)}` });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingNode?.id ? t('editUnit') : t('newUnit')} size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <Hash size={12} />
              {t('unitCode')} *
            </label>
            <input 
              type="text"
              required
              className="input-field"
              placeholder={t('placeholders.entityCode')}
              value={formData.entity_code}
              onChange={(e) => setFormData({ ...formData, entity_code: e.target.value })}
              onBlur={handleEntityCodeBlur}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <LayoutGrid size={12} />
              {t('entityType')} *
            </label>
            <select 
              required
              className="input-field"
              value={formData.entity_type}
              onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
            >
              {['Top Management', 'Department', 'Division', 'Unit', 'Branch', 'Office', 'Committee', 'Other'].map(type => (
                <option key={type} value={type}>{t(`orgTypes.${type}`, type)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <Info size={12} />
              {t('nameAr')} *
            </label>
            <input 
              type="text"
              required
              className="input-field"
              value={formData.name_ar}
              onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <Info size={12} />
              {t('nameEn')}
            </label>
            <input 
              type="text"
              className="input-field"
              value={formData.name_en}
              onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <Building2 size={12} />
              {t('parentUnit')}
            </label>
            <select 
              className="input-field"
              value={formData.parent_id || ''}
              onChange={(e) => setFormData({ ...formData, parent_id: e.target.value || null })}
            >
              <option value="">{t('rootLevel')}</option>
              {departments
                .filter(d => d.id !== editingNode?.id)
                .map(d => (
                  <option key={d.id} value={d.id}>{d.name_ar} ({d.entity_type})</option>
                ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <User size={12} />
              {t('managerName')}
            </label>
            <input 
              type="text"
              className="input-field"
              value={formData.manager_name}
              onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <MapPin size={12} />
              {t('location')}
            </label>
            <input 
              type="text"
              className="input-field"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <Hash size={12} />
              {t('costCenter')}
            </label>
            <input 
              type="text"
              className="input-field"
              value={formData.cost_center_code}
              onChange={(e) => setFormData({ ...formData, cost_center_code: e.target.value })}
            />
          </div>

          <div className="col-span-1 md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              <Plus size={12} />
              {t('description')}
            </label>
            <textarea 
              className="input-field min-h-[80px]"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1.5">
              {t('status')}
            </label>
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="status" 
                  value="Active" 
                  checked={formData.status === 'Active'}
                  onChange={() => setFormData({ ...formData, status: 'Active' })}
                />
                <span className="text-sm font-bold text-[var(--color-text-main)]">{t('common.active')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="status" 
                  value="Inactive" 
                  checked={formData.status === 'Inactive'}
                  onChange={() => setFormData({ ...formData, status: 'Inactive' })}
                />
                <span className="text-sm font-bold text-[var(--color-text-main)]">{t('common.inactive')}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t">
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={loading} className="min-w-[120px]">
            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : (editingNode?.id ? t('update') : t('create'))}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default OrgStructure;
