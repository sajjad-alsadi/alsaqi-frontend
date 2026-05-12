import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Eye, 
  Download, 
  MoreVertical,
  Calendar,
  Building,
  Tag,
  FileText,
  X,
  Send,
  Trash2,
  Edit2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { useFormat } from '../../services/formatService';
import { useDebounce } from '../../hooks/useDebounce';
import Modal from '../../components/Modal';
import PdfViewer from '../../components/PdfViewer';
import Pagination from '../../components/Pagination';

import OutgoingForm from './OutgoingForm';

interface OutgoingRegisterProps {
  language: 'ar' | 'en';
  userRole?: string;
  onViewDetails: (type: 'Outgoing', id: number) => void;
}

const OutgoingRegister: React.FC<OutgoingRegisterProps> = ({ language, userRole, onViewDetails }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 0 });
  const { formatDate, formatNumber } = useFormat();
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [pagination.page, pagination.pageSize, debouncedSearch]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/correspondence/outgoing', {
        params: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          search: debouncedSearch || undefined
        }
      });
      if (response.data.data) {
        setItems(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        }));
      } else {
        setItems(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch outgoing correspondence", error);
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete === null) return;
    try {
      await api.delete(`/correspondence/outgoing/${itemToDelete}`);
      fetchData();
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting letter:', error);
      toast.error(t('errorOccurred'));
    }
  };

  const handlePreview = (fileUrl: string) => {
    setPreviewUrl(fileUrl);
  };

  const filteredItems = items;

  return (
    <div className="space-y-4">
      <Modal
        isOpen={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        title={t('correspondence.previewFile')}
        size="full"
      >
        <div className="w-full h-full bg-[var(--color-bg-main)] rounded-xl overflow-hidden">
          {previewUrl && (
            previewUrl.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewUrl) ? (
              <img 
                src={previewUrl} 
                alt="Attachment" 
                className="max-w-full max-h-full object-contain mx-auto" 
                referrerPolicy="no-referrer"
              />
            ) : previewUrl.startsWith('data:application/pdf') || /\.pdf$/i.test(previewUrl) || (previewUrl && !previewUrl.startsWith('data:') && !previewUrl.startsWith('http') && !previewUrl.startsWith('/') && previewUrl.length > 100) ? (
              <div className="w-full h-full">
                <PdfViewer url={previewUrl} />
              </div>
            ) : (
              <div className="text-center p-10">
                <FileText size={48} className="mx-auto text-[var(--color-text-muted)] mb-4" />
                <p className="text-[var(--color-text-main)] font-bold">
                  {t('correspondence.previewNotAvailable')}
                </p>
                <a 
                  href={previewUrl} 
                  download="attachment"
                  className="mt-4 btn-primary inline-block"
                >
                  {t('correspondence.downloadFile')}
                </a>
              </div>
            )
          )}
        </div>
      </Modal>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-main)] p-8 rounded-2xl shadow-2xl w-full max-w-md border border-[var(--color-border-soft)]">
            <h3 className="text-xl font-bold text-[var(--color-text-main)] mb-4">
              {t('correspondence.confirmDelete')}
            </h3>
            <p className="text-[var(--color-text-muted)] mb-8">
              {t('correspondence.deleteLetterConfirm')}
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setItemToDelete(null);
                }}
                className="btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={confirmDelete}
                className="px-6 py-2.5 bg-[var(--color-danger)] text-white rounded-xl hover:bg-red-700 transition-colors shadow-md shadow-red-900/20"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-[var(--color-bg-soft)]/50 p-4 rounded-2xl border border-[var(--color-border-soft)] flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={18} />
          <input 
            type="text"
            placeholder={t('correspondence.searchOutgoingPlaceholder')}
            className="w-full p-2.5 ps-11 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl text-sm font-bold outline-none focus:border-[var(--color-primary)] transition-colors shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {userRole !== 'Viewer' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="btn-primary !py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
          >
            <Plus size={18} />
            {t('correspondence.addNew')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border-soft)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="bg-[var(--color-bg-soft)]/50 border-b border-[var(--color-border-soft)]">
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">
                  {t('correspondence.seqNumber')}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.date')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.recipient')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.subject')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.classification')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.sendingMethod')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-center">{t('correspondence.attachment')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-center">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]/50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-[var(--color-text-muted)] font-bold text-sm">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-[var(--color-text-muted)] font-bold text-sm">
                    {t('correspondence.noMatchingResults')}
                  </td>
                </tr>
              ) : (Array.isArray(filteredItems) ? filteredItems : []).map((item) => (
                <tr key={item.id} className="hover:bg-[var(--color-primary)]/5 transition-colors group cursor-pointer" onClick={() => onViewDetails('Outgoing', item.id)}>
                  <td className="px-6 py-4 text-xs font-bold text-[var(--color-border-strong)] tracking-widest">{formatNumber(item.sequence_number)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">{formatDate(item.letter_date)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">
                    <div className="flex items-center gap-2">
                      <Building size={14} className="text-[var(--color-text-muted)]" />
                      {item.recipient_entity}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)] max-w-xs truncate">{item.subject}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-[var(--color-bg-main)] rounded-lg text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] border border-[var(--color-border-soft)]">
                      {t(`correspondence.${(item.classification || '').toLowerCase().replace(/\s+/g, '_')}`) || item.classification}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-[var(--color-text-main)]">
                    {t(`correspondence.${(item.sending_method || '').toLowerCase().replace(/\s+/g, '_')}`) || item.sending_method}
                  </td>
                  <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    {item.attachment_file && (
                      <button 
                        onClick={() => handlePreview(item.attachment_file!)} 
                        className="p-2 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-xl transition-colors inline-flex"
                        title={t('correspondence.previewAttachment')}
                      >
                        <FileText size={18} />
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button className="p-2 bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)] hover:text-[var(--color-primary)] rounded-xl shadow-sm transition-all" title={t('common.download')}>
                        <Download size={16} />
                      </button>
                      {userRole === 'Admin' && (
                        <>
                          <button className="p-2 bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)] hover:text-amber-500 rounded-xl shadow-sm transition-all" title={t('common.edit')}>
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className="p-2 bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)] hover:text-red-500 rounded-xl shadow-sm transition-all" 
                            onClick={() => handleDelete(item.id)}
                            title={t('common.delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
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
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--color-card)] rounded-3xl border border-[var(--color-border-soft)] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-[var(--color-border-soft)] flex items-center justify-between bg-[var(--color-bg-main)]">
                <h2 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-2">
                  <Send className="text-[var(--color-primary)]" />
                  {t('correspondence.registerOutgoingTitle')}
                </h2>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-full hover:bg-[var(--color-border-soft)] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <OutgoingForm 
                  language={language} 
                  onSuccess={() => {
                    setShowAddModal(false);
                    fetchData();
                  }}
                  onCancel={() => setShowAddModal(false)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OutgoingRegister;
