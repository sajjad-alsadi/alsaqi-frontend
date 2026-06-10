import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import api from '../api/httpClient';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUploadValidation } from '../hooks/useFileUploadValidation';

interface LegalFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

const LegalForm: React.FC<LegalFormProps> = ({ onSuccess, onClose }) => {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    type: '',
    authority: '',
    issue_date: '',
    description: '',
    related_risk_area: '',
    keywords: '',
    department: '',
    attachment: ''
  });
  const { validateAndFilter } = useFileUploadValidation();

  useEffect(() => {
    if (!token) return;
    api.get('/departments')
      .then(res => {
        setDepartments(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validFiles = await validateAndFilter([file]);
      if (validFiles.length > 0) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData({...formData, attachment: reader.result as string});
        };
        reader.readAsDataURL(validFiles[0]!);
      } else {
        e.target.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/law-bank', formData);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input className="input-field" placeholder={t('common.title')} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
      <input className="input-field" placeholder={t('common.type')} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} required />
      <input className="input-field" placeholder={t('legal.authority')} value={formData.authority} onChange={e => setFormData({...formData, authority: e.target.value})} required />
      <input type="date" className="input-field" value={formData.issue_date} onChange={e => setFormData({...formData, issue_date: e.target.value})} required />
      <textarea className="input-field" placeholder={t('common.description')} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
      <div className="relative">
        <input 
          type="file" 
          id="legal-file"
          className="sr-only" 
          onChange={handleFileChange} 
        />
        <label 
          htmlFor="legal-file"
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
        <select className="input-field" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} required>
          <option value="">{t('common.selectDepartment')}</option>
          {(Array.isArray(departments) ? departments : []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      )}
      <input className="input-field" placeholder={t('legal.relatedRiskArea')} value={formData.related_risk_area} onChange={e => setFormData({...formData, related_risk_area: e.target.value})} required />
      <input className="input-field" placeholder={t('legal.keywords')} value={formData.keywords} onChange={e => setFormData({...formData, keywords: e.target.value})} required />
      <Button type="submit" className="w-full">{t('common.save')}</Button>
    </form>
  );
};

export default LegalForm;
