import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Edit, Copy, Trash2, Clock, Shield, ChevronRight } from 'lucide-react';
import { AuditProgram } from '../../types';
import { useTranslation } from 'react-i18next';
import { AuditStatus } from '../../constants';
import { useFormat } from '../../utils/formatService';

interface AuditProgramGridProps {
  programs: AuditProgram[];
  formatDate: (date: string) => string;
  onEdit: (program: AuditProgram) => void;
  onDuplicate: (id: string | number) => void;
  onDelete: (id: string | number) => void;
  onViewProcedures: (program: AuditProgram) => void;
}

const AuditProgramGrid: React.FC<AuditProgramGridProps> = ({
  programs,
  formatDate,
  onEdit,
  onDuplicate,
  onDelete,
  onViewProcedures
}) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { formatNumber } = useFormat();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
      <AnimatePresence mode="popLayout">
        {Array.isArray(programs) && programs.map((program, idx) => (
          <motion.div
            key={program.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card group hover:shadow-2xl hover:shadow-[var(--color-primary)]/10 transition-all duration-500 overflow-hidden flex flex-col"
          >
            <div className="p-8 space-y-6 flex-1">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1 rounded-full uppercase tracking-widest">
                    {program.program_code}
                  </span>
                  <h3 className="text-xl font-bold text-[var(--color-text-main)] leading-tight group-hover:text-[var(--color-primary)] transition-colors">
                    {program.program_title}
                  </h3>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  program.status === AuditStatus.APPROVED ? 'bg-emerald-100 text-emerald-600' :
                  program.status === AuditStatus.DRAFT ? 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                }`}>
                  {t(`plan.${program.status?.toLowerCase() || 'draft'}`)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--color-bg-soft)] rounded-2xl space-y-1">
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.department')}</span>
                  <p className="text-xs font-bold text-[var(--color-text-main)] truncate">
                    {program.department}
                  </p>
                </div>
                <div className="p-4 bg-[var(--color-bg-soft)] rounded-2xl space-y-1">
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.auditType')}</span>
                  <p className="text-xs font-bold text-[var(--color-text-main)]">
                    {t(`plan.${program.audit_type?.toLowerCase() || ''}`)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold text-[var(--color-text-muted)]">
                <div className="flex items-center gap-1">
                  <Clock size={14} />
                  {formatDate(program.created_at!)}
                </div>
                <div className="flex items-center gap-1">
                  <Shield size={14} />
                  v{formatNumber(program.version_number)}.0
                </div>
              </div>
            </div>

            <div className="p-6 bg-[var(--color-bg-soft)]/50 border-t border-[var(--color-border-soft)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => onEdit(program)}
                  className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-card)] rounded-xl transition-all"
                  title={t('program.edit')}
                >
                  <Edit size={18} />
                </button>
                <button 
                  onClick={() => onDuplicate(program.id!)}
                  className="p-2 text-[var(--color-text-muted)] hover:text-emerald-600 hover:bg-[var(--color-card)] rounded-xl transition-all"
                  title={t('program.duplicate')}
                >
                  <Copy size={18} />
                </button>
                <button 
                  onClick={() => onDelete(program.id!)}
                  className="p-2 text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-[var(--color-card)] rounded-xl transition-all"
                  title={t('program.delete')}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <button 
                onClick={() => onViewProcedures(program)}
                className="text-xs font-bold text-[var(--color-primary)] flex items-center gap-1 hover:gap-2 transition-all"
              >
                {t('program.viewProcedures')}
                <ChevronRight size={14} className={isRTL ? 'rotate-180' : ''} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default AuditProgramGrid;
