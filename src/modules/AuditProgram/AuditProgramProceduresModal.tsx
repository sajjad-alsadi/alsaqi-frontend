import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download } from 'lucide-react';
import { AuditProgram, AuditProcedure } from '../../types';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../services/formatService';

interface AuditProgramProceduresModalProps {
  isOpen: boolean;
  program: AuditProgram | null;
  procedures: AuditProcedure[];
  onClose: () => void;
}

const AuditProgramProceduresModal: React.FC<AuditProgramProceduresModalProps> = ({
  isOpen,
  program,
  procedures,
  onClose
}) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { formatNumber } = useFormat();

  if (!isOpen || !program) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-800">{program.program_title}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {t('program.standardizedAuditProcedures')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <X size={24} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-50 rounded-3xl space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('program.auditObjective')}</span>
              <p className="text-sm font-bold text-slate-700 leading-relaxed">{program.audit_objective}</p>
            </div>
            <div className="p-6 bg-slate-50 rounded-3xl space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('program.auditScope')}</span>
              <p className="text-sm font-bold text-slate-700 leading-relaxed">{program.audit_scope}</p>
            </div>
            <div className="p-6 bg-slate-50 rounded-3xl space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('program.keyRisks')}</span>
              <p className="text-sm font-bold text-slate-700 leading-relaxed">{program.key_risks}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-lg font-black text-slate-800 px-2">{t('program.proceduresList')}</h4>
            <div className="overflow-hidden border border-slate-100 rounded-3xl">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-16">{t('program.procedureNumber')}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-start">{t('program.auditStep')}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-start">{t('program.testType')}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-start">{t('program.expectedEvidence')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {Array.isArray(procedures) && procedures.map(proc => (
                    <tr key={proc.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-black text-primary text-center">{formatNumber(proc.procedure_number)}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-700">{proc.audit_step}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{proc.audit_test_description}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          {t(`program.${proc.control_test_type?.toLowerCase() || ''}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{proc.expected_evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-4">
          <button className="btn-primary bg-white !text-slate-600 border border-slate-200 hover:bg-slate-100 flex items-center gap-2">
            <Download size={18} />
            {t('program.exportAsChecklist')}
          </button>
          <button onClick={onClose} className="btn-primary">
            {t('common.close')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AuditProgramProceduresModal;
