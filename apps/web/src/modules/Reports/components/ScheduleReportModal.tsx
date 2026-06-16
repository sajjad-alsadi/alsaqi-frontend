import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/Modal';
import { ReportType } from '../types';

interface ScheduleReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportTypes: ReportType[];
  onSchedule: () => void;
}

const ScheduleReportModal: React.FC<ScheduleReportModalProps> = ({ isOpen, onClose, reportTypes, onSchedule }) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('reports.scheduleReport')}
    >
      <div className="space-y-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('reports.scheduleReportDesc')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.frequency')}</label>
            <select className="input-field w-full">
              <option value="daily">{t('reports.daily')}</option>
              <option value="weekly">{t('reports.weekly')}</option>
              <option value="monthly">{t('reports.monthly')}</option>
              <option value="quarterly">{t('reports.quarterly')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.reportType')}</label>
            <select className="input-field w-full">
              {reportTypes.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('reports.recipients')}</label>
          <input type="text" className="input-field w-full" placeholder={t('placeholders.emailRecipients')} />
        </div>
        <div className="flex justify-end gap-4 pt-4 border-t border-[var(--color-border-soft)]">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-2xl bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-bold hover:bg-[var(--color-border-soft)] transition-colors border border-[var(--color-border-soft)]"
          >
            {t('common.cancel')}
          </button>
          <button 
            onClick={onSchedule}
            className="px-6 py-3 rounded-2xl bg-[var(--color-primary)] text-white font-bold hover:bg-[var(--color-primary)]/90 transition-colors shadow-lg shadow-[var(--color-primary)]/30"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ScheduleReportModal;
