import React from 'react';
import { Settings, Shield, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface ManagementSettingsProps {
  settings: any;
  onUpdate: (data: any) => void;
  showSuccess?: boolean;
}

const ManagementSettings: React.FC<ManagementSettingsProps> = ({
  settings: initialSettings,
  onUpdate,
  showSuccess
}) => {
  const { t } = useTranslation();
  
  // Use local state for immediate feedback, synced with props
  const [settings, setLocalSettings] = React.useState<any>(null);

  React.useEffect(() => {
    if (initialSettings) {
      setLocalSettings(initialSettings);
    } else {
      // Provide defaults if not loaded yet
      setLocalSettings({
        failed_login_threshold: 3,
        inactive_account_threshold_days: 90,
        password_min_length: 8,
        password_expiry_days: 90,
        session_timeout_minutes: 30,
        password_require_symbols: 0,
        two_factor_auth: 0
      });
    }
  }, [initialSettings]);

  if (!settings) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
      <p className="text-[var(--color-text-muted)] font-bold uppercase tracking-widest text-xs">{t('common.loading')}</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {showSuccess && (
        <div className="p-6 rounded-xl flex items-center gap-4 border bg-[var(--color-success)]/10 border-[var(--color-success)]/20 text-[var(--color-success)]">
          <CheckCircle size={20} />
          <span className="font-bold text-sm">{t('settingsSavedSuccessfully')}</span>
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center text-[var(--color-primary)]">
          <Settings size={24} />
         </div>
         <div>
           <h3 className="text-2xl font-bold text-[var(--color-text-main)]">{t('userManagement.settings.title')}</h3>
           <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{t('userManagement.settings.subtitle')}</p>
         </div>
       </div>
 
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div className="glass-card p-8 space-y-8">
           <div className="flex items-center gap-3 text-[var(--color-text-main)]">
             <Lock size={20} className="text-[var(--color-primary)]" />
             <h4 className="text-lg font-bold">{t('userManagement.settings.passwordPolicy')}</h4>
           </div>
           
           <div className="space-y-6">
             <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)]">
               <div>
                 <p className="text-sm font-bold text-[var(--color-text-main)]">{t('userManagement.settings.minPasswordLength')}</p>
                 <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{t('userManagement.settings.characters')}</p>
               </div>
               <input 
                 type="number" 
                 className="w-20 input-field py-2 text-center" 
                 value={settings.password_min_length ?? 8}
                 onChange={(e) => {
                   const val = e.target.value;
                   setLocalSettings({ ...settings, password_min_length: val === '' ? '' : parseInt(val) });
                 }}
               />
             </div>
 
             <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)]">
               <div>
                 <p className="text-sm font-bold text-[var(--color-text-main)]">{t('userManagement.settings.requireSpecialChars')}</p>
                 <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{t('userManagement.settings.complexity')}</p>
               </div>
               <label className="relative inline-flex items-center cursor-pointer">
                 <input 
                   type="checkbox" 
                   className="sr-only peer"
                   checked={!!settings.password_require_symbols}
                   onChange={(e) => setLocalSettings({ ...settings, password_require_symbols: e.target.checked ? 1 : 0 })}
                 />
                 <div className="w-11 h-6 bg-[var(--color-border-soft)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[var(--color-card)] after:border-[var(--color-border-strong)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
               </label>
             </div>
 
             <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)]">
               <div>
                 <p className="text-sm font-bold text-[var(--color-text-main)]">{t('userManagement.settings.passwordExpiryDays')}</p>
                 <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{t('userManagement.settings.days')}</p>
               </div>
               <input 
                 type="number" 
                 className="w-20 input-field py-2 text-center" 
                 value={settings.password_expiry_days ?? 90}
                 onChange={(e) => {
                   const val = e.target.value;
                   setLocalSettings({ ...settings, password_expiry_days: val === '' ? '' : parseInt(val) });
                 }}
               />
             </div>
           </div>
         </div>
 
         <div className="glass-card p-8 space-y-8">
           <div className="flex items-center gap-3 text-[var(--color-text-main)]">
             <Shield size={20} className="text-[var(--color-primary)]" />
             <h4 className="text-lg font-bold">{t('userManagement.settings.accountSecurity')}</h4>
           </div>
 
           <div className="space-y-6">
             <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)]">
               <div>
                 <p className="text-sm font-bold text-[var(--color-text-main)]">{t('userManagement.settings.maxLoginAttempts')}</p>
                 <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{t('userManagement.settings.beforeLockout')}</p>
               </div>
               <input 
                 type="number" 
                 className="w-20 input-field py-2 text-center" 
                 value={settings.failed_login_threshold ?? 3}
                 onChange={(e) => {
                   const val = e.target.value;
                   setLocalSettings({ ...settings, failed_login_threshold: val === '' ? '' : parseInt(val) });
                 }}
               />
             </div>
 
             <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)]">
               <div>
                 <p className="text-sm font-bold text-[var(--color-text-main)]">{t('userManagement.settings.sessionTimeoutMinutes')}</p>
                 <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{t('userManagement.settings.minutes')}</p>
               </div>
               <input 
                 type="number" 
                 className="w-20 input-field py-2 text-center" 
                 value={settings.session_timeout_minutes ?? 30}
                 onChange={(e) => {
                   const val = e.target.value;
                   setLocalSettings({ ...settings, session_timeout_minutes: val === '' ? '' : parseInt(val) });
                 }}
               />
             </div>
 
             <div className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl border border-[var(--color-border-soft)]">
               <div>
                 <p className="text-sm font-bold text-[var(--color-text-main)]">{t('userManagement.settings.twoFactorAuth')}</p>
                 <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{t('userManagement.settings.recommended')}</p>
               </div>
               <label className="relative inline-flex items-center cursor-pointer">
                 <input 
                   type="checkbox" 
                   className="sr-only peer"
                   checked={!!settings.two_factor_auth}
                   onChange={(e) => setLocalSettings({ ...settings, two_factor_auth: e.target.checked ? 1 : 0 })}
                 />
                 <div className="w-11 h-6 bg-[var(--color-border-soft)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[var(--color-card)] after:border-[var(--color-border-strong)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
               </label>
             </div>
           </div>
         </div>
 
         <div className="lg:col-span-2 p-6 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 rounded-3xl flex items-start gap-4">
           <AlertCircle className="text-[var(--color-warning)] mt-1" size={20} />
           <div>
             <p className="text-sm font-bold text-[var(--color-warning)]">{t('userManagement.settings.securityAdvisory')}</p>
             <p className="text-xs font-bold text-[var(--color-warning)] opacity-80 mt-1">
               {t('userManagement.settings.securityAdvisoryNote')}
             </p>
           </div>
         </div>
 
         <div className="lg:col-span-2 flex justify-end pt-4">
           <Button 
             onClick={() => onUpdate(settings)}
             className="px-10 py-4"
           >
             {t('common.save')}
           </Button>
         </div>
       </div>
     </div>
   );
};

export default ManagementSettings;
