import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { Plus, Search, Download, ExternalLink, Calendar, Tag, FileText, Trash2, Edit } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { generatePdf, PdfSection } from '../utils/pdfExport';
import { getInstructions, deleteInstruction } from '../services/regulatoryService';
import { getDepartments } from '../services/departmentService';
import api from '../services/api';

import Modal from '../components/Modal';
import RegulatoryForm from '../components/RegulatoryForm';
import PdfViewer from '../components/PdfViewer';
import { useFormat } from '../services/formatService';

const RegulatoryModule: React.FC = () => {
  const { token, user } = useAppContext();
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const location = useLocation();
  const [instructions, setInstructions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInstruction, setSelectedInstruction] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  useEffect(() => {
    fetchInstructions();
    getDepartments()
      .then(data => setDepartments(data))
      .catch(() => setDepartments([]));
      
    // Check for search term from navigation state
    if (location.state?.searchTerm) {
      setSearchTerm(location.state.searchTerm);
    }
  }, [location.state]);

  const fetchInstructions = async () => {
    try {
      const instructionsData = await getInstructions();
      setInstructions(instructionsData);
    } catch (err) {
      console.error(err);
      setInstructions([]);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id: number) => {
    setDeleteConfirmId(id);
  };

  const deleteInstructionHandler = async () => {
    if (deleteConfirmId === null) return;
    try {
      await deleteInstruction(deleteConfirmId.toString());
      setInstructions(prev => prev.filter(i => i.id !== deleteConfirmId));
      if (selectedInstruction?.id === deleteConfirmId) {
        setIsViewModalOpen(false);
        setSelectedInstruction(null);
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
        { header: t('common.name'), dataKey: 'title' },
        { header: t('common.issueDate'), dataKey: 'issue_date' },
        { header: t('common.referenceNumber'), dataKey: 'reference_number' },
        { header: t('common.category'), dataKey: 'category' },
        { header: t('common.statusLabel'), dataKey: 'status' }
      ],
      data: (Array.isArray(instructions) ? instructions : []).map(i => ({
        id: i.id,
        title: i.title,
        issue_date: i.issue_date,
        reference_number: i.reference_number,
        category: i.category,
        status: i.status
      }))
    }];

    await generatePdf(t('common.centralBankInstructions'), sections, token, i18n.language as 'ar' | 'en');
  };

  const openViewModal = (instruction: any) => {
    setSelectedInstruction(instruction);
    setIsViewModalOpen(true);
  };

  const openEditModal = (instruction: any) => {
    setSelectedInstruction(instruction);
    setIsModalOpen(true);
  };

  const openPdf = (url: string) => {
    setPdfUrl(url);
    setIsPdfModalOpen(true);
  };

  const [filters, setFilters] = useState({ department: '', category: '' });

  const filteredInstructions = (Array.isArray(instructions) ? instructions : []).filter(i => 
    ((i.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
     (i.reference_number?.toLowerCase() || '').includes(searchTerm.toLowerCase())) &&
    (filters.department === '' || i.related_department === filters.department) &&
    (filters.category === '' || i.category === filters.category)
  );

  const categories = Array.from(new Set((Array.isArray(instructions) ? instructions : []).map(i => i.category)));

  const getRelatedInstructionTitle = (id: number) => {
    const related = (Array.isArray(instructions) ? instructions : []).find(i => i.id == id);
    return related ? `${related.title} (${related.reference_number})` : t('common.notAvailable');
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">{t('common.centralBankInstructions')}</h2>
          <p className="text-sm text-slate-400 font-bold mt-2">{t('common.regulatoryComplianceRepository')}</p>
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
          <select 
            className="input-field"
            value={filters.department}
            onChange={(e) => setFilters({ ...filters, department: e.target.value })}
          >
            <option value="">{t('common.allDepartments')}</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select 
            className="input-field"
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            <option value="">{t('common.allCategories')}</option>
            {categories.map(c => <option key={c} value={c}>{t(`common.${c.toLowerCase()}`) || c}</option>)}
          </select>
          <div className="flex items-center gap-4">
            <button onClick={exportPDF} className="w-14 h-14 bg-white border border-slate-200 rounded-[1.5rem] text-slate-600 hover:bg-primary/10 hover:text-primary transition-all flex items-center justify-center shadow-sm">
              <Download size={24} />
            </button>
            {(user?.role === 'Admin' || user?.role === 'Administrator') && (
              <button 
                onClick={() => { setSelectedInstruction(null); setIsModalOpen(true); }}
                className="btn-primary flex items-center justify-center gap-3 whitespace-nowrap"
              >
                <Plus size={24} />
                <span>{t('common.add')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedInstruction ? t('common.update') : t('common.add')}>
        <RegulatoryForm 
          initialData={selectedInstruction}
          onSuccess={() => { setIsModalOpen(false); fetchInstructions(); }} 
          onClose={() => setIsModalOpen(false)} 
        />
      </Modal>

      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title={t('common.instructionDetails')}>
        {selectedInstruction && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selectedInstruction.title}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  <span className="px-2 py-1 bg-slate-100 rounded-md">{selectedInstruction.category}</span>
                  <span className="font-mono">{t('common.referenceNumber')}: {selectedInstruction.reference_number}</span>
                  <span>{formatDate(selectedInstruction.issue_date)}</span>
                </div>
              </div>
              {(user?.role === 'Admin' || user?.role === 'Administrator') && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setIsViewModalOpen(false); openEditModal(selectedInstruction); }}
                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                    title={t('common.edit')}
                  >
                    <Edit size={20} />
                  </button>
                  <button 
                    onClick={() => confirmDelete(selectedInstruction.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <h4 className="text-sm font-bold text-slate-700 mb-2">{t('common.description')}</h4>
              <p className="text-slate-600 whitespace-pre-wrap">{selectedInstruction.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('common.statusLabel')}</h4>
                <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-bold ${
                  selectedInstruction.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 
                  selectedInstruction.status === 'Overdue' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    selectedInstruction.status === 'Active' ? 'bg-emerald-500' : 
                    selectedInstruction.status === 'Overdue' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`} />
                  {selectedInstruction.status === 'Active' ? t('common.active') : 
                   selectedInstruction.status === 'Overdue' ? t('common.overdue') :
                   t('common.cancelled')}
                </span>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('common.department')}</h4>
                <p className="text-slate-700 font-medium">{selectedInstruction.related_department || t('common.notAvailable')}</p>
              </div>
            </div>

            {selectedInstruction.related_instruction_id && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">{t('common.relatedInstruction')}</h4>
                <p className="text-amber-900 font-medium flex items-center gap-2">
                  <ExternalLink size={14} />
                  {getRelatedInstructionTitle(selectedInstruction.related_instruction_id)}
                </p>
              </div>
            )}

            {selectedInstruction.attachment && (
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-2">{t('common.attachment')}</h4>
                <div className="flex gap-4">
                  <button 
                    onClick={() => openPdf(selectedInstruction.attachment)}
                    className="flex items-center gap-3 p-3 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors flex-1 justify-center"
                  >
                    <FileText size={20} />
                    <span className="font-medium">{t('common.viewFile')}</span>
                  </button>
                  <a 
                    href={selectedInstruction.attachment} 
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
                <p className="text-slate-500 font-bold">{t('common.previewNotAvailable')}</p>
                <a 
                  href={pdfUrl} 
                  download="attachment"
                  className="mt-4 btn-primary inline-block"
                >
                  {t('common.downloadFile')}
                </a>
              </div>
            )
          }
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
            <button onClick={deleteInstructionHandler} className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-bold">
              {t('common.confirmDelete')}
            </button>
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-1 gap-6">
        {filteredInstructions.map((item, idx) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card p-8 group hover:border-primary/30 transition-all cursor-pointer"
            onClick={() => openViewModal(item)}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                    {t(item.category.toLowerCase()) || item.category}
                  </span>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                    {t('common.referenceNumber')}: {item.reference_number}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-800 group-hover:text-primary transition-colors mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600 mb-4 line-clamp-2">{item.description}</p>
                <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 font-bold">
                  <span className="flex items-center gap-2"><Calendar size={14} /> {formatDate(item.issue_date)}</span>
                  <span className="flex items-center gap-2"><Tag size={14} /> {item.related_department}</span>
                  <span className={`flex items-center gap-2 ${
                    item.status === 'Active' ? 'text-emerald-500' : 
                    item.status === 'Overdue' ? 'text-amber-500' :
                    'text-red-500'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      item.status === 'Active' ? 'bg-emerald-500' : 
                      item.status === 'Overdue' ? 'bg-amber-500' :
                      'bg-red-500'
                    }`} />
                    {item.status === 'Active' ? t('common.active') : 
                     item.status === 'Overdue' ? t('common.overdue') :
                     t('common.cancelled')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={(e) => { e.stopPropagation(); openViewModal(item); }}
                  className="w-12 h-12 flex items-center justify-center text-slate-300 hover:bg-white hover:text-primary rounded-xl transition-all shadow-sm"
                >
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

export default RegulatoryModule;
