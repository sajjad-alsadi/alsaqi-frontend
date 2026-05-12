import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { Save } from 'lucide-react';
import api from '../services/api';

const PDFSettingsSection: React.FC = () => {
  const { token } = useAppContext();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [settings, setSettings] = useState<{
    arabic_font_name: string;
    arabic_font_size: number | string;
    heading_font_size: number | string;
    subheading_font_size: number | string;
    table_font_size: number | string;
    rtl_enabled: number;
    margin_top: number | string;
    margin_right: number | string;
    margin_bottom: number | string;
    margin_left: number | string;
    header_template: string;
    footer_template: string;
    logo_position: string;
    show_page_number: number;
  }>({
    arabic_font_name: 'Simplified Arabic',
    arabic_font_size: 14,
    heading_font_size: 16,
    subheading_font_size: 14,
    table_font_size: 14,
    rtl_enabled: 1,
    margin_top: 20,
    margin_right: 20,
    margin_bottom: 20,
    margin_left: 20,
    header_template: '',
    footer_template: '',
    logo_position: 'Right',
    show_page_number: 1
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/pdf-settings');
      if (res.data) {
        setSettings(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.put('/pdf-settings', settings);
      setMessage({ text: t('pdf.settingsSavedSuccessfully'), type: 'success' });
    } catch (err) {
      setMessage({ text: t('pdf.errorSavingSettings'), type: 'error' });
    }
  };

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' 
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
          : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          <span className="font-bold">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-[var(--color-text-main)] border-b border-[var(--color-border-soft)] pb-2">{t('pdf.fontSettings')}</h3>
          
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.arabicFontName')}</label>
            <input 
              type="text" 
              className="input-field" 
              value={settings.arabic_font_name || ''}
              onChange={e => setSettings({...settings, arabic_font_name: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.baseFontSize')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.arabic_font_size ?? ''}
                onChange={e => setSettings({...settings, arabic_font_size: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.headingFontSize')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.heading_font_size ?? ''}
                onChange={e => setSettings({...settings, heading_font_size: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.subheadingFontSize')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.subheading_font_size ?? ''}
                onChange={e => setSettings({...settings, subheading_font_size: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.tableFontSize')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.table_font_size ?? ''}
                onChange={e => setSettings({...settings, table_font_size: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-lg font-bold text-[var(--color-text-main)] border-b border-[var(--color-border-soft)] pb-2">{t('pdf.pageSettings')}</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.topMargin')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.margin_top ?? ''}
                onChange={e => setSettings({...settings, margin_top: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.bottomMargin')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.margin_bottom ?? ''}
                onChange={e => setSettings({...settings, margin_bottom: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.rightMargin')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.margin_right ?? ''}
                onChange={e => setSettings({...settings, margin_right: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.leftMargin')}</label>
              <input 
                type="number" 
                className="input-field" 
                value={settings.margin_left ?? ''}
                onChange={e => setSettings({...settings, margin_left: e.target.value === '' ? '' : parseInt(e.target.value)})}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 mt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-5 h-5 rounded border-[var(--color-border-strong)] text-primary focus:ring-[var(--color-primary)] bg-transparent"
                checked={settings.rtl_enabled === 1}
                onChange={e => setSettings({...settings, rtl_enabled: e.target.checked ? 1 : 0})}
              />
              <span className="font-bold text-[var(--color-text-main)]">{t('pdf.enableRtl')}</span>
            </label>
          </div>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-5 h-5 rounded border-[var(--color-border-strong)] text-primary focus:ring-[var(--color-primary)] bg-transparent"
                checked={settings.show_page_number === 1}
                onChange={e => setSettings({...settings, show_page_number: e.target.checked ? 1 : 0})}
              />
              <span className="font-bold text-[var(--color-text-main)]">{t('pdf.showPageNumber')}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-lg font-bold text-[var(--color-text-main)] border-b border-[var(--color-border-soft)] pb-2">{t('pdf.headerAndFooter')}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.headerText')}</label>
            <textarea 
              className="input-field min-h-[100px]" 
              value={settings.header_template || ''}
              onChange={e => setSettings({...settings, header_template: e.target.value})}
              placeholder={t('pdf.headerTextPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.footerText')}</label>
            <textarea 
              className="input-field min-h-[100px]" 
              value={settings.footer_template || ''}
              onChange={e => setSettings({...settings, footer_template: e.target.value})}
              placeholder={t('pdf.footerTextPlaceholder')}
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-bold text-[var(--color-text-main)] mb-2">{t('pdf.logoPosition')}</label>
          <select 
            className="input-field"
            value={settings.logo_position}
            onChange={e => setSettings({...settings, logo_position: e.target.value})}
          >
            <option value="Right">{t('common.right')}</option>
            <option value="Left">{t('common.left')}</option>
            <option value="Center">{t('common.center')}</option>
            <option value="None">{t('pdf.noLogo')}</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-[var(--color-border-soft)]">
        <button type="submit" className="btn-primary flex items-center gap-2">
          <Save size={20} />
          <span>{t('pdf.saveSettings')}</span>
        </button>
      </div>
    </form>
  );
};

export default PDFSettingsSection;
