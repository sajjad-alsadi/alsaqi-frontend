import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../../services/formatService';
import { ExecData } from '../types';

interface KPICardsProps {
  execData: ExecData;
  onCardClick: (tab: 'audit' | 'executive', filter: string, value: string) => void;
}

const KPICards: React.FC<KPICardsProps> = ({ execData, onCardClick }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <motion.div 
        whileHover={{ y: -5 }}
        className="glass-card p-6 flex items-center gap-6 cursor-pointer"
        onClick={() => onCardClick('audit', 'status', 'Closed')}
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
          <BarChart3 size={32} />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('reports.totalAudits')}</p>
          <p className="text-4xl font-bold text-[var(--color-text-main)] mt-1">{formatNumber(execData.totalAudits)}</p>
        </div>
      </motion.div>

      <motion.div 
        whileHover={{ y: -5 }}
        className="glass-card p-6 flex items-center gap-6 cursor-pointer"
        onClick={() => onCardClick('audit', 'status', 'Final')}
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-success)]/10 text-[var(--color-success)] flex items-center justify-center shrink-0">
          <CheckCircle2 size={32} />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('reports.completedAudits')}</p>
          <p className="text-4xl font-bold text-[var(--color-text-main)] mt-1">{formatNumber(execData.completedAudits)}</p>
        </div>
      </motion.div>

      <motion.div 
        whileHover={{ y: -5 }}
        className="glass-card p-6 flex items-center gap-6 cursor-pointer"
        onClick={() => onCardClick('audit', 'risk', 'High')}
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-danger)]/10 text-[var(--color-danger)] flex items-center justify-center shrink-0">
          <AlertTriangle size={32} />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('reports.highRiskFindings')}</p>
          <p className="text-4xl font-bold text-[var(--color-text-main)] mt-1">{formatNumber(execData.highRiskFindings)}</p>
        </div>
      </motion.div>
    </div>
  );
};

export default KPICards;
