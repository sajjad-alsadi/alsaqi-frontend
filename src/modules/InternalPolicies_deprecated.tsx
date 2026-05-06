import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, Download, Trash2, FileText, CheckCircle2, AlertCircle, Eye, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import PdfViewer from '../components/PdfViewer';
import { useFormat } from '../services/formatService';

interface Policy {
  id: number;
  title: string;
  department: string;
  version: string;
  upload_date: string;
  file_url?: string;
  status: string;
}

const InternalPolicies: React.FC = () => {
  const { token, user } = useAppContext();
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const location = useLocation();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<number | null>(null);
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    department: '',
    version: '1.0',
    file_url: '',
    status: 'Active'
  });

  useEffect(() => {
    fetchPolicies();
    fetchDepartments();
    
    // Check for search term from navigation state
    if (location.state?.searchTerm) {
      setSearchTerm(location.state.searchTerm);
    }
  }, [location.state]);

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments');
      if (res.data && res.data.data) {
        setDepartments(res.data.data);
      } else {
        setDepartments(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error(err);
      setDepartments([]);
    }
  };

  const fetchPolicies = async () => {
    try {
      const res = await api.get('/policies');
      if (res.data && res.data.data) {
        setPolicies(res.data.data);
      } else {
        setPolicies(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error(err);
      setPolicies([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, file_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.file_url) {
      setError(t('uploadFile'));
      return;
    }
    try {
      await api.post('/policies', formData);
      toast.success(t('createSuccess'));
      setIsModalOpen(false);
      setFormData({ title: '', department: '', version: '1.0', file_url: '', status: 'Active' });
      // Reset file input
      const fileInput = document.getElementById('policy-file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchPolicies();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.error || t('errorSavingPolicy');
      setError(msg);
      toast.error(msg);
    }
  };

  const fetchFileUrl = async (id: number): Promise<string | null> => {
    try {
      const res = await api.get(`/policies/${id}/file`);
      return res.data.file_url;
    } catch (err) {
      console.error(err);
    }
    return null;
  };

  const handleView = async (policy: Policy) => {
    setError(null);
    const fileUrl = policy.file_url || await fetchFileUrl(policy.id);
    if (fileUrl) {
      setViewingPdf(fileUrl);
    } else {
      setError(t('common.fileNotFound'));
    }
  };

  const handleDownload = async (policy: Policy) => {
    const fileUrl = policy.file_url || await fetchFileUrl(policy.id);
    if (!fileUrl) return;
    
    if (fileUrl.startsWith('data:')) {
      // It's a base64 string
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = `${policy.title}_v${policy.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // It's a regular URL
      window.open(fileUrl, '_blank');
    }
  };

  const deletePolicy = async () => {
    if (!policyToDelete) return;
    try {
      await api.delete(`/policies/${policyToDelete}`);
      toast.success(t('deleteSuccess'));
      fetchPolicies();
      setIsDeleteModalOpen(false);
      setPolicyToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error(t('errorOccurred'));
    }
  };

  const isAdminOrCompliance = user?.role === 'Admin' || user?.role === 'Administrator' || user?.role === 'Compliance' || user?.role === 'Compliance Officer';

  const filteredPolicies = (Array.isArray(policies) ? policies : []).filter(p => 
    (p.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (p.department?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('internalPolicies')}</h2>
          <p className="text-sm text-slate-400 font-bold mt-2">{t('policiesSubtitle')}</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder={t('search')}
              className="input-field !ps-14"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isAdminOrCompliance && (
            <button 
              onClick={() => {
                setIsModalOpen(true);
                setError(null);
              }}
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Plus size={20} />
              {t('addPolicy')}
            </button>
          )}
        </div>
      </div>

      {error && !isModalOpen && (
        <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 font-bold text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPolicies.map((policy, idx) => (
          <motion.div 
            key={policy.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card p-6 flex flex-col justify-between group hover:border-primary/30 transition-all"
          >
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <BookOpen size={24} />
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  policy.status === 'Active' ? 'bg-emerald-100 text-emerald-600' : 
                  policy.status === 'needs_review' ? 'bg-amber-100 text-amber-600' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {policy.status === 'Active' ? t('active') : 
                   policy.status === 'needs_review' ? t('needsReview', 'Needs Review') : 
                   t('archived')}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2 line-clamp-2">{policy.title}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">
                {t('department')}: {policy.department} • {t('version')}: {policy.version}
              </p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">
                {t('uploadDate')}: {formatDate(policy.upload_date)}
              </p>
            </div>
            
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
              <button 
                onClick={() => handleView(policy)}
                className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-indigo-600 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
              >
                <Eye size={16} />
                {t('viewFile')}
              </button>
              <button 
                onClick={() => handleDownload(policy)}
                className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-600 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
              >
                <Download size={16} />
                {t('download')}
              </button>
              {isAdminOrCompliance && (
                <button 
                  onClick={() => {
                    setPolicyToDelete(policy.id);
                    setIsDeleteModalOpen(true);
                  }}
                  className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Policy Modal */}
      <Modal isOpen={isModalOpen} onClose={() => {
        setIsModalOpen(false);
        setError(null);
      }} title={t('addPolicy')}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 font-bold text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{t('title')}</label>
            <input
              type="text"
              required
              className="input-field"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{t('department')}</label>
              <select
                required
                className="input-field"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              >
                <option value="">{t('selectDepartment')}</option>
                <option value="All Departments">{t('allDepartments')}</option>
                {(Array.isArray(departments) ? departments : []).map((dept) => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{t('version')}</label>
              <input
                type="text"
                required
                className="input-field"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{t('uploadFile')}</label>
            <input
              id="policy-file-upload"
              type="file"
              accept=".pdf"
              required
              className="input-field py-3"
              onChange={handleFileUpload}
            />
            {formData.file_url && <p className="text-xs text-emerald-500 mt-2 font-bold flex items-center gap-1"><CheckCircle2 size={14} /> {t('fileUploaded')}</p>}
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{t('status')}</label>
            <select
              className="input-field"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="Active">{t('active')}</option>
              <option value="Archived">{t('archived')}</option>
            </select>
          </div>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary">
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View PDF Modal */}
      <Modal isOpen={!!viewingPdf} onClose={() => setViewingPdf(null)} title={t('viewFile')} size="full">
        <div className="w-full h-full bg-slate-100 rounded-xl overflow-hidden">
          {viewingPdf && (
            viewingPdf.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(viewingPdf) ? (
              <img 
                src={viewingPdf} 
                alt="Attachment" 
                className="max-w-full max-h-full object-contain mx-auto" 
                referrerPolicy="no-referrer"
              />
            ) : viewingPdf.startsWith('data:application/pdf') || /\.pdf$/i.test(viewingPdf) || (viewingPdf && !viewingPdf.startsWith('data:') && !viewingPdf.startsWith('http') && !viewingPdf.startsWith('/') && viewingPdf.length > 100) ? (
              <div className="w-full h-full">
                <PdfViewer url={viewingPdf} />
              </div>
            ) : (
              <div className="text-center p-10">
                <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 font-bold">{t('previewNotAvailableDesc')}</p>
                <a 
                  href={viewingPdf} 
                  download="attachment"
                  className="mt-4 btn-primary inline-block"
                >
                  {t('downloadFile')}
                </a>
              </div>
            )
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={t('deletePolicy')}
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-600 font-bold">
            {t('deleteMessage')}
          </p>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
            <button 
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-6 py-3 rounded-[2rem] bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={deletePolicy}
              className="px-6 py-3 rounded-[2rem] bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30"
            >
              {t('delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default InternalPolicies;
