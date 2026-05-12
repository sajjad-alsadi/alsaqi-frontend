import React from 'react';
import { X, Save, FileText, List, Plus, Trash2, Shield, Target, CheckCircle } from 'lucide-react';
import { AuditProgram, AuditProcedure } from '../../types';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../services/formatService';
import { AuditStatus, AuditType, ControlTestType, UserRole } from '../../constants';
import { useDepartments } from '../../hooks/useDepartments';

interface AuditProgramEditorProps {
  program: Partial<AuditProgram>;
  procedures: AuditProcedure[];
  auditTypes: string[];
  testTypes: string[];
  instructions: any[];
  laws: any[];
  user: any;
  onCancel: () => void;
  onSave: () => void;
  onUpdateProgram: (data: Partial<AuditProgram>) => void;
  onAddProcedure: () => void;
  onUpdateProcedure: (id: string | number, data: Partial<AuditProcedure>) => void;
  onDeleteProcedure: (id: string | number) => void;
  onApprove: (id: string | number) => void;
  isDeleting?: boolean;
}

const AuditProgramEditor: React.FC<AuditProgramEditorProps> = ({
  program,
  procedures,
  auditTypes,
  testTypes,
  instructions,
  laws,
  user,
  onCancel,
  onSave,
  onUpdateProgram,
  onAddProcedure,
  onUpdateProcedure,
  onDeleteProcedure,
  onApprove,
  isDeleting
}) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { formatNumber } = useFormat();
  const { departments } = useDepartments();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={24} className="text-slate-400" />
          </button>
          <h2 className="text-3xl font-bold text-[var(--color-text-main)] tracking-tight">
            {program.id ? t('program.edit') : t('program.add')} {t('program.library')}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onSave} className="btn-primary flex items-center gap-2">
            <Save size={18} />
            {t('program.save')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-card p-8 space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              {t('program.basicProgramInformation')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.programCode')}</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={program.program_code || ''} 
                  onChange={e => onUpdateProgram({ program_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.programTitle')}</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={program.program_title || ''} 
                  onChange={e => onUpdateProgram({ program_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.department')}</label>
                <select 
                  className="input-field" 
                  value={program.department || ''} 
                  onChange={e => onUpdateProgram({ department: e.target.value })}
                >
                  <option value="">{t('plan.selectDepartment')}</option>
                  {Array.isArray(departments) && departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.auditType')}</label>
                <select 
                  className="input-field" 
                  value={program.audit_type || ''} 
                  onChange={e => onUpdateProgram({ audit_type: e.target.value as AuditType })}
                >
                  <option value="">{t('program.selectType')}</option>
                  {auditTypes.map(type => <option key={type} value={type}>{t(`plan.${type.toLowerCase()}`)}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.auditObjective')}</label>
              <textarea 
                className="input-field min-h-[100px]" 
                value={program.audit_objective || ''} 
                onChange={e => onUpdateProgram({ audit_objective: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.auditScope')}</label>
              <textarea 
                className="input-field min-h-[100px]" 
                value={program.audit_scope || ''} 
                onChange={e => onUpdateProgram({ audit_scope: e.target.value })}
              />
            </div>
          </div>

          {program.id && (
            <div className="glass-card p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <List size={20} className="text-primary" />
                  {t('program.auditProcedures')}
                </h3>
                <button onClick={onAddProcedure} className="btn-primary py-2 px-4 text-xs flex items-center gap-2">
                  <Plus size={14} />
                  {t('program.addProcedure')}
                </button>
              </div>

              <div className="space-y-4">
                {Array.isArray(procedures) && procedures.map((proc, idx) => (
                  <div key={proc.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
                        {t('program.procedure')} #{formatNumber(proc.procedure_number)}
                      </span>
                      <button 
                        onClick={() => onDeleteProcedure(proc.id!)} 
                        disabled={isDeleting}
                        className={`text-rose-500 hover:text-rose-700 p-1 transition-all ${isDeleting ? 'opacity-30 cursor-not-allowed' : 'active:scale-90'}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('program.auditStep')}</label>
                        <input 
                          type="text" 
                          className="input-field py-2 text-sm" 
                          value={proc.audit_step || ''} 
                          onChange={e => onUpdateProcedure(proc.id!, { audit_step: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('program.testType')}</label>
                        <select 
                          className="input-field py-2 text-sm" 
                          value={proc.control_test_type || ''} 
                          onChange={e => onUpdateProcedure(proc.id!, { control_test_type: e.target.value as ControlTestType })}
                        >
                          {testTypes.map(type => <option key={type} value={type}>{t(`program.${type.toLowerCase()}`)}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('program.testDescription')}</label>
                      <textarea 
                        className="input-field py-2 text-sm min-h-[60px]" 
                        value={proc.audit_test_description || ''} 
                        onChange={e => onUpdateProcedure(proc.id!, { audit_test_description: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('program.riskAddressed')}</label>
                        <input 
                          type="text" 
                          className="input-field py-2 text-sm" 
                          value={proc.risk_addressed || ''} 
                          onChange={e => onUpdateProcedure(proc.id!, { risk_addressed: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('program.expectedEvidence')}</label>
                        <input 
                          type="text" 
                          className="input-field py-2 text-sm" 
                          value={proc.expected_evidence || ''} 
                          onChange={e => onUpdateProcedure(proc.id!, { expected_evidence: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {procedures.length === 0 && (
                  <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                    <p className="text-[var(--color-text-muted)] font-bold">{t('program.noProceduresAddedYet')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="glass-card p-8 space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Shield size={20} className="text-primary" />
              {t('program.risksAndControls')}
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.keyRisks')}</label>
                <textarea 
                  className="input-field min-h-[100px]" 
                  value={program.key_risks || ''} 
                  onChange={e => onUpdateProgram({ key_risks: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.controlObjectives')}</label>
                <textarea 
                  className="input-field min-h-[100px]" 
                  value={program.control_objectives || ''} 
                  onChange={e => onUpdateProgram({ control_objectives: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.referenceStandard')}</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(program.reference_standard ? program.reference_standard.split(',').filter(Boolean) : []).map((standard, index) => (
                    <span key={index} className="bg-primary/10 text-primary px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                      {standard}
                      <button 
                        onClick={() => {
                          const standards = (program.reference_standard ? program.reference_standard.split(',').filter(Boolean) : []);
                          onUpdateProgram({ reference_standard: standards.filter((_, i) => i !== index).join(',') });
                        }}
                        className="hover:text-primary/70"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <select 
                  className="input-field" 
                  value=""
                  onChange={e => {
                    const selectedValue = e.target.value;
                    if (!selectedValue) return;
                    const standards = (program.reference_standard ? program.reference_standard.split(',').filter(Boolean) : []);
                    if (!standards.includes(selectedValue)) {
                      onUpdateProgram({ reference_standard: [...standards, selectedValue].join(',') });
                    }
                  }}
                >
                  <option value="">{t('program.selectStandard')}</option>
                  <optgroup label={t('program.centralBankInstructions')}>
                    {Array.isArray(instructions) && instructions.map(i => <option key={i.id} value={i.title}>{i.title}</option>)}
                  </optgroup>
                  <optgroup label={t('program.lawsAndRegulations')}>
                    {Array.isArray(laws) && laws.map(l => <option key={l.id} value={l.title}>{l.title}</option>)}
                  </optgroup>
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 space-y-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Target size={20} className="text-primary" />
              {t('program.programStatus')}
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.status')}</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  program.status === AuditStatus.APPROVED ? 'bg-emerald-100 text-emerald-600' :
                  program.status === AuditStatus.DRAFT ? 'bg-slate-200 text-slate-600' : 'bg-primary/10 text-primary'
                }`}>
                  {t(`plan.${program.status?.toLowerCase() || 'draft'}`)}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('program.version')}</span>
                <span className="text-sm font-bold text-slate-800">v{formatNumber(program.version_number || 1)}.0</span>
              </div>
              {program.id && (user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER) && program.status !== AuditStatus.APPROVED && (
                <button onClick={() => onApprove(program.id!)} className="w-full btn-primary bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100 flex items-center justify-center gap-2">
                  <CheckCircle size={18} />
                  {t('program.approve')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditProgramEditor;
