import React from 'react';
import { CheckSquare, Square, Eye, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/Modal';
import { AuditPlan, AuditFinding, ReportType } from '../types';

interface ReportFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportTypes: ReportType[];
  selectedReportType: string;
  onReportTypeSelect: (typeId: string) => void;
  audits: AuditPlan[];
  selectedAuditId: string | number | null;
  onAuditSelect: (auditId: string | number) => void;
  reportTitle: string;
  setReportTitle: (title: string) => void;
  reportSummary: string;
  setReportSummary: (summary: string) => void;
  findings: AuditFinding[];
  selectedFindings: (string | number)[];
  onToggleFinding: (id: string | number) => void;
  onPreview: () => void;
  onSave: () => void;
}

const ReportFormModal: React.FC<ReportFormModalProps> = ({
  isOpen,
  onClose,
  reportTypes,
  selectedReportType,
  onReportTypeSelect,
  audits,
  selectedAuditId,
  onAuditSelect,
  reportTitle,
  setReportTitle,
  reportSummary,
  setReportSummary,
  findings,
  selectedFindings,
  onToggleFinding,
  onPreview,
  onSave
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('reports.generateAuditReport')}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.reportType')}</label>
            <select 
              className="input-field w-full"
              onChange={(e) => onReportTypeSelect(e.target.value)}
              value={selectedReportType}
            >
              {reportTypes.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.selectAuditPlan')} {selectedReportType === 'auditReport' ? '' : `(${t('reports.optional')})`}</label>
            <select 
              className="input-field w-full"
              onChange={(e) => onAuditSelect(e.target.value)}
              value={selectedAuditId || ''}
            >
              <option value="">-- {t('reports.selectAuditPlan')} --</option>
              {(Array.isArray(audits) ? audits : []).map(audit => (
                <option key={audit.id} value={audit.id}>{audit.title}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedReportType && (
          <>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.reportTitle')}</label>
              <input 
                type="text" 
                className="input-field w-full"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder={t('reports.reportTitle')}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.executiveSummary')}</label>
              <textarea 
                className="input-field w-full min-h-[120px] py-3 resize-none"
                value={reportSummary}
                onChange={(e) => setReportSummary(e.target.value)}
                placeholder={t('reports.executiveSummaryPlaceholder')}
              />
            </div>

            {selectedAuditId && (
              <div>
                <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.includeFindings')}</label>
                <div className="border border-[var(--color-border-soft)] rounded-xl max-h-60 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                  {(!Array.isArray(findings) || findings.length === 0) ? (
                    <p className="text-[var(--color-text-muted)] text-sm p-4 text-center">{t('reports.noFindingsForThisAudit')}</p>
                  ) : (
                    findings.map(finding => (
                      <div 
                        key={finding.id} 
                        className="flex items-start gap-3 p-3 hover:bg-[var(--color-bg-main)] rounded-xl cursor-pointer transition-colors"
                        onClick={() => onToggleFinding(finding.id!)}
                      >
                        <div className={`mt-1 ${selectedFindings.includes(finding.id!) ? 'text-[var(--color-primary)]' : 'text-[var(--color-border-soft)]'}`}>
                          {selectedFindings.includes(finding.id!) ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--color-text-main)]">{finding.condition}</p>
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mt-1 inline-block ${
                            finding.risk_level === 'High' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' :
                            finding.risk_level === 'Medium' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' :
                            'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          }`}>
                            {t(`plan.${finding.risk_level.toLowerCase()}`)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-4 pt-4 border-t border-[var(--color-border-soft)]">
              <button 
                onClick={onClose}
                className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={onPreview}
                className="px-6 py-3 rounded-2xl bg-[var(--color-card)] border-2 border-[var(--color-border-soft)] text-[var(--color-text-main)] font-bold hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors flex items-center gap-2"
              >
                <Eye size={18} />
                {t('common.preview')}
              </button>
              <button 
                onClick={onSave}
                className="px-6 py-3 rounded-2xl bg-[var(--color-primary)] text-white font-bold hover:bg-[var(--color-primary)]/90 transition-colors shadow-lg shadow-[var(--color-primary)]/30 flex items-center gap-2"
              >
                <Download size={18} />
                {t('common.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ReportFormModal;
