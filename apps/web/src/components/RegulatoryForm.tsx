import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import api from '../api/httpClient';
import { Upload } from 'lucide-react';

interface RegulatoryFormProps {
  onSuccess: () => void;
  onClose: () => void;
  initialData?: any;
}

const RegulatoryForm: React.FC<RegulatoryFormProps> = ({ onSuccess, onClose, initialData }) => {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    issue_date: initialData?.issue_date || '',
    reference_number: initialData?.reference_number || '',
    category: initialData?.category || '',
    description: initialData?.description || '',
    related_department: initialData?.related_department || '',
    status: initialData?.status || 'Active',
    related_instruction_id: initialData?.related_instruction_id || '',
    attachment: initialData?.attachment || ''
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({...formData, attachment: reader.result as string});
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.get('/departments').then(res => res.data),
      api.get('/central-bank-instructions').then(res => res.data)
    ])
    .then(([depts, instrs]) => {
      setDepartments(Array.isArray(depts) ? depts : []);
      setInstructions(Array.isArray(instrs) ? instrs : []);
      setLoading(false);
    })
    .catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = initialData ? `/central-bank-instructions/${initialData.id}` : '/central-bank-instructions';
    
    if (initialData) {
      await api.put(url, formData);
    } else {
      await api.post(url, formData);
    }
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input className="input-field" placeholder={t('common.name')} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
      <input type="date" className="input-field" value={formData.issue_date} onChange={e => setFormData({...formData, issue_date: e.target.value})} required />
      <input className="input-field" placeholder={t('common.referenceNumber')} value={formData.reference_number} onChange={e => setFormData({...formData, reference_number: e.target.value})} required />
      <input className="input-field" placeholder={t('common.category')} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} required />
      <textarea className="input-field" placeholder={t('common.description')} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
      
      <select className="input-field" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} required>
        <option value="Active">{t('common.active')}</option>
        <option value="Cancelled">{t('common.cancelled')}</option>
      </select>

      <select className="input-field" value={formData.related_instruction_id} onChange={e => setFormData({...formData, related_instruction_id: e.target.value})}>
        <option value="">{t('common.selectRelatedInstruction')}</option>
        {(Array.isArray(instructions) ? instructions : []).filter(i => i.id !== initialData?.id).map(i => (
          <option key={i.id} value={i.id}>{i.title} ({i.reference_number})</option>
        ))}
      </select>

      <div className="relative">
        <input 
          type="file" 
          id="regulatory-file"
          className="sr-only" 
          onChange={handleFileChange} 
        />
        <label 
          htmlFor="regulatory-file"
          className="input-field flex items-center justify-between cursor-pointer group hover:border-[var(--color-primary)]/50 transition-all"
        >
          <span className="text-[var(--color-text-muted)] font-bold truncate flex items-center gap-2">
            <Upload size={16} className="text-[var(--color-border-strong)] group-hover:text-[var(--color-primary)] transition-colors" />
            {formData.attachment ? t('common.fileSelected') : t('common.noFileChosen')}
          </span>
          <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
            {t('common.chooseFile')}
          </span>
        </label>
      </div>
      
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : error ? (
        <p className="text-red-500">{t('common.error')} {error}</p>
      ) : (
        <select className="input-field" value={formData.related_department} onChange={e => setFormData({...formData, related_department: e.target.value})} required>
          <option value="">{t('common.selectDepartment')}</option>
          {(Array.isArray(departments) ? departments : []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      )}
      <button type="submit" className="btn-primary w-full">{initialData ? t('common.update') : t('common.save')}</button>
    </form>
  );
};

export default RegulatoryForm;
