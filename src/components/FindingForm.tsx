import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { AuditFinding, AuditPlan } from '../types';
import { AuditStatus, RiskLevel } from '../constants';
import CommentSection from './CommentSection';
import api from '../services/api';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { FormField } from './ui/FormField';

const findingSchema = z.object({
  audit_id: z.string().min(1, 'Field is required'),
  condition: z.string().min(1, 'Field is required'),
  criteria: z.string().min(1, 'Field is required'),
  cause: z.string().min(1, 'Field is required'),
  consequence: z.string().min(1, 'Field is required'),
  recommendation: z.string().min(1, 'Field is required'),
  risk_level: z.nativeEnum(RiskLevel),
  status: z.nativeEnum(AuditStatus),
});

type FindingFormValues = z.infer<typeof findingSchema>;

interface FindingFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: AuditFinding | null;
}

const FindingForm: React.FC<FindingFormProps> = ({ onSuccess, onCancel, initialData }) => {
  const { t, i18n } = useTranslation();
  const [plans, setPlans] = useState<AuditPlan[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FindingFormValues>({
    resolver: zodResolver(findingSchema) as any,
    defaultValues: {
      audit_id: '',
      condition: '',
      criteria: '',
      cause: '',
      consequence: '',
      recommendation: '',
      risk_level: RiskLevel.MEDIUM,
      status: AuditStatus.OPEN,
    },
  });

  const condition = watch('condition');
  const cause = watch('cause');
  const consequence = watch('consequence');

  useEffect(() => {
    if (initialData) {
      const sanitized = { ...initialData };
      Object.keys(sanitized).forEach((key) => {
        if (sanitized[key as keyof AuditFinding] === null) {
          (sanitized as any)[key] = '';
        }
      });
      reset(sanitized as any);
    }
  }, [initialData, reset]);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await api.get('/audit-plans');
      if (res.data) {
        setPlans(Array.isArray(res.data) ? res.data : (res.data.data || []));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const onSubmit = async (data: FindingFormValues) => {
    try {
      const url = initialData?.id ? `/audit-findings/${initialData.id}` : '/audit-findings';
      
      if (initialData?.id) {
        await api.put(url, data);
      } else {
        await api.post(url, data);
      }
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <FormField label={t('common.auditPlan')} error={errors.audit_id?.message} required className="md:col-span-2">
          <Select {...register('audit_id')}>
            <option value="">{t('plan.selectPlan')}</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('findings.condition')} error={errors.condition?.message} required className="md:col-span-2">
          <Textarea rows={3} {...register('condition')} />
        </FormField>

        <FormField label={t('findings.criteria')} error={errors.criteria?.message} required className="md:col-span-2">
          <Textarea rows={3} {...register('criteria')} />
        </FormField>

        <FormField label={t('findings.cause')} error={errors.cause?.message} required className="md:col-span-2">
          <Textarea rows={3} {...register('cause')} />
        </FormField>

        <FormField label={t('findings.consequence')} error={errors.consequence?.message} required className="md:col-span-2">
          <Textarea rows={3} {...register('consequence')} />
        </FormField>

        <FormField 
          label={t('findings.recommendation')}
          error={errors.recommendation?.message} 
          className="md:col-span-2"
          required
        >
          <Textarea rows={4} {...register('recommendation')} />
        </FormField>

        <FormField label={t('findings.riskLevel')} error={errors.risk_level?.message} required>
          <Select {...register('risk_level')}>
            {Object.values(RiskLevel).map((level) => (
              <option key={level} value={level}>{t('plan.' + level.toLowerCase())}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('common.statusLabel')} error={errors.status?.message} required>
          <Select {...register('status')}>
            <option value={AuditStatus.OPEN}>{t('common.open')}</option>
            <option value={AuditStatus.IN_PROGRESS}>{t('plan.in_progress')}</option>
            <option value={AuditStatus.CLOSED}>{t('common.closed')}</option>
          </Select>
        </FormField>
      </div>

      {initialData?.id && (
        <CommentSection relatedType="finding" relatedId={initialData.id} />
      )}

      <div className="flex justify-end gap-6 pt-8 border-t border-[var(--color-border-soft)] dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-8 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] font-bold uppercase tracking-widest hover:bg-[var(--color-bg-main)] dark:hover:bg-slate-800 rounded-xl transition-all"
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

export default FindingForm;

