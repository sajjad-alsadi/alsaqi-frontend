import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { Recommendation, AuditFinding } from '../types';
import { AuditStatus, RiskLevel } from '../constants';
import CommentSection from './CommentSection';
import api from '../api/httpClient';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { FormField } from './ui/FormField';
import logger from '../utils/logger';
import { Button } from '@/components/ui/button';

type RecommendationFormValues = {
  finding_id: string;
  department: string;
  responsible: string;
  due_date: string;
  status: AuditStatus;
  risk_level: RiskLevel;
};

interface RecommendationFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  findings: AuditFinding[];
  initialData?: Recommendation | null;
}

const RecommendationForm: React.FC<RecommendationFormProps> = ({ onSuccess, onCancel, findings, initialData }) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const recommendationSchema = useMemo(
    () =>
      z.object({
        finding_id: z.string().min(1, t('recommendations.fieldRequired')),
        department: z.string().min(1, t('recommendations.fieldRequired')),
        responsible: z.string().min(1, t('recommendations.fieldRequired')),
        due_date: z.string().min(1, t('recommendations.fieldRequired')),
        status: z.nativeEnum(AuditStatus),
        risk_level: z.nativeEnum(RiskLevel),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RecommendationFormValues>({
    resolver: zodResolver(recommendationSchema) as any,
    mode: 'onBlur',
    defaultValues: {
      finding_id: findings[0]?.id ? String(findings[0].id) : '',
      department: '',
      responsible: '',
      due_date: '',
      status: AuditStatus.OPEN,
      risk_level: RiskLevel.MEDIUM,
    },
  });

  const findingId = watch('finding_id');

  useEffect(() => {
    if (initialData) {
      const sanitized = { ...initialData };
      Object.keys(sanitized).forEach((key) => {
        if (sanitized[key as keyof Recommendation] === null) {
          (sanitized as any)[key] = '';
        }
      });
      reset(sanitized as any);
    }
  }, [initialData, reset]);

  const onSubmit = async (data: RecommendationFormValues) => {
    setSubmitError(null);
    try {
      const url = initialData?.id 
        ? `/recommendations/${initialData.id}`
        : '/recommendations';
      
      if (initialData?.id) {
        await api.put(url, data);
      } else {
        await api.post(url, data);
      }
      onSuccess();
    } catch (err) {
      logger.error('Operation failed', err);
      const apiError = (err as { response?: { data?: { error?: string | { message?: string } } } })
        .response?.data?.error;
      setSubmitError(
        typeof apiError === 'string' ? apiError : apiError?.message || t('recommendations.saveFailed'),
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
        <FormField label={t('recommendations.recommendation')} className="md:col-span-2">
          <div className="p-6 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-sm font-bold text-emerald-900 dark:text-emerald-400 leading-relaxed shadow-sm">
            {findings.find(f => String(f.id) === String(findingId))?.recommendation || t('recommendations.noRecommendationTextFound')}
          </div>
        </FormField>

        <FormField label={t('recommendations.department')} error={errors.department?.message} required>
          <Input {...register('department')} />
        </FormField>

        <FormField label={t('recommendations.responsible')} error={errors.responsible?.message} required>
          <Input {...register('responsible')} />
        </FormField>
        
        <FormField label={t('recommendations.dueDate')} error={errors.due_date?.message} required>
          <Input type="date" {...register('due_date')} />
        </FormField>

        <FormField label={t('recommendations.status')} error={errors.status?.message} required>
          <Select {...register('status')}>
            <option value={AuditStatus.OPEN}>{t('common.open')}</option>
            <option value={AuditStatus.IN_PROGRESS}>{t('common.inProgress')}</option>
            <option value={AuditStatus.IMPLEMENTED}>{t('common.implemented')}</option>
            <option value={AuditStatus.OVERDUE}>{t('common.overdue')}</option>
          </Select>
        </FormField>

        <FormField label={t('recommendations.riskLevel')} error={errors.risk_level?.message} required>
          <Select {...register('risk_level')}>
            {Object.values(RiskLevel).map((level) => (
              <option key={level} value={level}>{t('common.' + level.toLowerCase())}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {initialData?.id && (
        <CommentSection relatedType="recommendation" relatedId={initialData.id} />
      )}

      <div className="flex justify-end gap-6 pt-8 border-t border-[var(--color-border-soft)] dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-8 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] font-bold uppercase tracking-widest hover:bg-[var(--color-bg-main)] dark:hover:bg-slate-800 rounded-xl transition-all"
        >
          {t('common.cancel')}
        </button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="disabled:opacity-50"
        >
          {isSubmitting ? t('common.loading') : t('recommendations.save')}
        </Button>
      </div>
    </form>
  );
};

export default RecommendationForm;

