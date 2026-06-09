import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, FileText, ChevronDown, User } from 'lucide-react';
import { AuditFinding } from '../types';
import { RiskLevel } from '../constants';
import Badge from './Badge';
import InteractiveIcon from './InteractiveIcon';
import { useFormat } from '../utils/formatService';
import api from '../api/httpClient';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

interface FindingCardProps {
  finding: AuditFinding;
  idx: number;
  isRTL: boolean;
  t: any;
  handleEdit: (finding: AuditFinding) => void;
  setActiveTab: (tab: string) => void;
  onStatusChanged?: () => void;
}

// Allowed next statuses per current status
const NEXT_STATUSES: Record<string, string[]> = {
  'Open': ['In Progress'],
  'In Progress': ['Pending Approval', 'Closed'],
  'Pending Approval': ['Closed', 'In Progress'],
  'Closed': [],
};

const FindingCard: React.FC<FindingCardProps> = React.memo(({ 
  finding, 
  idx, 
  isRTL, 
  t, 
  handleEdit, 
  setActiveTab,
  onStatusChanged
}) => {
  const { formatNumber } = useFormat();
  const [changingStatus, setChangingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const nextStatuses = NEXT_STATUSES[(finding as any).status] || [];

  const handleStatusChange = async (newStatus: string) => {
    setShowStatusMenu(false);
    setChangingStatus(true);
    try {
      await api.patch(`/audit-findings/${finding.id}/status`, { status: newStatus });
      toast.success(t('common.statusUpdated') || 'تم تحديث الحالة');
      onStatusChanged?.();
    } catch (err: any) {
      logger.error('Status change failed', err);
      const msg = err.response?.data?.error?.message || err.response?.data?.error || t('errorOccurred');
      toast.error(typeof msg === 'string' ? msg : t('errorOccurred'));
    } finally {
      setChangingStatus(false);
    }
  };

  const statusLabel = (s: string) => {
    if (s === 'In Progress') return t('common.inProgress');
    if (s === 'Pending Approval') return t('planStatuses.pendingApproval');
    if (s === 'Closed') return t('common.closed');
    return t('common.open');
  };

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
            {/* اسم المدقق الكاتب */}
            {(finding as any).created_by_name && (
              <div className="flex items-center gap-1 mt-1">
                <User size={12} className="text-[var(--color-text-muted)]" />
                <span className="text-[10px] text-[var(--color-text-muted)] font-bold">
                  {t('findings.writtenBy') || 'كتبها'}: {(finding as any).created_by_name}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* زر تغيير الحالة */}
          {nextStatuses.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(v => !v)}
                disabled={changingStatus}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-bg-soft)] border border-[var(--color-border-soft)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 font-bold rounded-xl text-xs uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {changingStatus ? t('common.loading') : (t('findings.changeStatus') || 'تغيير الحالة')}
                <ChevronDown size={14} />
              </button>
              {showStatusMenu && (
                <div className="absolute top-full mt-1 end-0 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
                  {nextStatuses.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className="w-full text-start px-4 py-3 text-sm font-bold text-[var(--color-text-main)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors"
                    >
                      {statusLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
