import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { AuditPlan } from '../types';
import { AuditStatus, AuditType, RiskLevel } from '../constants';
import api from '../services/api';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { FormField } from './ui/FormField';
import { useDepartments } from '../hooks/useDepartments';

type AuditPlanFormValues = {
  title: string;
  department: string;
  type: AuditType;
  risk_rating: RiskLevel;
  planned_start_date: string;
  planned_end_date: string;
  lead_auditor: string;
  status: AuditStatus;
  notes?: string;
  program_id?: string | number;
};

interface AuditPlanFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: AuditPlan | null;
}

const AuditPlanForm: React.FC<AuditPlanFormProps> = ({ onSuccess, onCancel, initialData }) => {
  const { t } = useTranslation();
  
  const auditPlanSchema = z.object({
    title: z.string().min(1, t('plan.fieldRequired')),
    department: z.string().min(1, t('plan.fieldRequired')),
    type: z.nativeEnum(AuditType),
    risk_rating: z.nativeEnum(RiskLevel),
    planned_start_date: z.string().min(1, t('plan.fieldRequired')),
    planned_end_date: z.string().min(1, t('plan.fieldRequired')),
    lead_auditor: z.string().min(1, t('plan.fieldRequired')),
    status: z.nativeEnum(AuditStatus),
    notes: z.string().optional(),
    program_id: z.string().optional(),
  });
  
  const { departments } = useDepartments();
  const [programs, setPrograms] = useState<any[]>([]);
  const [auditors, setAuditors] = useState<any[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AuditPlanFormValues>({
    resolver: zodResolver(auditPlanSchema) as any,
    defaultValues: {
      title: '',
      department: '',
      type: AuditType.OPERATIONAL,
      risk_rating: RiskLevel.MEDIUM,
      planned_start_date: '',
      planned_end_date: '',
      lead_auditor: '',
      status: AuditStatus.PLANNED,
      notes: ''
    },
  });

  const selectedProgramId = watch('program_id');

  useEffect(() => {
    if (initialData) {
      const sanitized = { ...initialData };
      Object.keys(sanitized).forEach((key) => {
        if (sanitized[key as keyof AuditPlan] === null) {
          (sanitized as any)[key] = '';
        }
      });
      reset(sanitized as any);
    }
  }, [initialData, reset]);

  useEffect(() => {
    // Fetch programs
    api.get('/audit-programs')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
        setPrograms(data.filter((p: any) => p.status === 'Approved'));
      })
      .catch(() => setPrograms([]));

    // Fetch auditors (Managers)
    api.get('/users/list')
      .then(res => {
        const users = Array.isArray(res.data) ? res.data : (res.data.data || []);
        // Filter for role 'Manager'
        setAuditors(users.filter((u: any) => u.role === 'Manager'));
      })
      .catch(() => setAuditors([]));
  }, []);

  useEffect(() => {
    if (selectedProgramId) {
      const prog = programs.find(p => String(p.id) === String(selectedProgramId));
      if (prog) {
        setValue('title', prog.program_title);
        setValue('department', prog.department);
        setValue('type', prog.audit_type as AuditType);
      }
    }
  }, [selectedProgramId, programs, setValue]);

  const onSubmit = async (data: AuditPlanFormValues) => {
    try {
      const url = initialData?.id 
        ? `/audit-plans/${initialData.id}`
        : '/audit-plans';
      
      let savedPlan;
      if (initialData?.id) {
        const res = await api.put(url, data);
        savedPlan = res.data;
      } else {
        const res = await api.post(url, data);
        savedPlan = res.data;
      }
      
      // If it's a new plan and a program was selected, import procedures
      if (!initialData?.id && data.program_id) {
        const procRes = await api.get(`/audit-procedures?program_id=${data.program_id}`);
        const procs = Array.isArray(procRes.data) ? procRes.data : (procRes.data?.data || []);
        
        if (procs.length > 0) {
          for (const proc of procs) {
            await api.post('/audit-tasks', {
              audit_id: savedPlan.id,
              procedure: `${proc.procedure_number}: ${proc.audit_step}`,
              responsible: data.lead_auditor,
              status: 'Open'
            });
          }
        }
      }
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <FormField label={t('plan.title')} error={errors.title?.message} required className="md:col-span-2">
          <Input {...register('title')} />
        </FormField>

        {!initialData?.id && (
          <FormField label={t('plan.library')} error={errors.program_id?.message} className="md:col-span-2">
            <Select {...register('program_id')}>
              <option value="">{t('plan.selectProgramFromLibrary')}</option>
              {(Array.isArray(programs) ? programs : []).map(prog => (
                <option key={prog.id} value={prog.id}>{prog.program_code} - {prog.program_title}</option>
              ))}
            </Select>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-2 font-bold italic">
              {t('plan.proceduresImportedAutomatically')}
            </p>
          </FormField>
        )}
        
        <FormField label={t('plan.department')} error={errors.department?.message} required>
          <Select {...register('department')}>
            <option value="">{t('plan.selectDepartment')}</option>
            {(Array.isArray(departments) ? departments : []).map(dept => (
              <option key={dept.id} value={dept.name}>{dept.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('plan.type')} error={errors.type?.message} required>
          <Select {...register('type')}>
            {Object.values(AuditType).map((type) => (
              <option key={type} value={type}>{t(`plan.${type.toLowerCase()}`)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('plan.riskRating')} error={errors.risk_rating?.message} required>
          <Select {...register('risk_rating')}>
            {Object.values(RiskLevel).map((level) => (
              <option key={level} value={level}>{t(`plan.${level.toLowerCase()}`)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('plan.leadAuditor')} error={errors.lead_auditor?.message} required>
          <Select {...register('lead_auditor')}>
            <option value="">{t('plan.selectLeadAuditor') || 'Select Lead Auditor'}</option>
            {auditors.map((auditor) => (
              <option key={auditor.id} value={auditor.name}>{auditor.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('plan.startDate')} error={errors.planned_start_date?.message} required>
          <Input type="date" {...register('planned_start_date')} />
        </FormField>

        <FormField label={t('plan.endDate')} error={errors.planned_end_date?.message} required>
          <Input type="date" {...register('planned_end_date')} />
        </FormField>

        <FormField label={t('plan.status')} error={errors.status?.message} required>
          <Select {...register('status')}>
            {Object.values(AuditStatus).map((status) => (
              <option key={status} value={status}>{t(`plan.${status.toLowerCase()}`)}</option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="flex justify-end gap-6 pt-8 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-8 py-3 text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary disabled:opacity-50"
        >
          {isSubmitting ? t('common.loading') : t('plan.save')}
        </button>
      </div>
    </form>
  );
};

export default AuditPlanForm;

