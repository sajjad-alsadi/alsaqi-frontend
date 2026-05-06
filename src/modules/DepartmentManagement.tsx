import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Edit2, Building, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useDepartments } from '../hooks/useDepartments';
import JobTitles from './JobTitles';

const DepartmentManagement: React.FC = () => {
  const { t } = useTranslation();
  const { departments, refresh } = useDepartments();
  const [activeTab, setActiveTab ] = useState<'departments' | 'jobTitles'>('departments');
  const [newDept, setNewDept] = useState('');
  const [editingDept, setEditingDept] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addDept = async () => {
    if (!newDept.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/departments', { name: newDept.trim() });
      setNewDept('');
      toast.success(t('createSuccess'));
      refresh();
    } catch (error: any) {
      console.error("Error adding department:", error);
      const msg = error.response?.data?.error || t('failedToAddDepartment', 'Failed to add department');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deptToDelete, setDeptToDelete] = useState<string | number | null>(null);

  const handleDeleteClick = (id: string | number) => {
    setDeptToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deptToDelete) return;
    setError(null);
    try {
      await api.delete(`/departments/${deptToDelete}`);
      toast.success(t('deleteSuccess'));
      refresh();
      setShowDeleteConfirm(false);
      setDeptToDelete(null);
    } catch (error: any) {
      console.error("Error deleting department:", error);
      const msg = error.response?.data?.error || t('failedToDeleteDepartment', 'Failed to delete department');
      setError(msg);
      toast.error(msg);
    }
  };

  const editDept = async (id: string | number, name: string) => {
    setError(null);
    try {
      await api.put(`/departments/${id}`, { name });
      toast.success(t('updateSuccess'));
      setEditingDept(null);
      refresh();
    } catch (error: any) {
      console.error("Error updating department:", error);
      const msg = error.response?.data?.error || t('failedToUpdateDepartment', 'Failed to update department');
      setError(msg);
      toast.error(msg);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');

  const filteredDepartments = departments.filter(dept => 
    (dept.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-primary)] rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-[var(--color-primary)]/20">
            <Building size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('modules.OrgStructure')}</h2>
            <p className="text-sm text-slate-400 font-bold mt-2">{t('manageSystemDepartments')}</p>
          </div>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('departments')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${
            activeTab === 'departments' 
              ? 'bg-white text-[var(--color-primary)] shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building size={18} />
          {t('common.departments')}
        </button>
        <button 
          onClick={() => setActiveTab('jobTitles')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${
            activeTab === 'jobTitles' 
              ? 'bg-white text-[var(--color-primary)] shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Briefcase size={18} />
          {t('common.jobTitles')}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'departments' ? (
          <motion.div 
            key="depts"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-card p-10"
          >
            {error && (
              <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 font-bold text-sm">
                {error}
              </div>
            )}
            
            <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <h3 className="text-lg font-bold text-slate-700 mb-4">{t('addNew', 'Add New')}</h3>
              <div className="flex gap-4">
                <input 
                  className="input-field" 
                  placeholder={t('newDepartmentName', 'New Department Name')} 
                  value={newDept} 
                  onChange={e => setNewDept(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && addDept()}
                />
                <button 
                  onClick={addDept} 
                  disabled={loading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Plus size={20} />
                  {loading ? "..." : t('add', 'Add')}
                </button>
              </div>
            </div>

            <div className="mb-6">
              <input 
                className="input-field" 
                placeholder={t('search', 'Search')} 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>

            <div className="space-y-4">
              {filteredDepartments.length === 0 ? (
                <div className="text-center py-8 text-slate-400">{t('noDepartmentsFound', 'No departments found')}</div>
              ) : (
                (Array.isArray(filteredDepartments) ? filteredDepartments : []).map(dept => (
                  <div key={dept.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    {editingDept?.id === dept.id ? (
                      <input className="input-field" value={editingDept.name || ''} onChange={e => setEditingDept({...editingDept, name: e.target.value})} />
                    ) : (
                      <span className="font-bold text-slate-700">{dept.name}</span>
                    )}
                    <div className="flex gap-2">
                      {editingDept?.id === dept.id ? (
                        <button onClick={() => editDept(dept.id, editingDept.name)} className="btn-primary text-xs">{t('save')}</button>
                      ) : (
                        <button onClick={() => setEditingDept(dept)} className="p-2 text-slate-400 hover:text-primary"><Edit2 size={18} /></button>
                      )}
                      <button onClick={() => handleDeleteClick(dept.id)} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 size={18} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="jobs"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <JobTitles />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <h3 className="text-xl font-bold text-slate-800 mb-2">{t('deleteConfirm', 'Confirm Deletion')}</h3>
            <p className="text-slate-500 mb-6">{t('deleteMessage', 'Are you sure you want to delete this department?')}</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
              >
                {t('cancel', 'Cancel')}
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-500 text-white font-medium rounded-lg hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20"
              >
                {t('delete', 'Delete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default DepartmentManagement;
