import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { AuditFinding, AuditPlan } from '../types';
import { AuditStatus, RiskLevel } from '../constants';
import CommentSection from './CommentSection';
import api from '../api/httpClient';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { FormField } from './ui/FormField';
import logger from '../utils/logger';
import { Button } from '@/components/ui/button';

interface FindingFormValues {
  audit_id: string;
  title: string;
  finding_type: 'control_design_deficiency' | 'operational_design_deficiency';
  condition: string;
  criteria: string;
  consequence: string;
  recommendation: string;
  risk_level: RiskLevel;
  status: AuditStatus;
}

interface FindingFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: AuditFinding | null;
}

const FindingForm: React.FC<FindingFormProps> = ({ onSuccess, onCancel, initialData }) => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validation schema is defined inside the component so messages are localized via t(...)
  const findingSchema = useMemo(
    () =>
      z.object({
        audit_id: z.string().min(1, t('findings.fieldRequired')),
        title: z.string().min(1, t('findings.fieldRequired')),
        finding_type: z.enum(['control_design_deficiency', 'operational_design_deficiency']),
        condition: z.string().min(1, t('findings.fieldRequired')),
        criteria: z.string().min(1, t('findings.fieldRequired')),
        consequence: z.string().min(1, t('findings.fieldRequired')),
        recommendation: z.string().min(1, t('findings.fieldRequired')),
        risk_level: z.nativeEnum(RiskLevel),
        status: z.nativeEnum(AuditStatus),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FindingFormValues>({
    resolver: zodResolver(findingSchema),
    mode: 'onBlur',
    defaultValues: {
      audit_id: '',
      title: '',
      finding_type: 'control_design_deficiency' as const,
      condition: '',
      criteria: '',
      consequence: '',
      recommendation: '',
      risk_level: RiskLevel.MEDIUM,
      status: AuditStatus.OPEN,
    },
  });

  useEffect(() => {
    if (initialData) {
      const sanitized = Object.fromEntries(
        Object.entries(initialData).map(([key, value]) => [key, value === null ? '' : value]),
      ) as Partial<FindingFormValues>;
      reset(sanitized);
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
      logger.error('Operation failed', err);
    }
  };

  const onSubmit = async (data: FindingFormValues) => {
    setSubmitError(null);
    try {
      const url = initialData?.id ? `/audit-findings/${initialData.id}` : '/audit-findings';

      if (initialData?.id) {
        await api.put(url, data);
      } else {
        await api.post(url, data);
      }
      onSuccess();
    } catch (err: any) {
      logger.error('Operation failed', err);
      const apiError = err?.response?.data?.error;
      setSubmitError(
        typeof apiError === 'string' ? apiError : apiError?.message || t('findings.saveFailed'),
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {submitError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/30 font-bold text-sm">
          {submitError}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <FormField label={t('common.auditPlan')} error={errors.audit_id?.message} required className="md:col-span-2">
          <Select {...register('audit_id')}>
            <option value="">{t('plan.selectPlan')}</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('findings.findingTitle')} error={errors.title?.message} required className="md:col-span-2">
          <Input {...register('title')} />
        </FormField>

        <FormField label={t('findings.findingType')} error={errors.finding_type?.message} required className="md:col-span-2">
          <Select {...register('finding_type')}>
            <option value="control_design_deficiency">{t('findings.type.control_design_deficiency')}</option>
            <option value="operational_design_deficiency">{t('findings.type.operational_design_deficiency')}</option>
          </Select>
        </FormField>

        <FormField label={t('findings.condition')} error={errors.condition?.message} required className="md:col-span-2">
          <Textarea rows={3} {...register('condition')} />
        </FormField>

        <FormField label={t('findings.criteria')} error={errors.criteria?.message} required className="md:col-span-2">
          <Textarea rows={3} {...register('criteria')} />
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
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="px-8 py-3 text-[var(--color-text-muted)] font-bold uppercase tracking-widest"
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="disabled:opacity-50"
        >
          {isSubmitting ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </form>
  );
};

export default FindingForm;

