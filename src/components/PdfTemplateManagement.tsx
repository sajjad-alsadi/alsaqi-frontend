import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus, Edit2, Trash2, CheckCircle, X, Search, Globe, Layout, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';

interface PdfTemplate {
  id: string;
  template_name: string;
  template_type: string;
  content: string;
  status: string;
  is_default: number;
  version: number;
  created_by: string;
  updated_at: string;
}

export const PdfTemplateManagement: React.FC = () => {
  const { t } = useTranslation();
  
  const TEMPLATE_TYPES = [
    t('pdfTemplates.auditReport'),
    t('pdfTemplates.quarterlyReport'),
    t('pdfTemplates.annualReport'),
    t('pdfTemplates.auditPlan'),
    t('pdfTemplates.auditMissions'),
    t('pdfTemplates.recommendations'),
    t('pdfTemplates.outgoingLetter'),
    t('pdfTemplates.general')
  ];

  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PdfTemplate | null>(null);
  
  const [formData, setFormData] = useState({
    template_name: '',
    template_type: t('pdfTemplates.auditReport'),
    content: '',
    status: 'Draft',
    is_default: false
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/pdf-templates');
      setTemplates(res.data);
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('pdfTemplates.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const openModal = (template?: PdfTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        template_name: template.template_name,
        template_type: template.template_type,
        content: template.content,
        status: template.status,
        is_default: template.is_default === 1
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        template_name: '',
        template_type: t('pdfTemplates.auditReport'),
        content: `<div dir="rtl" style="font-family: 'Simplified Arabic', Arial; padding: 20px;">
  <h1 style="text-align: center; color: #1a565c;">{{template_type}}</h1>
  <p><strong>${t('pdfTemplates.reportNum')}</strong> {{report_number}}</p>
  <p><strong>${t('pdfTemplates.date')}</strong> {{report_date}}</p>
  <br/>
  <h2>${t('pdfTemplates.notes')}</h2>
  <ul>
    {{#findings}}
      <li>
        <strong>{{title}}</strong>: {{description}}<br/>
        ${t('pdfTemplates.classification')} {{risk_level}}
      </li>
    {{/findings}}
  </ul>
</div>`,
        status: 'Draft',
        is_default: false
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await api.put(`/pdf-templates/${editingTemplate.id}`, formData);
        toast.success(t('pdfTemplates.updateSuccess'));
      } else {
        await api.post('/pdf-templates', formData);
        toast.success(t('pdfTemplates.createSuccess'));
      }
      setShowModal(false);
      fetchTemplates();
    } catch (err: any) {
      const apiError = err.response?.data?.error;
      const errorMsg = typeof apiError === 'string' ? apiError : (apiError?.message || t('pdfTemplates.saveError'));
      toast.error(errorMsg);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('pdfTemplates.confirmDelete'))) {
      try {
        await api.delete(`/pdf-templates/${id}`);
        toast.success(t('pdfTemplates.deleteSuccess'));
        fetchTemplates();
      } catch (err) {
        toast.error(t('pdfTemplates.deleteError'));
      }
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.template_name.toLowerCase().includes(search.toLowerCase()) || 
    t.template_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text-main)]">{t('pdfTemplates.title')}</h2>
          <p className="text-[var(--color-text-muted)] text-sm font-bold mt-1">{t('pdfTemplates.subtitle')}</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          {t('pdfTemplates.createNew')}
        </button>
      </div>

      <div className="glass-card p-6">
        <div className="relative mb-6">
          <Search className="absolute end-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={20} />
          <input 
            type="text" 
            placeholder={t('pdfTemplates.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ps-4 pe-12 py-3 rounded-2xl border-2 border-[var(--color-border-soft)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all font-bold"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-[var(--color-text-muted)]">{t('common.loading')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map(template => (
              <div key={template.id} className="border-2 border-[var(--color-border-soft)] rounded-xl p-6 hover:shadow-xl hover:shadow-[var(--color-primary)]/5 transition-all bg-[var(--color-card)] relative group flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <div className="flex gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openModal(template)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] bg-[var(--color-bg-soft)] rounded-lg">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(template.id)} className="p-2 text-[var(--color-text-muted)] hover:text-rose-600 bg-[var(--color-bg-soft)] rounded-lg">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <h3 className="font-bold text-lg text-[var(--color-text-main)] mb-1">{template.template_name}</h3>
                <p className="text-sm font-bold text-[var(--color-text-muted)] mb-4">{template.template_type}</p>
                
                <div className="mt-auto space-y-3 pt-4 border-t border-[var(--color-border-soft)]">
                  <div className="flex justify-between items-center text-xs font-bold text-[var(--color-text-muted)]">
                    <span className="flex items-center gap-1"><User size={14} /> {template.created_by}</span>
                    <span dir="ltr">v{template.version}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      template.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 
                      template.status === 'Draft' ? 'bg-amber-100 text-amber-700' : 'bg-[var(--color-bg-main)] text-[var(--color-text-main)]'
                    }`}>
                      {template.status === 'Approved' ? t('status.approved') : template.status === 'Draft' ? t('status.draft') : template.status}
                    </span>
                    {template.is_default === 1 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1 rounded-full">
                        <CheckCircle size={12} /> {t('pdfTemplates.default')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <div className="col-span-full p-10 text-center text-[var(--color-text-muted)] font-bold">
                {t('pdfTemplates.noMatch')}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--color-card)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-[var(--color-border-soft)] flex justify-between items-center bg-[var(--color-bg-soft)]/50">
                <h3 className="text-xl font-bold text-[var(--color-text-main)]">
                  {editingTemplate ? t('pdfTemplates.editTemplate') : t('pdfTemplates.createNew')}
                </h3>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-[var(--color-card)] text-[var(--color-text-muted)] hover:text-rose-500 shadow-sm transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <form id="templateForm" onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">{t('pdfTemplates.templateName')}</label>
                      <input 
                        type="text" 
                        required
                        className="input-field"
                        value={formData.template_name}
                        onChange={(e) => setFormData({...formData, template_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">{t('pdfTemplates.reportType')}</label>
                      <select 
                        required
                        className="input-field"
                        value={formData.template_type}
                        onChange={(e) => setFormData({...formData, template_type: e.target.value})}
                      >
                        {TEMPLATE_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">{t('pdfTemplates.templateStatus')}</label>
                      <select 
                        className="input-field"
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                      >
                        <option value="Draft">{t('status.draft')}</option>
                        <option value="Approved">{t('status.approved')}</option>
                        <option value="Archived">{t('status.archived')}</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                          checked={formData.is_default}
                          onChange={(e) => setFormData({...formData, is_default: e.target.checked})}
                        />
                        <span className="font-bold text-[var(--color-text-main)]">{t('pdfTemplates.setAsDefault')}</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('pdfTemplates.templateContent')}</label>
                      <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 rounded">{t('pdfTemplates.supportsHandlebars')}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-3 font-medium">{t('pdfTemplates.variablesHint')} <code className="bg-[var(--color-bg-main)] px-1 py-0.5 rounded text-rose-500">{"{{report_number}}"}</code> {t('pdfTemplates.loopsHint')} <code className="bg-[var(--color-bg-main)] px-1 py-0.5 rounded text-rose-500">{"{{#findings}} ... {{/findings}}"}</code></p>
                    <textarea 
                      required
                      className="w-full h-80 p-4 rounded-2xl border-2 border-[var(--color-border-soft)] font-mono text-sm leading-relaxed focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all bg-[var(--color-bg-soft)] text-left"
                      dir="ltr"
                      value={formData.content}
                      onChange={(e) => setFormData({...formData, content: e.target.value})}
                      placeholder={t('pdfTemplates.htmlPlaceholder')}
                    ></textarea>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-[var(--color-border-soft)] bg-[var(--color-bg-soft)] flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  {t('common.cancel')}
                </button>
                <button type="submit" form="templateForm" className="btn-primary">
                  {t('pdfTemplates.saveTemplate')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
