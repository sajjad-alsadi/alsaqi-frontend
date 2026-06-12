import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUser } from '../../context/UserContext';
import { usePreferences } from '../../context/PreferencesContext';
import api from '../../api/httpClient';
import { extractErrorMessage } from '../../utils/errorService';
import { useTranslation } from 'react-i18next';
import { 
  User, Lock, Settings as SettingsIcon, Shield, 
  Camera, Check, AlertCircle, LogOut, Globe, 
  Bell, Layout as LayoutIcon, Info, X, Sun
} from 'lucide-react';
import { Language, UserRole } from '../../constants';
import { motion, AnimatePresence } from 'motion/react';
import AboutSection from '../../components/AboutSection';
import { useFileUploadValidation } from '../../hooks/useFileUploadValidation';
import PDFSettingsSection from '../../components/PDFSettingsSection';
import { useDepartments } from '../../hooks/useDepartments';
import { PdfTemplateManagement } from '../../components/PdfTemplateManagement';
import logger from '../../utils/logger';
import Portal from '../../components/Portal';
import { Button } from '@/components/ui/button';

type SettingsTab = 'profile' | 'password' | 'preferences' | 'security' | 'about' | 'pdf';

interface ProfileData {
  name?: string;
  email?: string;
  department?: string;
  profile_picture?: string;
  job_title?: string;
  role?: string;
  employee_id?: string | number;
  username?: string;
  id?: string | number;
  last_login?: string;
}

