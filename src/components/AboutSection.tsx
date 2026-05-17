import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { Save, Edit2 } from 'lucide-react';
import api from '../services/api';
import { UserRole } from '../constants';
import logger from '../utils/logger';

const AboutSection: React.FC = () => {
  const { user } = useUser();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/app-settings');
      if (response.data) {
        setSettings(response.data);
        setEditForm(response.data);
      }
    } catch (err) {
      logger.error('Operation failed', err);
    }
  };

  const handleSave = async () => {
    try {
      await api.put('/app-settings', editForm);
      setIsEditing(false);
      fetchSettings();
    } catch (err) {
      logger.error('Operation failed', err);
    }
  };

  if (!settings) return <div>{t('loadingData')}</div>;

  const fields = [
    { label: t('about.app_name'), key: 'app_name' },
    { label: t('about.app_version'), key: 'app_version' },
    { label: t('about.app_description'), key: 'app_description' },
    { label: t('about.company_name'), key: 'company_name' },
    { label: t('about.system_owner'), key: 'system_owner' },
    { label: t('about.developer_name'), key: 'developer_name' },
    { label: t('about.release_date'), key: 'release_date' },
    { label: t('about.last_update_date'), key: 'last_update_date' },
    { label: t('about.support_email'), key: 'support_email' },
    { label: t('about.support_phone'), key: 'support_phone' },
    { label: t('about.official_website'), key: 'official_website' },
    { label: t('about.copyright_notice'), key: 'copyright_notice' },
    { label: t('about.system_environment'), key: 'system_environment' },
    { label: t('about.database_type'), key: 'database_type' },
    { label: t('about.build_number'), key: 'build_number' },
    { label: t('about.app_status'), key: 'app_status' },
  ];

  return (
    <div className="glass-card p-10 space-y-8 bg-[var(--color-card)] border border-[var(--color-border-soft)]">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-[var(--color-text-main)] uppercase tracking-widest">
          {t('settings.aboutApplication')}
        </h3>
        {user?.role === UserRole.ADMIN && (
          <button 
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            className="btn-primary flex items-center gap-2"
          >
            {isEditing ? <Save size={16} /> : <Edit2 size={16} />}
            {isEditing ? t('common.save') : t('common.edit')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{field.label}</label>
            {isEditing ? (
              <input 
                className="input-field"
                value={editForm[field.key] || ''}
                onChange={e => setEditForm({...editForm, [field.key]: e.target.value})}
              />
            ) : (
              <p className="text-sm font-bold text-[var(--color-text-main)]">{settings[field.key]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AboutSection;
