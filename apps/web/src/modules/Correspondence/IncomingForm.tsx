import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { 
  CorrespondencePriority, 
  CorrespondenceClassification, 
  SendingMethod, 
  EntityType 
} from '../../constants';
import api from '../../api/httpClient';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import logger from '../../utils/logger';
import { Textarea } from '../../components/ui/Textarea';
import { FormField } from '../../components/ui/FormField';

const incomingSchema = z.object({
  letter_number: z.string().optional(),
  sender_entity: z.string().min(1, 'Field is required'),
  sender_entity_type: z.nativeEnum(EntityType),
  subject: z.string().min(1, 'Field is required'),
  letter_date: z.string().min(1, 'Field is required'),
  receipt_date: z.string().min(1, 'Field is required'),
  classification: z.nativeEnum(CorrespondenceClassification),
  priority: z.nativeEnum(CorrespondencePriority),
  method: z.nativeEnum(SendingMethod),
  receiving_dept_id: z.string().optional().transform(val => val ? Number(val) : undefined),
  assigned_dept_id: z.string().optional().transform(val => val ? Number(val) : undefined),
  assigned_user_id: z.string().optional().transform(val => val ? Number(val) : undefined),
  follow_up_required: z.boolean().optional(),
  follow_up_date: z.string().optional(),
  response_required: z.boolean().optional(),
  response_due_date: z.string().optional(),
  notes: z.string().optional(),
});

type IncomingFormValues = z.infer<typeof incomingSchema>;

interface IncomingFormProps {
  language: 'ar' | 'en';
  departments: any[];
  users: any[];
  onSuccess: () => void;
  onCancel: () => void;
}

