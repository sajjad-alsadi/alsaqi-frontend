import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { RiskItem } from '../types';
import { RiskLevel, RiskStatus, AuditType } from '../constants';
import api from '../services/api';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { FormField } from './ui/FormField';

type RiskFormValues = {
  risk_id: string;
  description: string;
  owner?: string;
  source?: string;
  early_warning?: string;
  type?: string;
  likelihood?: string;
  impact?: string;
  score?: number;
  rating?: RiskLevel;
  controls?: string;
  control_assessment?: string;
  mitigation?: string;
  treatment_option?: string;
  residual_likelihood?: string;
  residual_impact?: string;
  residual_score?: number;
  residual_rating?: RiskLevel;
  status?: string;
  target_date?: string;
  review_date?: string;
  notes?: string;
  entry_date?: string;
  entered_by?: string;
};

interface RiskFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: RiskItem | null;
}

const RiskForm: React.FC<RiskFormProps> = ({ onSuccess, onCancel, initialData }) => {
  const { t } = useTranslation();

  const riskSchema = z.object({
    risk_id: z.string().min(1, t('fieldRequired')),
    description: z.string().min(1, t('fieldRequired')),
    owner: z.string().optional(),
    source: z.string().optional(),
    early_warning: z.string().optional(),
    type: z.string().optional(),
    likelihood: z.string().optional(),
    impact: z.string().optional(),
    score: z.string().optional().transform(val => val ? Number(val) : undefined),
    rating: z.nativeEnum(RiskLevel).optional(),
    controls: z.string().optional(),
    control_assessment: z.string().optional(),
    mitigation: z.string().optional(),
    treatment_option: z.string().optional(),
    residual_likelihood: z.string().optional(),
    residual_impact: z.string().optional(),
    residual_score: z.string().optional().transform(val => val ? Number(val) : undefined),
    residual_rating: z.nativeEnum(RiskLevel).optional(),
    status: z.string().optional(),
    target_date: z.string().optional(),
    review_date: z.string().optional(),
    notes: z.string().optional(),
    entry_date: z.string().optional(),
    entered_by: z.string().optional(),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RiskFormValues>({
    resolver: zodResolver(riskSchema) as any,
    defaultValues: {
      risk_id: '',
      description: '',
      owner: '',
      source: '',
      early_warning: '',
      type: AuditType.OPERATIONAL,
      likelihood: 'Low',
      impact: 'Low',
      score: 0,
      rating: RiskLevel.LOW,
      controls: '',
      control_assessment: '',
      mitigation: '',
      treatment_option: '',
      residual_likelihood: 'Low',
      residual_impact: 'Low',
      residual_score: 0,
      residual_rating: RiskLevel.LOW,
      status: RiskStatus.ACTIVE,
      target_date: '',
      review_date: '',
      notes: '',
      entry_date: new Date().toISOString().split('T')[0],
      entered_by: ''
    },
  });

  useEffect(() => {
    if (initialData) {
      const sanitized = { ...initialData };
      Object.keys(sanitized).forEach((key) => {
        if (sanitized[key as keyof RiskItem] === null) {
          (sanitized as any)[key] = '';
        }
      });
      reset(sanitized as any);
    }
  }, [initialData, reset]);

  const onSubmit = async (data: RiskFormValues) => {
    try {
      const url = initialData?.id ? `/risk-register/${initialData.id}` : '/risk-register';
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar pe-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <FormField label={t('riskId')} error={errors.risk_id?.message} required>
          <Input {...register('risk_id')} placeholder="R-001" />
        </FormField>

        <FormField label={t('common.riskType')} error={errors.type?.message}>
          <Select {...register('type')}>
            {Object.values(AuditType).map((type) => (
              <option key={type} value={type}>{t(type.toLowerCase())}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('common.riskDescription')} error={errors.description?.message} required className="md:col-span-2">
          <Textarea {...register('description')} placeholder={t('common.describeEvidence')} />
        </FormField>

        <FormField label={t('common.riskOwner')} error={errors.owner?.message}>
          <Input {...register('owner')} />
        </FormField>

        <FormField label={t('common.riskSource')} error={errors.source?.message}>
          <Input {...register('source')} />
        </FormField>

        <FormField label={t('common.earlyWarningIndicators')} error={errors.early_warning?.message} className="md:col-span-2">
          <Input {...register('early_warning')} />
        </FormField>

        <div className="col-span-full pt-4 border-t border-[var(--color-border-soft)]">
          <h4 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-widest mb-4 opacity-80">{t('common.initialRiskAssessment')}</h4>
        </div>

        <FormField label={t('likelihood')} error={errors.likelihood?.message}>
          <Input {...register('likelihood')} />
        </FormField>

        <FormField label={t('impact')} error={errors.impact?.message}>
          <Input {...register('impact')} />
        </FormField>

        <FormField label={t('common.riskScore')} error={errors.score?.message}>
          <Input type="number" {...register('score')} />
        </FormField>

        <FormField label={t('common.riskLevel')} error={errors.rating?.message}>
          <Select {...register('rating')}>
            {Object.values(RiskLevel).map((level) => (
              <option key={level} value={level}>{t(level.toLowerCase())}</option>
            ))}
          </Select>
        </FormField>

        <div className="col-span-full pt-4 border-t border-[var(--color-border-soft)]">
          <h4 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-widest mb-4 opacity-80">{t('common.controlsAndMitigation')}</h4>
        </div>

        <FormField label={t('existingControls')} error={errors.controls?.message} className="md:col-span-2">
          <Input {...register('controls')} />
        </FormField>

        <FormField label={t('controlAssessment')} error={errors.control_assessment?.message}>
          <Input {...register('control_assessment')} />
        </FormField>

        <FormField label={t('treatmentOption')} error={errors.treatment_option?.message}>
          <Input {...register('treatment_option')} />
        </FormField>

        <FormField label={t('mitigationPlan')} error={errors.mitigation?.message} className="md:col-span-2">
          <Input {...register('mitigation')} />
        </FormField>

        <div className="col-span-full pt-4 border-t border-[var(--color-border-soft)]">
          <h4 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-widest mb-4 opacity-80">{t('common.residualRiskAssessment')}</h4>
        </div>

        <FormField label={t('residualLikelihood')} error={errors.residual_likelihood?.message}>
          <Input {...register('residual_likelihood')} />
        </FormField>

        <FormField label={t('residualImpact')} error={errors.residual_impact?.message}>
          <Input {...register('residual_impact')} />
        </FormField>

        <FormField label={t('residualScore')} error={errors.residual_score?.message}>
          <Input type="number" {...register('residual_score')} />
        </FormField>

        <FormField label={t('common.residualRiskLevel')} error={errors.residual_rating?.message}>
          <Select {...register('residual_rating')}>
            {Object.values(RiskLevel).map((level) => (
              <option key={level} value={level}>{t(level.toLowerCase())}</option>
            ))}
          </Select>
        </FormField>

        <div className="col-span-full pt-4 border-t border-[var(--color-border-soft)]">
          <h4 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-widest mb-4 opacity-80">{t('common.tracking')}</h4>
        </div>

        <FormField label={t('status')} error={errors.status?.message}>
          <Select {...register('status')}>
            {Object.values(RiskStatus).map((status) => (
              <option key={status} value={status}>{t(status.toLowerCase())}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('targetDate')} error={errors.target_date?.message}>
          <Input type="date" {...register('target_date')} />
        </FormField>

        <FormField label={t('reviewDate')} error={errors.review_date?.message}>
          <Input type="date" {...register('review_date')} />
        </FormField>

        <FormField label={t('common.enteredBy')} error={errors.entered_by?.message}>
          <Input {...register('entered_by')} />
        </FormField>

        <FormField label={t('common.notes')} error={errors.notes?.message} className="md:col-span-2">
          <Textarea {...register('notes')} rows={2} />
        </FormField>
      </div>

      <div className="flex justify-end gap-6 pt-8 border-t border-[var(--color-border-soft)] sticky bottom-0 bg-[var(--color-card)]/80 backdrop-blur-md p-4 rounded-xl">
        <button type="button" onClick={onCancel} className="px-8 py-3 text-[var(--color-text-muted)] font-black uppercase tracking-widest hover:bg-[var(--color-bg-soft)] rounded-xl transition-all">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-50">
          {isSubmitting ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </form>
  );
};

export default RiskForm;

