import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { AuditTask, AuditPlan } from '../types';
import { AuditStatus } from '../constants';
import api from '../services/api';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { FormField } from './ui/FormField';

type TaskFormValues = {
  audit_id: string;
  procedure: string;
  responsible: string;
  status: AuditStatus;
  evidence_id?: string;
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
    audit_id: z.string().min(1, t('plan.fieldRequired')),
    procedure: z.string().min(1, t('plan.fieldRequired')),
    responsible: z.string().min(1, t('tasks.responsibleRequired')),
    status: z.nativeEnum(AuditStatus),
    evidence_id: z.string().optional(),
  });

  const [users, setUsers] = useState<any[]>([]);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    mode: 'onBlur',
    defaultValues: {
      audit_id: plans[0]?.id ? String(plans[0].id) : '',
      procedure: '',
      responsible: '',
      status: AuditStatus.OPEN,
    },
  });

  const responsibleValue = watch('responsible');

  useEffect(() => {
    if (initialData) {
      const sanitized = { ...initialData };
      Object.keys(sanitized).forEach((key) => {
        if (sanitized[key as keyof AuditTask] === null) {
          (sanitized as any)[key] = '';
        }
      });
      reset(sanitized as any);
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

    const fetchEvidence = async () => {
      try {
        const res = await api.get('/audit-evidence');
        if (res.data) {
          setEvidenceList(Array.isArray(res.data) ? res.data : (res.data.data || []));
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchUsers();
    fetchEvidence();
  }, []);

  const onSubmit = async (data: TaskFormValues) => {
    try {
      const url = initialData?.id 
        ? `/audit-tasks/${initialData.id}`
        : '/audit-tasks';
      
      if (initialData?.id) {
        await api.put(url, data);
      } else {
        await api.post(url, data);
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || t('tasks.failedToSaveTask'));
    }
  };

  const handleAddResponsible = (name: string) => {
    if (!name) return;
    const current = responsibleValue ? responsibleValue.split(', ').filter(Boolean) : [];
    if (!current.includes(name)) {
      setValue('responsible', [...current, name].join(', '), { shouldValidate: true });
    }
  };

  const handleRemoveResponsible = (name: string) => {
    const current = responsibleValue ? responsibleValue.split(', ').filter(Boolean) : [];
    const updated = current.filter(n => n !== name).join(', ');
    setValue('responsible', updated, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/30 font-bold text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-8">
        <FormField label={t('common.auditPlan')} error={errors.audit_id?.message} required>
          <Select {...register('audit_id')}>
            <option value="">{t('tasks.selectAuditPlan')}</option>
            {Array.isArray(plans) && plans.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('tasks.procedure')} error={errors.procedure?.message} required>
          <Textarea rows={4} {...register('procedure')} />
        </FormField>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FormField label={t('tasks.responsible')} error={errors.responsible?.message} required>
            <div className="space-y-3">
              <Select
                value=""
                onChange={(e) => handleAddResponsible(e.target.value)}
              >
                <option value="">{t('tasks.selectResponsible')}</option>
                {Array.isArray(users) && users.map(u => {
                  const current = responsibleValue ? responsibleValue.split(', ').filter(Boolean) : [];
                  if (current.includes(u.name)) return null;
                  return <option key={u.id} value={u.name}>{u.name} ({u.department})</option>;
                })}
              </Select>
              
              {responsibleValue && (
                <div className="flex flex-wrap gap-2">
                  {responsibleValue.split(', ').filter(Boolean).map(name => (
                    <span key={name} className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2">
                      {name}
                      <button 
                        type="button" 
                        className="hover:text-rose-500 transition-colors"
                        onClick={() => handleRemoveResponsible(name)}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </FormField>

          <FormField label={t('common.statusLabel')} error={errors.status?.message} required>
            <Select {...register('status')}>
              <option value={AuditStatus.OPEN}>{t('common.open')}</option>
              <option value={AuditStatus.IN_PROGRESS}>{t('plan.in_progress')}</option>
              <option value={AuditStatus.COMPLETED}>{t('plan.completed')}</option>
            </Select>
          </FormField>
        </div>

        <FormField label={t('tasks.evidence')} error={errors.evidence_id?.message}>
          <Select {...register('evidence_id')}>
            <option value="">{t('tasks.selectEvidence')}</option>
            {Array.isArray(evidenceList) && evidenceList.map(e => (
              <option key={e.id} value={e.id}>{e.description || e.file_name || `${t('tasks.evidence')} #${e.id}`}</option>
            ))}
          </Select>
        </FormField>
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