const Settings: React.FC = () => {
  const { token } = useAuth();
  const { user, updateUser } = useUser();
  const { language, setLanguage, theme, setTheme, dashboardLayout, setDashboardLayout } = usePreferences();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const { departments } = useDepartments();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [profileForm, setProfileForm] = useState({ name: '', email: '', department: '', profile_picture: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [preferences, setPreferences] = useState({ 
    notifications: true, 
    layout: dashboardLayout,
    theme: theme,
    notifyOn: {
      newAudit: true,
      updates: true,
      alerts: true,
      users: true
    }
  });

  const [showLogoutAllModal, setShowLogoutAllModal] = useState(false);
  const { validateAndFilter } = useFileUploadValidation({
    allowedExtensions: ['.jpg', '.jpeg', '.png'],
    allowedMimeTypes: ['image/jpeg', 'image/png'],
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/profile');
      const data = res.data;
      setProfile(data);
      setProfileForm({
        name: data.name || '',
        email: data.email || '',
        department: data.department || '',
        profile_picture: data.profile_picture || ''
      });
      setPreferences(prev => ({
        ...prev,
        notifications: data.notifications_enabled === 1,
        layout: data.dashboard_layout || 'standard',
        theme: data.theme || 'light'
      }));
    } catch (err) {
      logger.error('Operation failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/profile', profileForm);
      setMessage({ text: t('settings.profileUpdated'), type: 'success' });
      updateUser(profileForm);
      fetchProfile();
    } catch (err) {
      logger.error('Operation failed', err);
      const errorMsg = extractErrorMessage(err, t('common.error'));
      setMessage({ text: errorMsg, type: 'error' });
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ text: t('settings.passwordsDoNotMatch'), type: 'error' });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setMessage({ text: t('settings.passwordRequirements'), type: 'error' });
      return;
    }

    try {
      await api.post('/auth/update-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setMessage({ text: t('settings.passwordChanged'), type: 'success' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const errorMsg = extractErrorMessage(err, t('failedToChangePassword'));
      setMessage({ text: errorMsg, type: 'error' });
    }
  };

  const handleLogoutAll = async () => {
    try {
      await api.post('/auth/logout-all');
      window.location.reload(); // Force logout current session too
    } catch (err) {
      logger.error('Operation failed', err);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validFiles = await validateAndFilter([file]);
      if (validFiles.length > 0) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setProfileForm(prev => ({ ...prev, profile_picture: reader.result as string }));
        };
        reader.readAsDataURL(validFiles[0]!);
      } else {
        e.target.value = '';
      }
    }
  };

  const handlePreferencesUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await api.put('/preferences', {
        language,
        dashboard_layout: dashboardLayout,
        theme: theme,
        notifications_enabled: preferences.notifications
      });
      setMessage({ text: t('settings.profileUpdated'), type: 'success' });
    } catch (err) {
      setMessage({ text: t('settings.errorUpdatingPreferences'), type: 'error' });
    }
  };

  if (loading) return <div className="p-10 text-center font-bold text-[var(--color-text-muted)]">{t('settings.loadingSettings')}</div>;

  const tabs = [
    { id: 'profile', label: t('common.profile'), icon: User },
    { id: 'password', label: t('common.password'), icon: Lock },
    { id: 'preferences', label: t('settings.preferences'), icon: SettingsIcon },
    { id: 'security', label: t('settings.security'), icon: Shield },
    { id: 'about', label: t('settings.aboutApplication'), icon: Info },
  ];

  if (user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER) {
    tabs.push({ id: 'pdf', label: t('settings.pdfSettings'), icon: LayoutIcon });
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
            <SettingsIcon size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('common.settings')}</h2>
            <p className="text-sm text-[var(--color-text-muted)] font-bold mt-2">{t('settings.manageAccountAndPreferences')}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Sidebar Tabs */}
        <div className="lg:w-80 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as SettingsTab);
                setMessage(null);
              }}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl font-bold transition-all duration-300 ${
                activeTab === tab.id 
                ? 'bg-[var(--color-primary)] text-white shadow-xl shadow-[var(--color-primary)]/20' 
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-primary)]'
              }`}
            >
              <tab.icon size={20} />
              <span className="uppercase tracking-widest text-xs">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-card p-10"
            >
              {activeTab !== 'about' && message && (
                <div className={`mb-8 p-6 rounded-xl flex items-center gap-4 border ${
                  message.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                  : 'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                  <span className="font-bold text-sm">{message.text}</span>
                </div>
              )}

              {activeTab === 'about' && <AboutSection />}

              {activeTab === 'profile' && (
                <form onSubmit={handleProfileUpdate} className="space-y-8">
                  <div className="flex flex-col md:flex-row items-center gap-10 mb-10">
                    <div className="relative group">
                      <div className="w-32 h-32 rounded-2xl bg-[var(--color-bg-main)] overflow-hidden shadow-inner border-4 border-white">
                        {profileForm.profile_picture ? (
                          <img src={profileForm.profile_picture} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--color-border-strong)]">
                            <User size={48} />
                          </div>
                        )}
                      </div>
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-2 -end-2 w-10 h-10 bg-[var(--color-primary)] text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                      >
                        <Camera size={18} />
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleFileChange}
                      />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-[var(--color-text-main)]">{profile?.name}</h3>
                      <p className="text-sm text-[var(--color-text-muted)] font-bold uppercase tracking-widest mt-1">{profile?.job_title || profile?.role} • {profile?.department}</p>
                      <p className="text-xs text-[var(--color-primary)] font-bold mt-2">{t('settings.userId')}{profile?.employee_id || profile?.username || profile?.id}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-3">{t('settings.name')}</label>
                      <input 
                        type="text" 
                        className="input-field"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-3">{t('settings.email')}</label>
                      <input 
                        type="email" 
                        className="input-field"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-3">{t('settings.department')}</label>
                      <select 
                        className="input-field"
                        value={profileForm.department}
                        onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                      >
                        <option value="">{t('plan.selectDepartment')}</option>
                        {(Array.isArray(departments) ? departments : []).map(dept => (
                          <option key={dept.id} value={dept.name}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-3">{t('settings.role')}</label>
                      <input 
                        type="text" 
                        disabled
                        className="input-field bg-[var(--color-bg-soft)] opacity-60 cursor-not-allowed"
                        value={profile?.role}
                      />
                    </div>
                  </div>

                  <div className="pt-8 border-t border-[var(--color-border-soft)]">
                    <Button type="submit">
                      {t('settings.updateProfile')}
                    </Button>
                  </div>
                </form>
              )}

              {activeTab === 'password' && (
                <form onSubmit={handlePasswordChange} className="space-y-8">
                  <div className="max-w-md space-y-8">
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-3">{t('settings.currentPassword')}</label>
                      <input 
                        type="password" 
                        required
                        className="input-field"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-3">{t('settings.newPassword')}</label>
                      <input 
                        type="password" 
                        required
                        className="input-field"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      />
                      <p className="text-[10px] text-[var(--color-text-muted)] font-bold mt-2">{t('settings.passwordRequirements')}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-3">{t('settings.confirmPassword')}</label>
                      <input 
                        type="password" 
                        required
                        className="input-field"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="pt-8 border-t border-[var(--color-border-soft)]">
                    <Button type="submit">
                      {t('settings.changePassword')}
                    </Button>
                  </div>
                </form>
              )}

              {activeTab === 'preferences' && (
                <form onSubmit={handlePreferencesUpdate} className="space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <Globe size={20} className="text-[var(--color-primary)]" />
                        <h4 className="font-bold text-[var(--color-text-main)] uppercase tracking-widest text-xs">{t('common.language')}</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          type="button"
                          onClick={() => setLanguage(Language.EN)}
                          className={`px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${
                            language === Language.EN ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border-soft)] text-[var(--color-text-muted)]'
                          }`}
                        >
                          {t('common.english')}
                        </button>
                        <button 
                          type="button"
                          onClick={() => setLanguage(Language.AR)}
                          className={`px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${
                            language === Language.AR ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border-soft)] text-[var(--color-text-muted)]'
                          }`}
                        >
                          {t('common.arabic')}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <Sun size={20} className="text-[var(--color-primary)]" />
                        <h4 className="font-bold text-[var(--color-text-main)] uppercase tracking-widest text-xs">{t('settings.theme')}</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          type="button"
                          onClick={() => setTheme('light')}
                          className={`px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${
                            theme === 'light' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border-soft)] text-[var(--color-text-muted)]'
                          }`}
                        >
                          {t('settings.light')}
                        </button>
                        <button 
                          type="button"
                          onClick={() => setTheme('dark')}
                          className={`px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${
                            theme === 'dark' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border-soft)] text-[var(--color-text-muted)]'
                          }`}
                        >
                          {t('settings.dark')}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <Bell size={20} className="text-[var(--color-primary)]" />
                        <h4 className="font-bold text-[var(--color-text-main)] uppercase tracking-widest text-xs">{t('common.notifications')}</h4>
                      </div>
                      <label className="flex items-center justify-between p-4 bg-[var(--color-bg-soft)] rounded-2xl cursor-pointer hover:bg-[var(--color-bg-main)] transition-colors">
                        <span className="text-sm font-bold text-[var(--color-text-muted)]">{t('settings.notificationsEnabled')}</span>
                        <input 
                          type="checkbox" 
                          className="w-6 h-6 rounded-lg border-2 border-[var(--color-border-soft)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-transparent"
                          checked={preferences.notifications}
                          onChange={(e) => setPreferences({ ...preferences, notifications: e.target.checked })}
                        />
                      </label>

                      {preferences.notifications && (
                        <div className="space-y-3 ps-4 border-s-2 border-[var(--color-border-soft)]">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-transparent"
                              checked={preferences.notifyOn.newAudit}
                              onChange={(e) => setPreferences({ ...preferences, notifyOn: { ...preferences.notifyOn, newAudit: e.target.checked } })}
                            />
                            <span className="text-xs font-bold text-[var(--color-text-muted)]">{t('settings.newAuditPlans')}</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-transparent"
                              checked={preferences.notifyOn.updates}
                              onChange={(e) => setPreferences({ ...preferences, notifyOn: { ...preferences.notifyOn, updates: e.target.checked } })}
                            />
                            <span className="text-xs font-bold text-[var(--color-text-muted)]">{t('settings.updatesAndChanges')}</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-transparent"
                              checked={preferences.notifyOn.alerts}
                              onChange={(e) => setPreferences({ ...preferences, notifyOn: { ...preferences.notifyOn, alerts: e.target.checked } })}
                            />
                            <span className="text-xs font-bold text-[var(--color-text-muted)]">{t('settings.systemAlerts')}</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-transparent"
                              checked={preferences.notifyOn.users}
                              onChange={(e) => setPreferences({ ...preferences, notifyOn: { ...preferences.notifyOn, users: e.target.checked } })}
                            />
                            <span className="text-xs font-bold text-[var(--color-text-muted)]">{t('settings.userActivities')}</span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2 space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <LayoutIcon size={20} className="text-[var(--color-primary)]" />
                        <h4 className="font-bold text-[var(--color-text-main)] uppercase tracking-widest text-xs">{t('settings.dashboardLayout')}</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {['standard', 'compact', 'detailed'].map((l) => (
                          <button 
                            key={l}
                            type="button"
                            onClick={() => setDashboardLayout(l as "compact" | "standard" | "detailed")}
                            className={`px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${
                              dashboardLayout === l ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-[var(--color-border-soft)] text-[var(--color-text-muted)]'
                            }`}
                          >
                            {t(`settings.${l}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-[var(--color-border-soft)]">
                    <Button type="submit">
                      {t('common.save')} {t('settings.preferences')}
                    </Button>
                  </div>
                </form>
              )}

              {activeTab === 'security' && (
                <div className="space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <h4 className="font-bold text-[var(--color-text-main)] uppercase tracking-widest text-xs mb-4">{t('settings.loginActivity')}</h4>
                      <div className="p-6 bg-[var(--color-bg-soft)] rounded-xl border border-[var(--color-border-soft)]">
                        <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest mb-2">{t('settings.lastLogin')}</p>
                        <p className="text-sm font-bold text-[var(--color-text-main)]">{profile?.last_login ? new Date(profile.last_login).toLocaleString() : t('settings.never')}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h4 className="font-bold text-[var(--color-text-main)] uppercase tracking-widest text-xs mb-4">{t('settings.activeSessions')}</h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-6 bg-emerald-50 rounded-xl border border-emerald-100">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-[var(--color-card)] rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                              <LayoutIcon size={20} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-emerald-800">{t('settings.currentSession')}</p>
                              <p className="text-[10px] text-emerald-600 font-bold">{t('settings.activeNow')}</p>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-[var(--color-card)] text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-widest">{t('settings.online')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-10 border-t border-[var(--color-border-soft)]">
                    <div className="bg-rose-50 p-10 rounded-2xl border border-rose-100 flex flex-col md:flex-row items-center justify-between gap-8">
                      <div>
                        <h4 className="text-xl font-bold text-rose-900 mb-2">{t('settings.logoutEverywhere')}</h4>
                        <p className="text-sm text-rose-600 font-medium leading-relaxed">{t('settings.invalidateAllSessions')}</p>
                      </div>
                      <button 
                        onClick={() => setShowLogoutAllModal(true)}
                        className="px-10 py-4 bg-rose-600 text-white font-bold rounded-xl shadow-2xl shadow-rose-200 hover:bg-rose-700 transition-all uppercase tracking-widest text-xs flex items-center gap-3"
                      >
                        <LogOut size={18} />
                        {t('settings.logoutAll')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'pdf' && (
                <div className="space-y-10">
                  <div>
                    <h3 className="text-2xl font-bold text-[var(--color-text-main)] mb-2">{t('settings.pdfSettings')}</h3>
                    <p className="text-sm text-[var(--color-text-muted)] font-bold">{t('settings.pdfSettingsDesc')}</p>
                  </div>
                  <PDFSettingsSection />
                  
                  <div className="pt-10 border-t border-[var(--color-border-soft)] mt-10">
                    <PdfTemplateManagement />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Portal>
        {showLogoutAllModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-[var(--color-border-soft)] flex justify-between items-center bg-[var(--color-bg-soft)]">
                <h2 className="text-lg font-bold text-[var(--color-text-main)]">{t('settings.logoutFromAllDevices')}</h2>
                <button onClick={() => setShowLogoutAllModal(false)} className="p-1 hover:bg-[var(--color-bg-main)] rounded-full"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t('settings.logoutFromAllDevicesConfirm')}
                </p>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowLogoutAllModal(false)} className="flex-1 px-4 py-2 border border-[var(--color-border-strong)] rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)]">{t('common.cancel')}</button>
                  <button 
                    onClick={handleLogoutAll} 
                    className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700"
                  >
                    {t('settings.logoutFromAllDevices')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </Portal>
    </div>
  );
};

export default Settings;
