import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuditTask, AuditPlan } from '../types';
import { AuditType } from '../constants';
import api from '../api/httpClient';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import logger from '../utils/logger';
import { Users } from 'lucide-react';

interface AuditTaskFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  plans: AuditPlan[];
  initialData?: AuditTask | null;
}

const AuditTaskForm: React.FC<AuditTaskFormProps> = ({ onSuccess, onCancel, plans, initialData }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<any[]>([]);
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected assignees (multi)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const [form, setForm] = useState({
    title: '',
    plan_id: '',
    audit_type: AuditType.OPERATIONAL,
    status: 'draft',
    audited_unit_id: '',
    planned_hours: '',
    period_from: '',
    period_to: '',
    due_date: '',
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        title: initialData.title || '',
        plan_id: initialData.plan_id ? String(initialData.plan_id) : '',
        audit_type: (initialData.audit_type as AuditType) || AuditType.OPERATIONAL,
        status: initialData.status || 'draft',
        audited_unit_id: initialData.audited_unit_id || '',
        planned_hours: initialData.planned_hours ? String(initialData.planned_hours) : '',
        period_from: initialData.period_from || '',
        period_to: initialData.period_to || '',
        due_date: initialData.due_date || '',
      });
      // If initialData has assigned_to (legacy single), or assigned_users
      const assignedArr = (initialData as any).assigned_users || [];
      if (assignedArr.length > 0) {
        setSelectedUsers(assignedArr);
      } else if (initialData.assigned_to) {
        setSelectedUsers([String(initialData.assigned_to)]);
      }
    }
  }, [initialData]);

  useEffect(() => {
    api.get('/users/list')
      .then(res => setUsers(Array.isArray(res.data) ? res.data : (res.data.data || [])))
      .catch(() => setUsers([]));
    api.get('/org-entities')
      .then(res => setOrgUnits(Array.isArray(res.data) ? res.data : (res.data.data || [])))
      .catch(() => setOrgUnits([]));
  }, []);

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title || !form.plan_id || !form.audit_type) {
      setError(t('plan.fieldRequired'));
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: any = {
        title: form.title,
        plan_id: form.plan_id,
        audit_type: form.audit_type,
        status: form.status,
      };
      if (form.audited_unit_id) payload.audited_unit_id = form.audited_unit_id;
      if (form.planned_hours) payload.planned_hours = parseInt(form.planned_hours);
      if (form.period_from) payload.period_from = form.period_from;
      if (form.period_to) payload.period_to = form.period_to;
      if (form.due_date) payload.due_date = form.due_date;
      // Single assigned_to for backward compat (first user)
      if (selectedUsers.length > 0) payload.assigned_to = selectedUsers[0];

      const url = initialData?.id ? `/audit-tasks/${initialData.id}` : '/audit-tasks';
      let taskId: string | number | undefined;
      if (initialData?.id) {
        await api.put(url, payload);
        taskId = initialData.id;
      } else {
        const res = await api.post(url, payload);
        taskId = res.data?.id;
      }

      // Assign additional users via the assign endpoint
      if (taskId && selectedUsers.length > 1) {
        await api.post(`/audit-tasks/${taskId}/assign`, { user_ids: selectedUsers }).catch(() => {});
      }

      onSuccess();
    } catch (err: any) {
      logger.error('Operation failed', err);
      const apiError = err.response?.data?.error;
      setError(typeof apiError === 'string' ? apiError : apiError?.message || t('tasks.failedToSaveTask'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/30 font-bold text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-8">
        {/* Title */}
        <FormField label={t('tasks.taskTitle')} required>
          <Input name="title" value={form.title} onChange={handleChange} placeholder={t('tasks.taskTitlePlaceholder')} />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Plan */}
          <FormField label={t('common.auditPlan')} required>
            <Select name="plan_id" value={form.plan_id} onChange={handleChange}>
              <option value="">{t('tasks.selectAuditPlan')}</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </FormField>

          {/* Audit Type */}
          <FormField label={t('tasks.auditType')} required>
            <Select name="audit_type" value={form.audit_type} onChange={handleChange}>
              <option value={AuditType.OPERATIONAL}>{t('auditTypes.operational')}</option>
              <option value={AuditType.FINANCIAL}>{t('auditTypes.financial')}</option>
              <option value={AuditType.COMPLIANCE}>{t('auditTypes.compliance')}</option>
              <option value={AuditType.IT}>{t('auditTypes.it')}</option>
              <option value={AuditType.AML}>{t('auditTypes.aml')}</option>
              <option value={AuditType.GOVERNANCE}>{t('auditTypes.governance')}</option>
            </Select>
          </FormField>
        </div>

        {/* Multi-Assignee */}
        <FormField label={t('tasks.assignUsers') || t('tasks.assignedTo')}>
          <div className="border border-[var(--color-border-soft)] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-[var(--color-bg-soft)] border-b border-[var(--color-border-soft)]">
              <Users size={16} className="text-[var(--color-primary)]" />
              <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
                {selectedUsers.length > 0 ? `${selectedUsers.length} ${t('tasks.selected') || 'محدد'}` : t('tasks.selectAssignedTo')}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {users.map(u => (
                <label
                  key={u.id}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Audited Unit */}
          <FormField label={t('tasks.auditedUnit')}>
            <Select name="audited_unit_id" value={form.audited_unit_id} onChange={handleChange}>
              <option value="">{t('tasks.selectAuditedUnit')}</option>
              {orgUnits.map(u => <option key={u.id} value={u.id}>{u.name_ar || u.name_en || u.name}</option>)}
            </Select>
          </FormField>

          {/* Planned Hours */}
          <FormField label={t('tasks.plannedHours')}>
            <Input type="number" min="0" name="planned_hours" value={form.planned_hours} onChange={handleChange} placeholder="0" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FormField label={t('tasks.periodFrom')}>
            <Input type="date" name="period_from" value={form.period_from} onChange={handleChange} />
          </FormField>
          <FormField label={t('tasks.periodTo')}>
            <Input type="date" name="period_to" value={form.period_to} onChange={handleChange} />
          </FormField>
          <FormField label={t('tasks.dueDate')}>
            <Input type="date" name="due_date" value={form.due_date} onChange={handleChange} />
          </FormField>
        </div>

        {/* Status */}
        <FormField label={t('common.statusLabel')} required>
          <Select name="status" value={form.status} onChange={handleChange}>
            <option value="draft">{t('plan.draft')}</option>
            <option value="in_progress">{t('plan.in_progress')}</option>
            <option value="review">{t('plan.review')}</option>
            <option value="approved">{t('plan.approved')}</option>
            <option value="completed">{t('plan.completed')}</option>
          </Select>
        </FormField>
      </div>

      <div className="flex justify-end gap-6 pt-8 border-t border-[var(--color-border-soft)] dark:border-slate-800">
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
