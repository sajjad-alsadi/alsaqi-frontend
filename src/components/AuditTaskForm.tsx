import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { AuditTask, AuditPlan } from '../types';
import { AuditType } from '../constants';
import api from '../services/api';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';

type TaskFormValues = {
  title: string;
  plan_id: string;
  audit_type: string;
  status: string;
  assigned_to?: string;
  audited_unit_id?: string;
  planned_hours?: string;
  period_from?: string;
  period_to?: string;
  due_date?: string;
};

interface AuditTaskFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  plans: AuditPlan[];
  initialData?: AuditTask | null;
}

const AuditTaskForm: React.FC<AuditTaskFormProps> = ({ onSuccess, onCancel, plans, initialData }) => {
  const { t } = useTranslation();
  
  const taskSchema = z.object({
    title: z.string().min(1, t('plan.fieldRequired')),
    plan_id: z.string().min(1, t('plan.fieldRequired')),
    audit_type: z.string().min(1, t('plan.fieldRequired')),
    status: z.string().min(1),
    assigned_to: z.string().optional(),
    audited_unit_id: z.string().optional(),
    planned_hours: z.string().optional(),
    period_from: z.string().optional(),
    period_to: z.string().optional(),
    due_date: z.string().optional(),
  });

  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    mode: 'onBlur',
    defaultValues: {
      title: '',
      plan_id: plans[0]?.id ? String(plans[0].id) : '',
      audit_type: AuditType.OPERATIONAL,
      status: 'draft',
      assigned_to: '',
      audited_unit_id: '',
      planned_hours: '',
      period_from: '',
      period_to: '',
      due_date: '',
    },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        title: initialData.title || '',
        plan_id: initialData.plan_id ? String(initialData.plan_id) : '',
        audit_type: initialData.audit_type || AuditType.OPERATIONAL,
        status: initialData.status || 'draft',
        assigned_to: initialData.assigned_to || '',
        audited_unit_id: initialData.audited_unit_id || '',
        planned_hours: initialData.planned_hours ? String(initialData.planned_hours) : '',
        period_from: initialData.period_from || '',
        period_to: initialData.period_to || '',
        due_date: initialData.due_date || '',
      });
    }
  }, [initialData, reset]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/users/list');
        if (res.data) {
          setUsers(Array.isArray(res.data) ? res.data : (res.data.data || []));
        }
      } catch (err) {
        console.error(err);
      }
    };

    const fetchDepartments = async () => {
      try {
        const res = await api.get('/departments');
        if (res.data) {
          setDepartments(Array.isArray(res.data) ? res.data : (res.data.data || []));
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchUsers();
    fetchDepartments();
  }, []);

  const onSubmit = async (data: TaskFormValues) => {
    try {
      const payload: any = {
        title: data.title,
        plan_id: data.plan_id,
        audit_type: data.audit_type,
        status: data.status,
      };

      if (data.assigned_to) payload.assigned_to = data.assigned_to;
      if (data.audited_unit_id) payload.audited_unit_id = data.audited_unit_id;
      if (data.planned_hours) payload.planned_hours = parseInt(data.planned_hours);
      if (data.period_from) payload.period_from = data.period_from;
      if (data.period_to) payload.period_to = data.period_to;
      if (data.due_date) payload.due_date = data.due_date;

      const url = initialData?.id 
        ? `/audit-tasks/${initialData.id}`
        : '/audit-tasks';
      
      if (initialData?.id) {
        await api.put(url, payload);
      } else {
        await api.post(url, payload);
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      const apiError = err.response?.data?.error;
      if (typeof apiError === 'string') {
        setError(apiError);
      } else if (apiError && typeof apiError === 'object') {
        setError(apiError.message || t('tasks.failedToSaveTask'));
      } else {
        setError(t('tasks.failedToSaveTask'));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/30 font-bold text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-8">
        <FormField label={t('tasks.taskTitle')} error={errors.title?.message} required>
          <Input {...register('title')} placeholder={t('tasks.taskTitlePlaceholder')} />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FormField label={t('common.auditPlan')} error={errors.plan_id?.message} required>
            <Select {...register('plan_id')}>
              <option value="">{t('tasks.selectAuditPlan')}</option>
              {Array.isArray(plans) && plans.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </Select>
          </FormField>

          <FormField label={t('tasks.auditType')} error={errors.audit_type?.message} required>
            <Select {...register('audit_type')}>
              <option value={AuditType.OPERATIONAL}>{t('auditTypes.operational')}</option>
              <option value={AuditType.FINANCIAL}>{t('auditTypes.financial')}</option>
              <option value={AuditType.COMPLIANCE}>{t('auditTypes.compliance')}</option>
              <option value={AuditType.IT}>{t('auditTypes.it')}</option>
              <option value={AuditType.AML}>{t('auditTypes.aml')}</option>
              <option value={AuditType.GOVERNANCE}>{t('auditTypes.governance')}</option>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FormField label={t('tasks.assignedTo')} error={errors.assigned_to?.message}>
            <Select {...register('assigned_to')}>
              <option value="">{t('tasks.selectAssignedTo')}</option>
              {Array.isArray(users) && users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.department || u.role})</option>
              ))}
            </Select>
          </FormField>

          <FormField label={t('tasks.auditedUnit')} error={errors.audited_unit_id?.message}>
            <Select {...register('audited_unit_id')}>
              <option value="">{t('tasks.selectAuditedUnit')}</option>
              {Array.isArray(departments) && departments.map(d => (
                <option key={d.id} value={d.id}>{d.name_ar || d.name}</option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FormField label={t('tasks.plannedHours')} error={errors.planned_hours?.message}>
            <Input type="number" min="0" {...register('planned_hours')} placeholder="0" />
          </FormField>

          <FormField label={t('tasks.periodFrom')} error={errors.period_from?.message}>
            <Input type="date" {...register('period_from')} />
          </FormField>

          <FormField label={t('tasks.periodTo')} error={errors.period_to?.message}>
            <Input type="date" {...register('period_to')} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FormField label={t('tasks.dueDate')} error={errors.due_date?.message}>
            <Input type="date" {...register('due_date')} />
          </FormField>

          <FormField label={t('common.statusLabel')} error={errors.status?.message} required>
            <Select {...register('status')}>
              <option value="draft">{t('plan.draft')}</option>
              <option value="in_progress">{t('plan.in_progress')}</option>
              <option value="review">{t('plan.review')}</option>
              <option value="approved">{t('plan.approved')}</option>
              <option value="completed">{t('plan.completed')}</option>
            </Select>
          </FormField>
        </div>
      </div>

      <div className="flex justify-end gap-6 pt-8 border-t border-[var(--color-border-soft)] dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-8 py-3 text-[var(--color-text-muted)] font-bold uppercase tracking-widest hover:bg-[var(--color-bg-soft)] rounded-xl transition-all"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary disabled:opacity-50"
        >
          {isSubmitting ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </form>
  );
};

export default AuditTaskForm;
