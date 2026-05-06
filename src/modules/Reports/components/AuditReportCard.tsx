import React from 'react';
import { FileText, Download, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuditReport, ReportType } from '../types';
import { useFormat } from '../../../services/formatService';

interface AuditReportCardProps {
  report: AuditReport;
  reportTypes: ReportType[];
  onDownload: (report: AuditReport) => void;
  onDelete: (id: string | number) => void;
}

const AuditReportCard: React.FC<AuditReportCardProps> = ({
  report,
  reportTypes,
  onDownload,
  onDelete
}) => {
  const { t } = useTranslation();
  const { formatDate } = useFormat();

  return (
    <div className="glass-card p-6 flex flex-col justify-between group hover:border-[var(--color-primary)]/30 transition-all">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-[1.5rem] flex items-center justify-center text-[var(--color-primary)]">
            <FileText size={24} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="px-3 py-1 bg-[var(--color-bg-main)] rounded-full text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] border border-[var(--color-border-soft)]">
              {report.status}
            </span>
            {report.report_type && report.report_type !== 'auditReport' && (
              <span className="px-2 py-0.5 bg-[var(--color-primary)]/10 rounded-full text-[8px] font-bold text-[var(--color-primary)] uppercase tracking-tighter">
                {reportTypes.find(rt => rt.id === report.report_type)?.label}
              </span>
            )}
          </div>
        </div>
        <h3 className="text-lg font-bold text-[var(--color-text-main)] mb-2 line-clamp-2">{report.title}</h3>
        <p className="text-xs text-[var(--color-text-muted)] font-bold uppercase tracking-wider mb-4">
          {formatDate(report.date_generated)} • {report.generated_by}
        </p>
      </div>
      
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--color-border-soft)]">
        <button 
          onClick={() => onDownload(report)}
          className="flex-1 py-2 bg-[var(--color-bg-main)] hover:bg-[var(--color-border-soft)] rounded-[1.5rem] text-[var(--color-text-main)] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border border-[var(--color-border-soft)]"
        >
          <Download size={16} />
          {t('common.download')}
        </button>
        <button 
          onClick={() => onDelete(report.id!)}
          className="p-2 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-[1.5rem] transition-colors"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

export default AuditReportCard;
