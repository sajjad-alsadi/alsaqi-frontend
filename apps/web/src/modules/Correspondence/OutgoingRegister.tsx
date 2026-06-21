import React, { useState, useEffect, Suspense } from 'react';
import { 
  Search, 
  Plus, 
  Download, 
  Building,
  FileText,
  Send,
  Trash2,
  Edit2,
  AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/httpClient';
import { toList, toPagination } from '../../api/utils/envelope';
import toast from 'react-hot-toast';
import { useFormat } from '../../utils/formatService';
import { useDebounce } from '../../hooks/useDebounce';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import Pagination from '../../components/Pagination';
import { UserRole } from '../../constants';
import logger from '../../utils/logger';
import { buildCsv, downloadCsv } from '../../utils/csvExport';
import { Button } from '@/components/ui/button';
import type { Correspondence } from '@alsaqi/shared';

import OutgoingForm from './OutgoingForm';

// Lazy-load PdfViewer (and its react-pdf/pdfjs-dist dependencies) so the chunk
// only loads when a PDF is actually previewed.
const PdfViewer = React.lazy(() => import('../../components/PdfViewer'));

/** Allowlist of safe URL protocols for attachment preview */
const SAFE_PREVIEW_PROTOCOLS = ['https:', 'data:application/pdf', 'data:image/'];

function isSafePreviewUrl(url: string): boolean {
  if (!url) return false;
  // Allow data URIs for images and PDFs
  if (url.startsWith('data:image/') || url.startsWith('data:application/pdf')) return true;
  // Allow HTTPS URLs
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    // Relative URLs or non-parseable — allow only if it looks like a file path
    return /^\/[\w\-/.]+$/.test(url);
  }
}

interface OutgoingRegisterProps {
  language: 'ar' | 'en';
  userRole?: string | undefined;
  onViewDetails: (type: 'Outgoing', id: number) => void;
}

