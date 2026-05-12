import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import api from '../services/api';
import { Upload } from 'lucide-react';

interface LegalFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

const LegalForm: React.FC<LegalFormProps> = ({ onSuccess, onClose }) => {
  const { token } = useAppContext();
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
          className="input-field flex items-center justify-between cursor-pointer group hover:border-primary/50 transition-all"
        >
          <span className="text-[var(--color-text-muted)] font-bold truncate flex items-center gap-2">
            <Upload size={16} className="text-[var(--color-border-strong)] group-hover:text-primary transition-colors" />
            {formData.attachment ? t('common.fileSelected') : t('common.noFileChosen')}
          </span>
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
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
      <button type="submit" className="btn-primary w-full">{t('common.save')}</button>
    </form>
  );
};

export default LegalForm;
