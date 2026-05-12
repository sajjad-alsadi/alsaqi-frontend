import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../services/formatService';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  totalItems: number;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems,
}) => {
  const { t, i18n } = useTranslation();
  const { formatNumber } = useFormat();
  const isRtl = i18n.language === 'ar';
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-[var(--color-card)]/50 backdrop-blur-md border-t border-[var(--color-border-soft)] rounded-b-[1.5rem]">
      <div className="flex items-center gap-2 order-2 sm:order-1">
        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">
          {t('common.pagination.showing')} <span className="text-[var(--color-text-main)] font-bold">{formatNumber(startItem)}</span> {t('common.pagination.to')} <span className="text-[var(--color-text-main)] font-bold">{formatNumber(endItem)}</span> {t('common.pagination.of')} <span className="text-[var(--color-text-main)] font-bold">{formatNumber(totalItems)}</span> {totalItems === 1 ? t('common.pagination.result') : t('common.pagination.results')}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-6 order-1 sm:order-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('common.pagination.pageSizeLabel')}</span>
          <div className="relative group">
            <div className={`absolute inset-0 flex items-center ${isRtl ? 'pr-4' : 'pl-4'} pointer-events-none text-[var(--color-text-main)] text-xs font-bold`}>
              {formatNumber(pageSize)}
            </div>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="appearance-none bg-[var(--color-card)] border border-[var(--color-border-soft)] text-transparent text-xs font-bold rounded-xl py-1.5 ps-4 pe-8 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all cursor-pointer hover:border-[var(--color-primary)]/50"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size} className="text-[var(--color-text-main)]">
                  {formatNumber(size)}
                </option>
              ))}
            </select>
            <div className={`absolute inset-y-0 ${isRtl ? 'left-2' : 'right-2'} flex items-center pointer-events-none text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors`}>
              <ChevronRight size={14} className="rotate-90" />
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 p-1 bg-[var(--color-bg-soft)]/50 rounded-2xl border border-[var(--color-border-soft)]" aria-label="Pagination">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-primary)] hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            title={t('common.pagination.first')}
          >
            {isRtl ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-primary)] hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            title={t('common.pagination.previous')}
          >
            {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          
          <div className="px-4 py-1.5 bg-[var(--color-card)] shadow-sm border border-[var(--color-border-soft)] rounded-xl flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-primary)]">{formatNumber(currentPage)}</span>
            <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-widest">{t('common.pagination.of')}</span>
            <span className="text-xs font-bold text-[var(--color-text-main)]">{formatNumber(totalPages)}</span>
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-primary)] hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            title={t('common.pagination.next')}
          >
            {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-primary)] hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            title={t('common.pagination.last')}
          >
            {isRtl ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
          </button>
        </nav>
      </div>
    </div>
  );
};

export default Pagination;