const OutgoingRegister: React.FC<OutgoingRegisterProps> = ({ language, userRole, onViewDetails }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<Correspondence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
      const response = await api.get('/correspondence/outgoing', {
        params: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          search: debouncedSearch || undefined
        }
      });
      const list = toList<Correspondence>(response.data);
      setItems(list);
      setPagination(prev => ({ ...prev, ...toPagination(response.data, list.length) }));
    } catch (error) {
      logger.error("Failed to fetch outgoing correspondence", error);
      setError(t('correspondence.failedToLoad'));
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: number) => {
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
      logger.error('Error deleting letter:', error);
      toast.error(t('errorOccurred'));
    }
  };

  const handlePreview = (fileUrl: string) => {
    if (isSafePreviewUrl(fileUrl)) {
      setPreviewUrl(fileUrl);
    } else {
      logger.error("Blocked unsafe preview URL", { url: fileUrl });
      toast.error(t('correspondence.unsafeAttachment'));
    }
  };

  const handleExport = () => {
    const headers = [
      t('correspondence.seqNumber'),
      t('correspondence.date'),
      t('correspondence.recipient'),
      t('correspondence.subject'),
      t('correspondence.classification'),
      t('correspondence.sendingMethod')
    ];

    const csvData = items.map(item => [
      item.letter_number,
      item.letter_date,
      item.recipient_entity,
      item.subject,
      item.classification,
      item.sending_method
    ]);

    const csv = buildCsv(headers, csvData);
    downloadCsv(`outgoing_correspondence_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      {/* File Preview Modal */}
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
            ) : previewUrl.startsWith('data:application/pdf') || /\.pdf$/i.test(previewUrl) ? (
              <div className="w-full h-full">
                <Suspense fallback={<LoadingSpinner />}>
                  <PdfViewer url={previewUrl} />
                </Suspense>
              </div>
            ) : (
              <div className="text-center p-10">
                <FileText size={48} className="mx-auto text-[var(--color-text-muted)] mb-4" />
                <p className="text-[var(--color-text-main)] font-bold">
                  {t('correspondence.previewNotAvailable')}
                </p>
                <Button asChild>
                  <a 
                    href={previewUrl} 
                    download="attachment"
                    className="mt-4 inline-block"
                  >
                    {t('correspondence.downloadFile')}
                  </a>
                </Button>
              </div>
            )
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setItemToDelete(null); }}
        title={t('correspondence.confirmDelete')}
        size="sm"
      >
        <div className="space-y-6">
          <p className="text-[var(--color-text-muted)]">
            {t('correspondence.deleteLetterConfirm')}
          </p>
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setItemToDelete(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <button 
              onClick={confirmDelete}
              className="px-6 py-2.5 bg-[var(--color-danger)] text-white rounded-xl hover:bg-red-700 transition-colors shadow-md shadow-red-900/20"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>

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

        <Button 
          onClick={handleExport}
          variant="outline"
          className="!py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm bg-[var(--color-card)]"
          title={t('correspondence.exportToCSV')}
        >
          <Download size={18} />
          {t('correspondence.export')}
        </Button>

        {userRole !== UserRole.VIEWER && (
          <Button 
            onClick={() => setShowAddModal(true)}
            className="!py-2.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
          >
            <Plus size={18} />
            {t('correspondence.addNew')}
          </Button>
        )}
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
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.date')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.recipient')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.subject')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.classification')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-start">{t('correspondence.sendingMethod')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-center">{t('correspondence.attachment')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] text-center">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-soft)]/50">
              {loading ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 w-12 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-20 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-28 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-40 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-5 w-16 animate-pulse bg-[var(--color-border-soft)]/50 rounded-lg" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-16 animate-pulse bg-[var(--color-border-soft)]/50 rounded" /></td>
                      <td className="px-6 py-4"><div className="h-8 w-8 animate-pulse bg-[var(--color-border-soft)]/50 rounded-xl mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-8 w-8 animate-pulse bg-[var(--color-border-soft)]/50 rounded-xl mx-auto" /></td>
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
                    {debouncedSearch ? (
                      <div className="flex flex-col items-center gap-3 text-center py-16">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)]/5 flex items-center justify-center">
                          <Search size={24} className="text-[var(--color-primary)]" />
                        </div>
                        <p className="text-base font-semibold text-[var(--color-text-main)]">{t('correspondence.noFilterResults')}</p>
                        <p className="text-sm text-[var(--color-text-muted)] max-w-sm">{t('correspondence.adjustFilters')}</p>
                        <Button variant="outline" onClick={() => setSearch('')}>
                          {t('correspondence.clearFilters')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-center py-16">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)]/5 flex items-center justify-center">
                          <Send size={24} className="text-[var(--color-primary)]" />
                        </div>
                        <p className="text-base font-semibold text-[var(--color-text-main)]">{t('correspondence.noOutgoingYet')}</p>
                        <p className="text-sm text-[var(--color-text-muted)] max-w-sm">{t('correspondence.outgoingDescription')}</p>
                        <Button onClick={() => setShowAddModal(true)}>
                          <Plus size={16} />
                          {t('correspondence.registerOutgoingLetter')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id} className="hover:bg-[var(--color-primary)]/5 transition-colors group cursor-pointer" onClick={() => onViewDetails('Outgoing', Number(item.id))}>
                  <td className="px-6 py-4 text-xs font-bold text-[var(--color-border-strong)] tracking-widest">{formatNumber(item.letter_number)}</td>
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
                      {userRole === UserRole.ADMIN && (
                        <>
                          <button className="p-2 bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)] hover:text-amber-500 rounded-xl shadow-sm transition-all" title={t('common.edit')}>
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className="p-2 bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border-soft)] hover:text-red-500 rounded-xl shadow-sm transition-all" 
                            onClick={() => handleDelete(Number(item.id))}
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
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('correspondence.registerOutgoingTitle')} size="md">
        <OutgoingForm 
          language={language} 
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

export default OutgoingRegister;
