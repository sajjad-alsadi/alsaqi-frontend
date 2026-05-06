import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Download, ExternalLink, Calendar, Tag, FileText, Scale, Bookmark, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { generatePdf, PdfSection } from '../utils/pdfExport';
import Modal from '../components/Modal';
import LegalForm from '../components/LegalForm';
import PdfViewer from '../components/PdfViewer';

const LegalModule: React.FC = () => {
  const { token, user } = useAppContext();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [laws, setLaws] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLaw, setSelectedLaw] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  useEffect(() => {
    fetchLaws();
    
    // Check for search term from navigation state
    if (location.state?.searchTerm) {
      setSearchTerm(location.state.searchTerm);
    }
  }, [location.state]);

  const fetchLaws = async () => {
    try {
      const res = await api.get('/law-bank');
      // Handle both direct array and pagination object
      const data = res.data.data || (Array.isArray(res.data) ? res.data : []);
      setLaws(data);
    } catch (err) {
      console.error(err);
      setLaws([]);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id: number) => {
    setDeleteConfirmId(id);
  };

  const deleteLaw = async () => {
    if (deleteConfirmId === null) return;
    try {
      await api.delete(`/law-bank/${deleteConfirmId}`);
      setLaws(prev => prev.filter(l => l.id !== deleteConfirmId));
      if (selectedLaw?.id === deleteConfirmId) {
        setIsViewModalOpen(false);
        setSelectedLaw(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const exportPDF = async () => {
    const sections: PdfSection[] = [{
      type: 'table',
      columns: [
        { header: t('common.id'), dataKey: 'id' },
        { header: t('common.title'), dataKey: 'title' },
        { header: t('common.type'), dataKey: 'type' },
        { header: t('common.authority'), dataKey: 'authority' },
        { header: t('common.issueDate'), dataKey: 'issue_date' }
      ],
      data: (Array.isArray(laws) ? laws : []).map(l => ({
        id: l.id,
        title: l.title,
        type: l.type,
        authority: l.authority,
        issue_date: l.issue_date
      }))
    }];

    await generatePdf(t('legal.title'), sections, token, i18n.language as 'en' | 'ar');
  };

  const toggleBookmark = async (id: number, currentStatus: number) => {
    try {
      await api.put(`/law-bank/${id}`, { bookmarked: currentStatus ? 0 : 1 });
      fetchLaws();
    } catch (err) {
      console.error(err);
    }
  };

  const openViewModal = (law: any) => {
    setSelectedLaw(law);
    setIsViewModalOpen(true);
  };

  const openPdf = (url: string) => {
    setPdfUrl(url);
    setIsPdfModalOpen(true);
  };

  const bookmarkedLaws = Array.isArray(laws) ? laws.filter(l => l.bookmarked) : [];
  const filteredLaws = Array.isArray(laws) ? laws.filter(l => 
    (l.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (l.keywords?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  ) : [];

  return (
    <div className="space-y-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-100 rounded-[1.5rem] flex items-center justify-center text-slate-600 shadow-xl shadow-slate-100">
            <Scale size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('legal.title')}</h2>
            <p className="text-sm text-slate-400 font-bold mt-2">{t('legal.subtitle')}</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder={t('common.search')}
              className="input-field !ps-14"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <button onClick={exportPDF} className="w-14 h-14 bg-white border border-slate-200 rounded-[1.5rem] text-slate-600 hover:bg-primary/10 hover:text-primary transition-all flex items-center justify-center shadow-sm">
              <Download size={24} />
            </button>
            {(user?.role === 'Admin' || user?.role === 'Administrator') && (
              <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center justify-center gap-3 whitespace-nowrap">
                <Plus size={24} />
                <span>{t('common.add')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('common.add')}>
        <LegalForm onSuccess={() => { setIsModalOpen(false); fetchLaws(); }} onClose={() => setIsModalOpen(false)} />
      </Modal>

      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title={t('legal.details')}>
        {selectedLaw && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selectedLaw.title}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  <span className="px-2 py-1 bg-slate-100 rounded-md">{selectedLaw.type}</span>
                  <span>{selectedLaw.authority}</span>
                  <span>{selectedLaw.issue_date}</span>
                </div>
              </div>
              {(user?.role === 'Admin' || user?.role === 'Administrator') && (
                <button 
                  onClick={() => confirmDelete(selectedLaw.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title={t('legal.deleteLaw')}
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <h4 className="text-sm font-bold text-slate-700 mb-2">{t('legal.descriptionFullText')}</h4>
              <p className="text-slate-600 whitespace-pre-wrap">{selectedLaw.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('legal.riskArea')}</h4>
                <p className="text-slate-700 font-medium">{selectedLaw.related_risk_area}</p>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('common.department')}</h4>
                <p className="text-slate-700 font-medium">{selectedLaw.department || t('common.notAvailable')}</p>
              </div>
            </div>

            {selectedLaw.attachment && (
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-2">{t('common.attachment')}</h4>
                <div className="flex gap-4">
                  <button 
                    onClick={() => openPdf(selectedLaw.attachment)}
                    className="flex items-center gap-3 p-3 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors flex-1 justify-center"
                  >
                    <FileText size={20} />
                    <span className="font-medium">{t('common.viewFile')}</span>
                  </button>
                  <a 
                    href={selectedLaw.attachment} 
                    download="attachment"
                    className="flex items-center gap-3 p-3 bg-slate-50 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <Download size={20} />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={isPdfModalOpen} onClose={() => setIsPdfModalOpen(false)} title={t('common.fileViewer')} size="full">
        {pdfUrl && (
          <div className="h-full w-full bg-slate-50 rounded-xl overflow-hidden">
            {pdfUrl.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(pdfUrl) ? (
              <img 
                src={pdfUrl} 
                alt="Attachment" 
                className="max-w-full max-h-full object-contain mx-auto" 
                referrerPolicy="no-referrer"
              />
            ) : pdfUrl.startsWith('data:application/pdf') || /\.pdf$/i.test(pdfUrl) || (pdfUrl && !pdfUrl.startsWith('data:') && !pdfUrl.startsWith('http') && !pdfUrl.startsWith('/') && pdfUrl.length > 100) ? (
              <div className="w-full h-full">
                <PdfViewer url={pdfUrl} />
              </div>
            ) : (
              <div className="text-center p-10">
                <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 font-bold">{t('legal.previewNotAvailableDesc')}</p>
                <a 
                  href={pdfUrl} 
                  download="attachment"
                  className="mt-4 btn-primary inline-block"
                >
                  {t('common.downloadFile')}
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} title={t('common.confirmDelete')} size="sm">
        <div className="space-y-6">
          <p className="text-slate-600">{t('common.confirmDeleteMessage')}</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-bold">
              {t('common.cancel')}
            </button>
            <button onClick={deleteLaw} className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-bold">
              {t('common.confirmDelete')}
            </button>
          </div>
        </div>
      </Modal>

      {bookmarkedLaws.length > 0 && (
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">{t('legal.quickAccessBookmarks')}</h3>
          <div className="flex flex-wrap gap-4">
            {bookmarkedLaws.map(law => (
              <button key={law.id} onClick={() => openViewModal(law)} className="px-6 py-3 bg-indigo-50 text-indigo-700 font-bold text-sm rounded-full hover:bg-indigo-100 transition-all">
                {law.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {filteredLaws.map((law, idx) => (
          <motion.div 
            key={law.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card p-10 group hover:border-primary/30 transition-all flex flex-col"
          >
            <div className="flex items-start justify-between mb-8">
              <span className="px-4 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                {t(`legal.${law.type.toLowerCase()}`) || law.type}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleBookmark(law.id, law.bookmarked)} className={`p-2 rounded-full ${law.bookmarked ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-indigo-600'}`}>
                  <Bookmark size={20} fill={law.bookmarked ? 'currentColor' : 'none'} />
                </button>
                {(user?.role === 'Admin' || user?.role === 'Administrator') && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); confirmDelete(law.id); }}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
            
            <h3 className="text-xl font-black text-slate-800 group-hover:text-primary transition-colors mb-4 flex-1">{law.title}</h3>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2"><Calendar size={14} /> {law.issue_date}</span>
                <span className="flex items-center gap-2"><Tag size={14} /> {law.authority}</span>
              </div>
              
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">{t('legal.relatedRiskArea')}</p>
                <p className="text-sm font-bold text-slate-700">{law.related_risk_area}</p>
              </div>

              <div className="flex items-center gap-4">
                <button onClick={() => openViewModal(law)} className="flex-1 py-4 bg-white border border-slate-200 text-primary font-black rounded-xl hover:bg-primary hover:text-white transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-3">
                  <FileText size={16} />
                  {t('legal.readFullText')}
                </button>
                <button onClick={() => openViewModal(law)} className="w-12 h-12 flex items-center justify-center text-slate-300 hover:bg-white hover:text-primary rounded-xl transition-all shadow-sm">
                  <ExternalLink size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default LegalModule;
