import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { CheckCircle2, Clock, AlertCircle, Edit, Trash2, Eye } from 'lucide-react';
import { AuditTask, AuditEvidence as AuditEvidenceType } from '../types';
import { useFormat } from '../services/formatService';
import { useAppContext } from '../context/AppContext';
import InteractiveIcon from './InteractiveIcon';

interface AuditTasksTableProps {
  tasks: AuditTask[];
  getPlanTitle: (planId: number | string) => string;
  getEvidence: (evidenceId?: number) => AuditEvidenceType | undefined;
  setPreviewItem: (item: AuditEvidenceType) => void;
  handleEdit: (task: AuditTask) => void;
  initiateDelete: (id: string | number) => void;
  updateStatus: (id: string | number, newStatus: string) => void;
}

const AuditTasksTable: React.FC<AuditTasksTableProps> = ({
  tasks,
  getPlanTitle,
  getEvidence,
  setPreviewItem,
  handleEdit,
  initiateDelete,
  updateStatus
}) => {
  const { t } = useTranslation();
  const { formatNumber, formatDate } = useFormat();
  const { user } = useAppContext();

  const userRole = user?.role as any;
  const canApprove = userRole === 'Manager';
  const canSubmit = userRole === 'Internal Auditor' || userRole === 'Auditor';
  const canTransitionToInProgress = canSubmit || canApprove;

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-start border-collapse">
        <thead>
          <tr className="bg-slate-50/50 border-b border-slate-100">
            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('tasks.taskNo')}</th>
            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.title')}</th>
            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.auditPlan')}</th>
            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('tasks.assignedTo')}</th>
            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-start">{t('common.statusLabel')}</th>
            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-end">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {tasks.map((task, idx) => {
            const evidence = getEvidence(task.evidence_id);
            return (
            <motion.tr 
              key={task.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="hover:bg-primary/5 transition-colors group cursor-pointer"
            >
              <td className="px-6 py-4 text-xs font-bold text-slate-300 tracking-widest">{task.task_number || `#${formatNumber(task.id)}`}</td>
              <td className="px-6 py-4 max-w-xs">
                <p className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors line-clamp-2">{task.title || task.procedure}</p>
              </td>
              <td className="px-6 py-4 text-sm font-bold text-slate-600">{getPlanTitle(task.plan_id || task.audit_id as any)}</td>
              <td className="px-6 py-4">
                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                  {task.assigned_to || task.responsible || '-'}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  task.status === 'completed' || task.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                  task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 
                  task.status === 'review' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {task.status === 'completed' || task.status === 'approved' ? <CheckCircle2 size={12} /> : 
                   task.status === 'in_progress' ? <Clock size={12} /> : <AlertCircle size={12} />}
                  {t(`plan.${task.status}`)}
                </span>
              </td>
              <td className="px-6 py-4 text-end">
                <div className="flex items-center justify-end gap-2">
                  {task.status === 'draft' && canTransitionToInProgress && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'in_progress'); }} className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                      {t('tasks.startTask')}
                    </button>
                  )}
                  {task.status === 'in_progress' && canSubmit && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'review'); }} className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded hover:bg-amber-100">
                      {t('tasks.submitForReview')}
                    </button>
                  )}
                  {task.status === 'review' && canApprove && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'approved'); }} className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100">
                        {t('tasks.approve')}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'in_progress'); }} className="text-[10px] uppercase font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded hover:bg-rose-100">
                        {t('tasks.reject')}
                      </button>
                    </>
                  )}
                  {task.status === 'approved' && canApprove && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'completed'); }} className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100">
                      {t('tasks.complete')}
                    </button>
                  )}

                  <InteractiveIcon 
                    icon={Edit}
                    onClick={() => handleEdit(task)}
                    tooltip={t('common.edit')}
                    variant="ghost"
                    size={16}
                    className="!p-2"
                  />
                  <InteractiveIcon 
                    icon={Trash2}
                    onClick={() => initiateDelete(task.id!)}
                    tooltip={t('common.delete')}
                    variant="danger"
                    size={16}
                    className="!p-2"
                  />
                </div>
              </td>
            </motion.tr>
          )})}
        </tbody>
      </table>
    </div>
  );
};

export default AuditTasksTable;
