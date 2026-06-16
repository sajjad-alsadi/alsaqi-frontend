import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { AuditTask, AuditPlan } from '../types';
import { AuditType } from '../constants';
import api from '../api/httpClient';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import logger from '../utils/logger';
import { Users } from 'lucide-react';

interface AuditTaskFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  plans: AuditPlan[];
  initialData?: AuditTask | null;
}

type TaskType = 'audit_plan' | 'routine';

/** Option shape for the assignable-user picker (subset of the user record). */
interface AssignableUser {
  id: number | string;
  name: string;
  department?: string;
  role?: string;
}

/** Option shape for the audited-unit picker (subset of the org-entity record). */
interface OrgUnitOption {
  id: number | string;
  name?: string;
  name_ar?: string;
  name_en?: string | null;
}

/** Request body sent to the audit-task create/update endpoints. */
interface AuditTaskPayload {
  title: string;
  audit_type: string;
  status: string;
  plan_id?: string;
  audited_unit_id?: string;
  planned_hours?: number;
  period_from?: string;
  period_to?: string;
  due_date?: string;
  assigned_to?: string;
}

const AuditTaskForm: React.FC<AuditTaskFormProps> = ({ onSuccess, onCancel, plans, initialData }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Task type: routine or audit_plan
  const [taskType, setTaskType] = useState<TaskType>('audit_plan');

  const [form, setForm] = useState({
    title: '',
    plan_id: '',
    audit_type: AuditType.OPERATIONAL as string,
    status: 'draft',
    audited_unit_id: '',
    planned_hours: '',
    period_from: '',
    period_to: '',
    due_date: '',
  });

  useEffect(() => {
    if (initialData) {
      const toDateInput = (val?: string) => val ? val.substring(0, 10) : '';

      // Determine task type based on whether it has a plan_id
      if (initialData.plan_id) {
        setTaskType('audit_plan');
      } else {
        setTaskType('routine');
      }

      setForm({
        title: initialData.title || '',
        plan_id: initialData.plan_id ? String(initialData.plan_id) : '',
        audit_type: initialData.audit_type || AuditType.OPERATIONAL,
        status: initialData.status || 'draft',
        audited_unit_id: initialData.audited_unit_id ? String(initialData.audited_unit_id) : '',
        planned_hours: initialData.planned_hours ? String(initialData.planned_hours) : '',
        period_from: toDateInput(initialData.period_from),
        period_to: toDateInput(initialData.period_to),
        due_date: toDateInput(initialData.due_date),
      });

      const assignedArr =
        (initialData as AuditTask & { assigned_users?: Array<string | number> }).assigned_users || [];
      if (assignedArr.length > 0) {
        setSelectedUsers(assignedArr.map(String));
      } else if (initialData.assigned_to) {
        setSelectedUsers([String(initialData.assigned_to)]);
      }
    }
  }, [initialData]);

  useEffect(() => {
    api.get('/users/list')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        setUsers(data);
      })
      .catch(() => setUsers([]));
    api.get('/org-entities')
      .then(res => setOrgUnits(Array.isArray(res.data) ? res.data : (res.data?.data || [])))
      .catch(() => setOrgUnits([]));
  }, []);

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.title) {
      setError(t('plan.fieldRequired'));
      return;
    }
    if (taskType === 'audit_plan' && !form.plan_id) {
      setError(t('plan.fieldRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: AuditTaskPayload = {
        title: form.title,
        audit_type: form.audit_type,
        status: form.status,
      };

      // Only include plan_id for audit_plan tasks
      if (taskType === 'audit_plan' && form.plan_id) {
        payload.plan_id = form.plan_id;
      }

      if (form.audited_unit_id) payload.audited_unit_id = form.audited_unit_id;
      if (form.planned_hours) payload.planned_hours = parseInt(form.planned_hours);
      if (form.period_from) payload.period_from = form.period_from;
      if (form.period_to) payload.period_to = form.period_to;
      if (form.due_date) payload.due_date = form.due_date;
      const firstAssignee = selectedUsers[0];
      if (firstAssignee) payload.assigned_to = firstAssignee;

      const url = initialData?.id ? `/audit-tasks/${initialData.id}` : '/audit-tasks';
      let taskId: string | number | undefined;
      if (initialData?.id) {
        await api.put(url, payload);
        taskId = initialData.id;
      } else {
        const res = await api.post(url, payload);
        taskId = res.data?.id;
      }

      if (taskId && selectedUsers.length > 1) {
        await api.post(`/audit-tasks/${taskId}/assign`, { user_ids: selectedUsers }).catch(() => {});
      }

      onSuccess();
    } catch (err: unknown) {
      logger.error('Operation failed', err);
      const apiError = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string | { message?: string } } | undefined)?.error
        : undefined;
      setError(typeof apiError === 'string' ? apiError : apiError?.message || t('tasks.failedToSaveTask'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectClass = "flex w-full px-6 py-4 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-2xl focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)] outline-none transition-all text-[var(--color-text-main)] shadow-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/30 font-bold text-sm">
          {error}
        </div>
      )}

      {/* Title */}
      <FormField label={t('tasks.taskTitle')} required>
        <Input
          name="title"
          value={form.title}
          onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
          placeholder={t('tasks.taskTitlePlaceholder')}
        />
      </FormField>

      {/* Task Type (new field) */}
      <FormField label={t('tasks.taskType') || 'نوع المهمة'} required>
        <select
          value={taskType}
          onChange={(e) => {
            setTaskType(e.target.value as TaskType);
            if (e.target.value === 'routine') {
              setForm(prev => ({ ...prev, plan_id: '' }));
            }
          }}
          className={selectClass}
        >
          <option value="audit_plan">{t('tasks.auditPlanTask') || 'مهمة خطة تدقيق'}</option>
          <option value="routine">{t('tasks.routineTask') || 'مهمة روتينية'}</option>
        </select>
      </FormField>

      {/* Audit Plan - only shown when taskType is audit_plan */}
      {taskType === 'audit_plan' && (
        <FormField label={t('common.auditPlan')} required>
          <select
            value={form.plan_id}
            onChange={(e) => setForm(prev => ({ ...prev, plan_id: e.target.value }))}
            className={selectClass}
          >
            <option value="">{t('tasks.selectAuditPlan')}</option>
            {plans.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {p.plan_code ? `${p.plan_code} - ` : ''}{p.title}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Audit Type */}
        <FormField label={t('tasks.auditType')} required>
          <select
            value={form.audit_type}
            onChange={(e) => setForm(prev => ({ ...prev, audit_type: e.target.value }))}
            className={selectClass}
          >
            <option value={AuditType.OPERATIONAL}>{t('auditTypes.operational')}</option>
            <option value={AuditType.FINANCIAL}>{t('auditTypes.financial')}</option>
            <option value={AuditType.COMPLIANCE}>{t('auditTypes.compliance')}</option>
            <option value={AuditType.IT}>{t('auditTypes.it')}</option>
            <option value={AuditType.AML}>{t('auditTypes.aml')}</option>
            <option value={AuditType.GOVERNANCE}>{t('auditTypes.governance')}</option>
          </select>
        </FormField>

        {/* Audited Unit */}
        <FormField label={t('tasks.auditedUnit')}>
          <select
            value={form.audited_unit_id}
            onChange={(e) => setForm(prev => ({ ...prev, audited_unit_id: e.target.value }))}
            className={selectClass}
          >
            <option value="">{t('tasks.selectAuditedUnit')}</option>
            {orgUnits.map((u) => (
              <option key={String(u.id)} value={String(u.id)}>{u.name_ar || u.name_en || u.name}</option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Multi-Assignee */}
      <FormField label={t('tasks.assignUsers') || 'المكلفون بالمهمة'}>
        <div className="border border-[var(--color-border-soft)] rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
            <Users size={16} className="text-[var(--color-primary)]" />
            <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
              {selectedUsers.length > 0 ? `${selectedUsers.length} ${t('tasks.selected') || 'محدد'}` : t('tasks.selectAssignedTo') || 'اختر المكلفين'}
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {users.length === 0 && (
              <p className="text-center text-sm text-[var(--color-text-muted)] py-4">{t('common.loading') || 'جارٍ التحميل...'}</p>
            )}
            {users.map((u) => (
              <label
                key={String(u.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[var(--color-primary)]/5 ${selectedUsers.includes(String(u.id)) ? 'bg-[var(--color-primary)]/10' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(String(u.id))}
                  onChange={() => toggleUser(String(u.id))}
                  className="w-4 h-4 accent-[var(--color-primary)]"
                />
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{u.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{u.department || u.role}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </FormField>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Planned Hours */}
        <FormField label={t('tasks.plannedHours')}>
          <Input
            type="number"
            min="0"
            value={form.planned_hours}
            onChange={(e) => setForm(prev => ({ ...prev, planned_hours: e.target.value }))}
            placeholder="0"
          />
        </FormField>

        {/* Status */}
        <FormField label={t('common.statusLabel')} required>
          <select
            value={form.status}
            onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))}
            className={selectClass}
          >
            <option value="draft">{t('plan.draft')}</option>
            <option value="in_progress">{t('plan.in_progress')}</option>
            <option value="review">{t('plan.review')}</option>
            <option value="approved">{t('plan.approved')}</option>
            <option value="completed">{t('plan.completed')}</option>
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormField label={t('tasks.periodFrom')}>
          <Input
            type="date"
            value={form.period_from}
            onChange={(e) => setForm(prev => ({ ...prev, period_from: e.target.value }))}
          />
        </FormField>
        <FormField label={t('tasks.periodTo')}>
          <Input
            type="date"
            value={form.period_to}
            onChange={(e) => setForm(prev => ({ ...prev, period_to: e.target.value }))}
          />
        </FormField>
        <FormField label={t('tasks.dueDate')}>
          <Input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm(prev => ({ ...prev, due_date: e.target.value }))}
          />
        </FormField>
      </div>

      <div className="flex justify-end gap-6 pt-8 border-t border-[var(--color-border-soft)]">
        <button type="button" onClick={onCancel}
          className="px-8 py-3 text-[var(--color-text-muted)] font-bold uppercase tracking-widest hover:bg-[var(--color-bg-soft)] rounded-xl transition-all">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-50">
          {isSubmitting ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </form>
  );
};

export default AuditTaskForm;
