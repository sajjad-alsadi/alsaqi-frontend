import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/Modal';
import { FraudCase } from '../types';

interface AddCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newCase: Partial<FraudCase>) => Promise<boolean>;
}

export const AddCaseModal: React.FC<AddCaseModalProps> = ({ isOpen, onClose, onAdd }) => {
  const { t } = useTranslation();
  const [newCase, setNewCase] = useState<Partial<FraudCase>>({
    riskCategory: 'Financial',
    status: 'Open'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onAdd(newCase);
    if (success) {
      onClose();
      setNewCase({ riskCategory: 'Financial', status: 'Open' });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('integrity.reportNewCase')}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('integrity.detectionDate')}</label>
            <input 
              type="date" 
              required
              className="input-field"
              value={newCase.detectionDate || ''}
              onChange={e => setNewCase({...newCase, detectionDate: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('integrity.detectionSource')}</label>
            <input 
              type="text" 
              required
              placeholder={t('integrity.detectionSource')}
              className="input-field"
              value={newCase.source || ''}
              onChange={e => setNewCase({...newCase, source: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('integrity.riskCategory')}</label>
            <select 
              className="input-field"
              value={newCase.riskCategory}
              onChange={e => setNewCase({...newCase, riskCategory: e.target.value as any})}
            >
              <option value="Financial">{t('integrity.financial')}</option>
              <option value="Operational">{t('integrity.operational')}</option>
              <option value="Compliance">{t('integrity.compliance')}</option>
              <option value="Reputational">{t('integrity.reputational')}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('integrity.financialImpact')}</label>
            <input 
              type="text" 
              placeholder={t('integrity.financialImpact')}
              className="input-field"
              value={newCase.financialImpact || ''}
              onChange={e => setNewCase({...newCase, financialImpact: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('common.description')}</label>
          <textarea 
            required
            rows={3}
            className="input-field"
            value={newCase.condition || ''}
            onChange={e => setNewCase({...newCase, condition: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('integrity.suspects')} ({t('integrity.fraudLabel')})</label>
          <input 
            type="text" 
            className="input-field border-rose-200 focus:border-rose-500 focus:ring-rose-200"
            placeholder={t('integrity.suspects')}
            value={newCase.suspects || ''}
            onChange={e => setNewCase({...newCase, suspects: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('integrity.correctiveActions')}</label>
          <textarea 
            rows={3}
            className="input-field"
            value={newCase.correctiveActions || ''}
            onChange={e => setNewCase({...newCase, correctiveActions: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{t('common.statusLabel')}</label>
          <select 
            className="input-field"
            value={newCase.status}
            onChange={e => setNewCase({...newCase, status: e.target.value as any})}
          >
            <option value="Open">{t('common.open')}</option>
            <option value="Under Investigation">{t('integrity.underInvestigation')}</option>
            <option value="Closed - Convicted">{t('integrity.closedConvicted')}</option>
            <option value="Closed - Insufficient Evidence">{t('integrity.closedInsufficientEvidence')}</option>
          </select>
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t border-[var(--color-border-soft)]">
          <button 
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            {t('common.cancel')}
          </button>
          <button 
            type="submit"
            className="btn-primary bg-rose-600 hover:bg-rose-700"
          >
            {t('integrity.saveCase')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
