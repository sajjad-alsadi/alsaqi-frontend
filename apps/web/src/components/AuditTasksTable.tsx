import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { CheckCircle2, Clock, AlertCircle, Edit, Trash2, ClipboardList, RotateCcw } from 'lucide-react';
import { AuditTask, AuditEvidence as AuditEvidenceType } from '../types';
import { useFormat } from '../utils/formatService';
import { useUser } from '../context/UserContext';
import InteractiveIcon from './InteractiveIcon';
import { UserRole } from '../constants';

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
  const { user } = useUser();

  const userRole = user?.role as any;
  const canApprove = userRole === UserRole.MANAGER;
  const canSubmit = userRole === UserRole.INTERNAL_AUDITOR || userRole === 'Auditor';
  const canTransitionToInProgress = canSubmit || canApprove;

  const getTaskTypeLabel = (task: any) => {
    if (task.task_type === 'routine' || (!task.plan_id && !task.audit_id)) {
      return t('tasks.routineTask') || 'روتينية';
    }
    return t('tasks.auditPlanTask') || 'خطة تدقيق';
  };

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-start border-collapse">
        <thead>
          <tr className="bg-[var(--color-bg-soft)]/50 border-b border-[var(--color-border-soft)]">
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('tasks.taskNo')}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('common.title')}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('tasks.taskType') || 'نوع المهمة'}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('common.auditPlan')}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('tasks.auditType') || 'نوع التدقيق'}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('tasks.assignedTo')}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('tasks.dueDate') || 'تاريخ الاستحقاق'}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-start">{t('common.statusLabel')}</th>
            <th className="px-4 py-4 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.15em] text-end">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border-soft)]/50">
          {tasks.map((task, idx) => (
            <motion.tr 
              key={task.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="hover:bg-[var(--color-primary)]/5 transition-colors group cursor-pointer"
            >
              {/* Task Number */}
              <td className="px-4 py-4 text-xs font-bold text-[var(--color-border-strong)] tracking-widest whitespace-nowrap">
                {task.task_number || `#${formatNumber(task.id)}`}
              </td>

              {/* Title */}
              <td className="px-4 py-4 max-w-[200px]">
                <p className="text-sm font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-2">
                  {task.title || task.procedure}
                </p>
              </td>

              {/* Task Type */}
              <td className="px-4 py-4">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  (task as any).task_type === 'routine' || (!task.plan_id && !task.audit_id)
                    ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
                    : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                }`}>
                  {(task as any).task_type === 'routine' || (!task.plan_id && !task.audit_id) 
                    ? <RotateCcw size={10} /> 
                    : <ClipboardList size={10} />}
                  {getTaskTypeLabel(task)}
                </span>
              </td>

              {/* Audit Plan */}
              <td className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
                {task.plan_id || task.audit_id 
                  ? <span className="font-bold">{getPlanTitle(task.plan_id || task.audit_id as any)}</span>
                  : <span className="text-xs text-[var(--color-text-muted)]/60">-</span>
                }
              </td>

              {/* Audit Type */}
              <td className="px-4 py-4 text-xs font-bold text-[var(--color-text-muted)]">
                {task.audit_type ? t(`auditTypes.${task.audit_type.toLowerCase()}`) || task.audit_type : '-'}
              </td>

              {/* Assigned To (name) */}
              <td className="px-4 py-4">
                {(task as any).assigned_name ? (
                  <span className="bg-[var(--color-bg-main)] text-[var(--color-text-main)] px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap">
                    {(task as any).assigned_name}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)]">-</span>
                )}
              </td>

              {/* Due Date */}
              <td className="px-4 py-4 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                {task.due_date ? formatDate(task.due_date) : '-'}
              </td>

              {/* Status */}
              <td className="px-4 py-4">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${
                  task.status === 'completed' || task.status === 'approved' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                  task.status === 'in_progress' ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]' : 
                  task.status === 'review' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' :
                  'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]'
                }`}>
                  {task.status === 'completed' || task.status === 'approved' ? <CheckCircle2 size={12} /> : 
                   task.status === 'in_progress' ? <Clock size={12} /> : <AlertCircle size={12} />}
                  {t(`plan.${task.status?.toLowerCase() || ''}`)}
                </span>
              </td>

              {/* Actions */}
              <td className="px-4 py-4 text-end">
                <div className="flex items-center justify-end gap-1">
                  {task.status === 'draft' && canTransitionToInProgress && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'in_progress'); }} className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40">
                      {t('tasks.startTask')}
                    </button>
                  )}
                  {task.status === 'in_progress' && canSubmit && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'review'); }} className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40">
                      {t('tasks.submitForReview')}
                    </button>
                  )}
                  {task.status === 'review' && canApprove && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'approved'); }} className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40">
                        {t('tasks.approve')}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'in_progress'); }} className="text-[10px] uppercase font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40">
                        {t('tasks.reject')}
                      </button>
                    </>
                  )}
                  {task.status === 'approved' && canApprove && (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(task.id!, 'completed'); }} className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40">
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
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AuditTasksTable;
