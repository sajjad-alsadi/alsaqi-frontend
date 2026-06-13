import React, { useEffect, useState } from 'react';
import { X, Save, FileText, List, Plus, Trash2, Shield, Target, CheckCircle } from 'lucide-react';
import { AuditProgram, AuditProcedure } from '../../types';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../utils/formatService';
import { AuditStatus, AuditType, ControlTestType, UserRole } from '../../constants';
import { useDepartments } from '../../api/hooks/useDepartments';
import api from '../../api/httpClient';
import { Button } from '@/components/ui/button';

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

  // Risk register entries for linking
  const [risks, setRisks] = useState<any[]>([]);
  // Compliance items for reference standard
  const [complianceItems, setComplianceItems] = useState<any[]>([]);

  useEffect(() => {
    api.get('/risk-register', { params: { pageSize: 200 } })
      .then(res => setRisks(Array.isArray(res.data) ? res.data : (res.data.data || [])))
      .catch(() => setRisks([]));
    api.get('/compliance-items', { params: { pageSize: 200 } })
      .then(res => setComplianceItems(Array.isArray(res.data) ? res.data : (res.data.data || [])))
      .catch(() => setComplianceItems([]));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="p-2 hover:bg-[var(--color-bg-main)] rounded-full transition-colors">
            <X size={24} className="text-[var(--color-text-muted)]" />
          </button>
          <h2 className="text-3xl font-bold text-[var(--color-text-main)] tracking-tight">
            {program.id ? t('program.edit') : t('program.add')} {t('program.library')}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onSave} className="flex items-center gap-2">
            <Save size={18} />
            {t('program.save')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-card p-8 space-y-6">
            <h3 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-2">
              <FileText size={20} className="text-[var(--color-primary)]" />
              {t('program.basicProgramInformation')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.programCode')}</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={program.program_code || ''} 
                  onChange={e => onUpdateProgram({ program_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.programTitle')}</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={program.program_title || ''} 
                  onChange={e => onUpdateProgram({ program_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.department')}</label>
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
                <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.auditType')}</label>
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
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.auditObjective')}</label>
              <textarea 
                className="input-field min-h-[100px]" 
                value={program.audit_objective || ''} 
                onChange={e => onUpdateProgram({ audit_objective: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.auditScope')}</label>
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
                <h3 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-2">
                  <List size={20} className="text-[var(--color-primary)]" />
                  {t('program.auditProcedures')}
                </h3>
                <Button onClick={onAddProcedure} className="py-2 px-4 text-xs flex items-center gap-2">
                  <Plus size={14} />
                  {t('program.addProcedure')}
                </Button>
              </div>

              <div className="space-y-4">
                {Array.isArray(procedures) && procedures.map((proc, idx) => (
                  <div key={proc.id} className="p-6 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)] space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1 rounded-full">
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
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.auditStep')}</label>
                        <input 
                          type="text" 
                          className="input-field py-2 text-sm" 
                          value={proc.audit_step || ''} 
                          onChange={e => onUpdateProcedure(proc.id!, { audit_step: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.testType')}</label>
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
                      <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.testDescription')}</label>
                      <textarea 
                        className="input-field py-2 text-sm min-h-[60px]" 
                        value={proc.audit_test_description || ''} 
                        onChange={e => onUpdateProcedure(proc.id!, { audit_test_description: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.riskAddressed')}</label>
                        <input 
                          type="text" 
                          className="input-field py-2 text-sm" 
                          value={proc.risk_addressed || ''} 
                          onChange={e => onUpdateProcedure(proc.id!, { risk_addressed: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.expectedEvidence')}</label>
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
                  <div className="py-12 text-center border-2 border-dashed border-[var(--color-border-soft)] rounded-3xl">
                    <p className="text-[var(--color-text-muted)] font-bold">{t('program.noProceduresAddedYet')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="glass-card p-8 space-y-6">
            <h3 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-2">
              <Shield size={20} className="text-[var(--color-primary)]" />
              {t('program.risksAndControls')}
            </h3>
            
            <div className="space-y-4">
              {/* Key Risks — pulled from Risk Register */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.keyRisks')}</label>
                {/* Show selected risks as tags */}
                <div className="flex flex-wrap gap-2 mb-2 min-h-[32px]">
                  {(program.key_risks ? program.key_risks.split('||').filter(Boolean) : []).map((r, i) => (
                    <span key={i} className="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                      {r}
                      <button onClick={() => {
                        const arr = (program.key_risks || '').split('||').filter(Boolean);
                        onUpdateProgram({ key_risks: arr.filter((_, idx) => idx !== i).join('||') });
                      }} className="hover:text-rose-800"><X size={11} /></button>
                    </span>
                  ))}
                </div>
                <select className="input-field" value=""
                  onChange={e => {
                    if (!e.target.value) return;
                    const arr = (program.key_risks || '').split('||').filter(Boolean);
                    if (!arr.includes(e.target.value)) {
                      onUpdateProgram({ key_risks: [...arr, e.target.value].join('||') });
                    }
                  }}>
                  <option value="">{t('programs.linkRisks') || 'اختر خطراً من السجل'}</option>
                  {risks.map(r => (
                    <option key={r.id} value={r.risk_id ? `${r.risk_id}: ${r.description}` : r.description}>
                      {r.risk_id ? `${r.risk_id} — ` : ''}{r.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Standard — pulled from Compliance Matrix */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.referenceStandard')}</label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[32px]">
                  {(program.reference_standard ? program.reference_standard.split(',').filter(Boolean) : []).map((standard, index) => (
                    <span key={index} className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                      {standard}
                      <button onClick={() => {
                        const standards = (program.reference_standard || '').split(',').filter(Boolean);
                        onUpdateProgram({ reference_standard: standards.filter((_, i) => i !== index).join(',') });
                      }} className="hover:text-[var(--color-primary)]/70"><X size={12} /></button>
                    </span>
                  ))}
                </div>
                <select className="input-field" value=""
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) return;
                    const arr = (program.reference_standard || '').split(',').filter(Boolean);
                    if (!arr.includes(val)) {
                      onUpdateProgram({ reference_standard: [...arr, val].join(',') });
                    }
                  }}>
                  <option value="">{t('programs.linkStandards') || 'اختر معياراً من مصفوفة الامتثال'}</option>
                  {complianceItems.map(c => (
                    <option key={c.id} value={c.ref_number ? `${c.ref_number}: ${c.title}` : c.title}>
                      {c.ref_number ? `${c.ref_number} — ` : ''}{c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 space-y-6">
            <h3 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-2">
              <Target size={20} className="text-[var(--color-primary)]" />
              {t('program.programStatus')}
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl">
                <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.status')}</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  program.status === AuditStatus.APPROVED ? 'bg-emerald-100 text-emerald-600' :
                  program.status === AuditStatus.DRAFT ? 'bg-slate-200 text-[var(--color-text-muted)]' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                }`}>
                  {t(`plan.${program.status?.toLowerCase() || 'draft'}`)}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl">
                <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('program.version')}</span>
                <span className="text-sm font-bold text-[var(--color-text-main)]">v{formatNumber(program.version_number || 1)}.0</span>
              </div>
              {program.id && (user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER) && program.status !== AuditStatus.APPROVED && (
                <Button onClick={() => onApprove(program.id!)} className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100 flex items-center justify-center gap-2">
                  <CheckCircle size={18} />
                  {t('program.approve')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditProgramEditor;
