import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, Search, Plus, Edit2, Trash2, Archive } from 'lucide-react';
import { motion } from 'motion/react';
import api from '../services/api';
import { useDepartments } from '../hooks/useDepartments';

import Modal from '../components/Modal';

const JobTitles: React.FC = () => {
  const { t } = useTranslation();
  const [jobTitles, setJobTitles] = useState<any[]>([]);
  const { departments } = useDepartments();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [titleToDelete, setTitleToDelete] = useState<string | number | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [titleToChangeStatus, setTitleToChangeStatus] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    department: '',
    job_level: 'Staff',
    description: '',
    reporting_to: '',
    status: 'Active'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await api.get('/job-titles');
      setJobTitles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTitles = jobTitles.filter(j => 
    (j.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    j.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const url = editingId ? `/job-titles/${editingId}` : '/job-titles';
      
      const payload = {
        ...formData,
        reporting_to: formData.reporting_to || null
      };

      if (editingId) {
        await api.put(url, payload);
      } else {
        await api.post(url, payload);
      }

      fetchData();
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', department: '', job_level: 'Staff', description: '', reporting_to: '', status: 'Active' });
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || t('jobTitles.failedToSaveJobTitle'));
    }
  };

  const editTitle = (title: any) => {
    setEditingId(title.id);
    setFormData({
      name: title.name || '',
      department: title.department || '',
      job_level: title.job_level || 'Staff',
      description: title.description || '',
      reporting_to: title.reporting_to ? title.reporting_to.toString() : '',
      status: title.status || 'Active'
    });
    setShowForm(true);
  };

  const deleteTitle = async () => {
    if (!titleToDelete) return;
    setError(null);
    try {
      await api.delete(`/job-titles/${titleToDelete}`);
      fetchData();
      setIsDeleteModalOpen(false);
      setTitleToDelete(null);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || t('jobTitles.failedToDeleteJobTitle'));
    }
  };

  const archiveTitle = async () => {
    if (!titleToChangeStatus) return;
    try {
      await api.put(`/job-titles/${titleToChangeStatus.id}`, { 
        ...titleToChangeStatus, 
        status: titleToChangeStatus.status === 'Active' ? 'Inactive' : 'Active' 
      });
      fetchData();
      setIsStatusModalOpen(false);
      setTitleToChangeStatus(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
            <Briefcase size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">{t('jobTitles')}</h3>
            <p className="text-xs text-slate-400 font-bold">{t('manageOrgRoles')}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder={t('common.search')}
              className="w-full p-2.5 ps-11 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary transition-colors shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={() => {
            setEditingId(null);
            setFormData({ name: '', department: '', job_level: 'Staff', description: '', reporting_to: '', status: 'Active' });
            setError(null);
            setShowForm(true);
          }} className="btn-primary !py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm">
            <Plus size={20} />
            <span>{t('addJobTitle')}</span>
          </button>
        </div>
      </div>

      {error && !showForm && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 font-bold text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-10 border-primary/20"
        >
          <h3 className="text-xl font-black text-slate-800 mb-8">{editingId ? t('editJobTitle') : t('addNewJobTitle')}</h3>
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 font-bold text-sm">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('jobTitleName')}</label>
                <input required className="input-field" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('common.departments')}</label>
                <select className="input-field" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})}>
                  <option value="">{t('plan.selectDepartment')}</option>
                  {(Array.isArray(departments) ? departments : []).map(dept => (
                    <option key={dept.id} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('jobLevel')}</label>
                <select className="input-field" value={formData.job_level || 'Staff'} onChange={e => setFormData({...formData, job_level: e.target.value})}>
                  <option value="Executive">{t('jobTitles.executive')}</option>
                  <option value="Manager">{t('jobTitles.manager')}</option>
                  <option value="Officer">{t('jobTitles.officer')}</option>
                  <option value="Staff">{t('jobTitles.staff')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('reportsTo')}</label>
                <select className="input-field" value={formData.reporting_to || ''} onChange={e => setFormData({...formData, reporting_to: e.target.value})}>
                  <option value="">{t('common.none')}</option>
                  {(Array.isArray(jobTitles) ? jobTitles : []).filter(j => String(j.id) !== String(editingId)).map(title => (
                    <option key={title.id} value={title.id}>{title.name} ({title.department})</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('common.description')}</label>
                <textarea className="input-field min-h-[100px]" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('common.statusLabel')}</label>
                <select className="input-field" value={formData.status || 'Active'} onChange={e => setFormData({...formData, status: e.target.value})}>
                  <option value="Active">{t('active')}</option>
                  <option value="Inactive">{t('inactive')}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button type="submit" className="btn-primary">{editingId ? t('common.save') : t('addJobTitle')}</button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.id')}</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('jobTitles')}</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.departments')}</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('jobLevel')}</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.statusLabel')}</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-start">{t('created')}</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(Array.isArray(filteredTitles) ? filteredTitles : []).map((title, idx) => (
                <motion.tr 
                  key={title.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-primary/5 transition-colors group"
                >
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">#{title.id}</td>
                  <td className="px-6 py-4">
                    <div className="font-black text-slate-800">{title.name}</div>
                    {title.description && <div className="text-xs text-slate-500 truncate max-w-[200px] mt-1">{title.description}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-600">{title.department || '-'}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600">
                      {t(`jobTitles.${title.job_level?.toLowerCase()}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      title.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${title.status === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {t(`jobTitles.${title.status?.toLowerCase()}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">
                    {new Date(title.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => editTitle(title)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title={t('common.edit')}>
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => {
                        setTitleToChangeStatus(title);
                        setIsStatusModalOpen(true);
                      }} className={`p-2 rounded-lg transition-colors ${title.status === 'Active' ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`} title={title.status === 'Active' ? t('markInactive') : t('markActive')}>
                        <Archive size={16} />
                      </button>
                      <button onClick={() => {
                        setTitleToDelete(title.id);
                        setIsDeleteModalOpen(true);
                      }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title={t('common.delete')}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={t('deleteJobTitle')}
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-600 font-bold">
            {t('deleteJobTitleConfirm')}
          </p>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
            <button 
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-6 py-3 rounded-[2rem] bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={deleteTitle}
              className="px-6 py-3 rounded-[2rem] bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={t('common.statusLabel')}
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-600 font-bold">
            {titleToChangeStatus?.status === 'Active' 
              ? t('statusConfirmInactive') 
              : t('statusConfirmActive')}
          </p>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
            <button 
              onClick={() => setIsStatusModalOpen(false)}
              className="px-6 py-3 rounded-[2rem] bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={archiveTitle}
              className="px-6 py-3 rounded-[2rem] bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default JobTitles;