const IncomingForm: React.FC<IncomingFormProps> = ({ language, departments, users, onSuccess, onCancel }) => {
  const { t } = useTranslation();
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<IncomingFormValues>({
    resolver: zodResolver(incomingSchema) as any,
    mode: 'onBlur',
    defaultValues: {
      sender_entity_type: EntityType.PRIVATE,
      classification: CorrespondenceClassification.GENERAL,
      priority: CorrespondencePriority.NORMAL,
      method: SendingMethod.OFFICIAL_MAIL,
      letter_date: new Date().toISOString().split('T')[0] ?? '',
      receipt_date: new Date().toISOString().split('T')[0] ?? '',
      follow_up_required: false,
      response_required: false,
    },
  });

  const followUpRequired = watch('follow_up_required');
  const responseRequired = watch('response_required');

  const onSubmit = async (data: IncomingFormValues) => {
    try {
      await api.post('/correspondence/incoming', data);
      onSuccess();
    } catch (error) {
      logger.error("Failed to save incoming correspondence", error);
      toast.error(t('errorOccurred'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <FormField label={t('correspondence.originalLetterNo')} error={errors.letter_number?.message}>
          <Input {...register('letter_number')} defaultValue="" placeholder={t('correspondence.originalLetterNoPlaceholder')} />
        </FormField>

        <FormField label={t('correspondence.senderEntity')} error={errors.sender_entity?.message} required>
          <Input {...register('sender_entity')} defaultValue="" placeholder={t('correspondence.senderEntityPlaceholder')} />
        </FormField>

        <FormField label={t('correspondence.entityType')} error={errors.sender_entity_type?.message}>
          <Select {...register('sender_entity_type')}>
            {Object.values(EntityType).map(type => (
              <option key={type} value={type}>{t(`correspondence.${type.toLowerCase().replace(/\s+/g, '_')}`)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('correspondence.letterSubject')} error={errors.subject?.message} required className="md:col-span-2 lg:col-span-3">
          <Input {...register('subject')} defaultValue="" placeholder={t('correspondence.letterSubjectPlaceholder')} />
        </FormField>

        <FormField label={t('correspondence.letterDate')} error={errors.letter_date?.message} required>
          <Input type="date" {...register('letter_date')} />
        </FormField>

        <FormField label={t('correspondence.receiptDate')} error={errors.receipt_date?.message} required>
          <Input type="date" {...register('receipt_date')} />
        </FormField>

        <FormField label={t('correspondence.receivedMethod')} error={errors.method?.message}>
          <Select {...register('method')}>
            {Object.values(SendingMethod).map(method => (
              <option key={method} value={method}>{t(`correspondence.${method.toLowerCase().replace(/\s+/g, '_')}`)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('correspondence.classification')} error={errors.classification?.message}>
          <Select {...register('classification')}>
            {Object.values(CorrespondenceClassification).map(cls => (
              <option key={cls} value={cls}>{t(`correspondence.${cls.toLowerCase().replace(/\s+/g, '_')}`)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('correspondence.priority')} error={errors.priority?.message}>
          <Select {...register('priority')}>
            {Object.values(CorrespondencePriority).map(prio => (
              <option key={prio} value={prio}>{t(`correspondence.${prio.toLowerCase().replace(/\s+/g, '_')}`)}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('correspondence.receivingDept')} error={errors.receiving_dept_id?.message}>
          <Select {...register('receiving_dept_id')}>
            <option value="">{t('correspondence.selectDepartment')}</option>
            {(Array.isArray(departments) ? departments : []).map(d => (
              <option key={d.id} value={d.id}>{language === 'ar' ? d.name_ar : d.name_en}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('correspondence.assignedDept')} error={errors.assigned_dept_id?.message}>
          <Select {...register('assigned_dept_id')}>
            <option value="">{t('correspondence.selectDepartment')}</option>
            {(Array.isArray(departments) ? departments : []).map(d => (
              <option key={d.id} value={d.id}>{language === 'ar' ? d.name_ar : d.name_en}</option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('correspondence.assignedUser')} error={errors.assigned_user_id?.message}>
          <Select {...register('assigned_user_id')}>
            <option value="">{t('correspondence.selectUser')}</option>
            {(Array.isArray(users) ? users : []).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </FormField>

        {/* Tracking Section */}
        <div className="p-6 bg-[var(--color-bg-soft)] dark:bg-slate-900/50 rounded-2xl border border-[var(--color-border-soft)] dark:border-slate-800 lg:col-span-3 space-y-6">
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-3">
              <input 
                type="checkbox"
                id="follow_up_required"
                className="w-5 h-5 text-[var(--color-primary)] rounded border-[var(--color-border-strong)] dark:border-slate-700 focus:ring-[var(--color-primary)] bg-[var(--color-card)] dark:bg-slate-800"
                {...register('follow_up_required')}
              />
              <label htmlFor="follow_up_required" className="text-sm font-bold text-[var(--color-text-main)] dark:text-[var(--color-border-strong)]">
                {t('correspondence.followUpRequired')}
              </label>
            </div>

            {followUpRequired && (
              <div className="flex-1 min-w-[200px]">
                <Input type="date" {...register('follow_up_date')} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-3">
              <input 
                type="checkbox"
                id="response_required"
                className="w-5 h-5 text-[var(--color-primary)] rounded border-[var(--color-border-strong)] dark:border-slate-700 focus:ring-[var(--color-primary)] bg-[var(--color-card)] dark:bg-slate-800"
                {...register('response_required')}
              />
              <label htmlFor="response_required" className="text-sm font-bold text-[var(--color-text-main)] dark:text-[var(--color-border-strong)]">
                {t('correspondence.responseRequired')}
              </label>
            </div>

            {responseRequired && (
              <div className="flex-1 min-w-[200px]">
                <Input type="date" {...register('response_due_date')} />
              </div>
            )}
          </div>
        </div>

        <FormField label={t('correspondence.notes')} error={errors.notes?.message} className="lg:col-span-3">
          <Textarea rows={3} {...register('notes')} placeholder={t('correspondence.notesPlaceholder')} />
        </FormField>
      </div>

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
          className="disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? t('correspondence.saving') : t('correspondence.registerLetter')}
        </Button>
      </div>
    </form>
  );
};

export default IncomingForm;
