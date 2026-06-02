import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, FileText } from 'lucide-react';
import { AuditFinding } from '../types';
import { RiskLevel } from '../constants';
import Badge from './Badge';
import InteractiveIcon from './InteractiveIcon';
import { useFormat } from '../services/formatService';

interface FindingCardProps {
  finding: AuditFinding;
  idx: number;
  isRTL: boolean;
  t: any;
  handleEdit: (finding: AuditFinding) => void;
  setActiveTab: (tab: string) => void;
}

const FindingCard: React.FC<FindingCardProps> = React.memo(({ 
  finding, 
  idx, 
  isRTL, 
  t, 
  handleEdit, 
  setActiveTab 
}) => {
  const { formatNumber } = useFormat();

  return (
    <motion.div 
      initial={{ opacity: 0, x: isRTL ? 50 : -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.1 }}
      className="glass-card overflow-hidden group hover:shadow-2xl hover:shadow-[var(--color-primary)]/10 transition-all duration-500"
    >
      <div className="p-10 border-b border-[var(--color-border-soft)] flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[var(--color-bg-main)]">
        <div className="flex items-center gap-6">
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-xl ${
            finding.risk_level === RiskLevel.HIGH ? 'bg-[var(--color-danger)] text-white shadow-[var(--color-danger)]/20' :
            finding.risk_level === RiskLevel.MEDIUM ? 'bg-[var(--color-warning)] text-white shadow-[var(--color-warning)]/20' : 'bg-[var(--color-primary)] text-white shadow-[var(--color-primary)]/20'
          }`}>
            <AlertTriangle size={32} />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h4 className="font-bold text-xl text-[var(--color-text-main)]">{t('findings.findingNumber')}{finding.finding_number || formatNumber(finding.id)}</h4>
              <Badge type="risk" value={finding.risk_level} />
            </div>
            <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
              {t('common.auditPlan')}: {finding.plan_code || formatNumber(finding.audit_id)} • {t('common.statusLabel')}: <Badge type="status" value={finding.status} className="ms-2" />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <InteractiveIcon 
            icon={FileText}
            onClick={() => handleEdit(finding)}
            tooltip={t('common.edit')}
            variant="solid"
            className="!p-3"
          />
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab('recommendations')}
            className="px-4 py-3 bg-[var(--color-card)] text-[var(--color-primary)] font-bold rounded-xl shadow-sm hover:bg-[var(--color-primary)] hover:text-white transition-all text-[10px] uppercase tracking-widest border border-[var(--color-border-soft)]"
          >
            {t('findings.viewRecommendations')}
          </motion.button>
        </div>
      </div>

      <div className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        {/* عنوان الملاحظة */}
        <div className="lg:col-span-4 space-y-3 bg-[var(--color-primary)]/5 p-6 rounded-xl border border-[var(--color-primary)]/20">
          <p className="text-[10px] text-[var(--color-primary)] uppercase font-bold tracking-[0.2em]">{t('findings.findingTitle')}</p>
          <p className="text-base font-bold text-[var(--color-text-main)]">{(finding as any).title || '—'}</p>
        </div>
        {/* نوع الملاحظة */}
        <div className="space-y-3">
          <p className="text-[10px] text-[var(--color-primary)] uppercase font-bold tracking-[0.2em]">{t('findings.findingType')}</p>
          <p className="text-sm text-[var(--color-text-main)] leading-relaxed font-medium">
            {(finding as any).finding_type === 'control_design_deficiency'
              ? t('findings.type.control_design_deficiency')
              : (finding as any).finding_type === 'operational_design_deficiency'
              ? t('findings.type.operational_design_deficiency')
              : (finding as any).finding_type || '—'}
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-[10px] text-[var(--color-primary)] uppercase font-bold tracking-[0.2em]">{t('findings.condition')}</p>
          <p className="text-sm text-[var(--color-text-main)] leading-relaxed font-medium">{finding.condition}</p>
        </div>
        <div className="space-y-3">
          <p className="text-[10px] text-[var(--color-primary)] uppercase font-bold tracking-[0.2em]">{t('findings.criteria')}</p>
          <p className="text-sm text-[var(--color-text-main)] leading-relaxed font-medium">{finding.criteria}</p>
        </div>
        <div className="space-y-3">
          <p className="text-[10px] text-[var(--color-primary)] uppercase font-bold tracking-[0.2em]">{t('findings.consequence')}</p>
          <p className="text-sm text-[var(--color-text-main)] leading-relaxed font-medium">{finding.consequence}</p>
        </div>
        <div className="lg:col-span-4 space-y-3 bg-[var(--color-success)]/5 p-6 rounded-xl border border-[var(--color-success)]/20">
          <p className="text-[10px] text-[var(--color-success)] uppercase font-bold tracking-[0.2em]">{t('findings.recommendation')}</p>
          <p className="text-sm text-[var(--color-success)] leading-relaxed font-bold">{finding.recommendation}</p>
        </div>
      </div>
    </motion.div>
  );
});

export default FindingCard;
