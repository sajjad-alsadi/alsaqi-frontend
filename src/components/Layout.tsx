import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useNotificationContext } from '../context/NotificationContext';
import { useTranslation } from 'react-i18next';
import NotificationBell from './NotificationBell';
import { motion, AnimatePresence } from 'motion/react';
import InteractiveIcon from './InteractiveIcon';
import Logo from './Logo';
import LanguageSwitcher from './LanguageSwitcher';
import Chatbot from './Chatbot';
import { useFormat } from '../services/formatService';
import { 
  LayoutDashboard, 
  CalendarRange, 
  ClipboardCheck, 
  Library, 
  FileSearch, 
  TrendingUp, 
  ShieldAlert, 
  Building2, 
  Building,
  Scale, 
  AlertCircle, 
  AlertTriangle,
  History, 
  Settings, 
  Users,
  LogOut,
  Bell,
  Globe,
  User as UserIcon,
  ChevronRight,
  ChevronLeft,
  Network,
  FileText,
  Briefcase,
  Moon,
  Sun,
  BookOpen,
  BarChart3,
  Users2,
  Menu,
  X,
  ShieldCheck,
  Terminal
} from 'lucide-react';
import { Language } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout, language, setLanguage, theme, setTheme } = useAppContext();
  const { unreadCount } = useNotificationContext();
  const { t, i18n } = useTranslation();
  const { formatNumber, translateName } = useFormat();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isRTL = i18n.language === 'ar';

  const activeTab = location.pathname.substring(1) || 'dashboard';

  const menuItems = [
    { id: 'dashboard', label: t('common.dashboard'), icon: LayoutDashboard, path: '/dashboard' },
    { id: 'charter', label: t('common.auditCharter'), icon: BookOpen, path: '/charter' },
    { id: 'plan', label: t('common.auditPlan'), icon: CalendarRange, path: '/plan' },
    { id: 'tasks', label: t('common.tasks'), icon: ClipboardCheck, path: '/tasks' },
    { id: 'library', label: t('common.library'), icon: Library, path: '/library' },
    { id: 'findings', label: t('common.findings'), icon: FileSearch, path: '/findings' },
    { id: 'evidence', label: t('common.evidence'), icon: FileText, path: '/evidence' },
    { id: 'recommendations', label: t('common.recommendations'), icon: TrendingUp, path: '/recommendations' },
    { id: 'risks', label: t('common.risks'), icon: ShieldAlert, path: '/risks' },
    { id: 'compliance-matrix', label: t('common.complianceMatrix'), icon: ShieldCheck, path: '/compliance-matrix' },
    { id: 'integrity', label: t('common.integrityManagement'), icon: Scale, path: '/integrity' },
    { id: 'departments', label: t('common.departments'), icon: Building, path: '/departments' },
    { id: 'reports', label: t('common.reportsAndAnalytics'), icon: BarChart3, path: '/reports' },
    { id: 'cms', label: t('common.cms'), icon: Network, path: '/cms' },
    { id: 'notifications', label: t('common.notifications'), icon: Bell, path: '/notifications', badge: unreadCount > 0 ? formatNumber(unreadCount) : undefined },
  ];

  if (user?.role === 'Admin' || user?.role === 'Administrator') {
    menuItems.push({ id: 'users', label: t('common.users'), icon: Users, path: '/users' });
    menuItems.push({ id: 'system-logs', label: t('SystemLogsManagement'), icon: Terminal, path: '/system-logs' });
  }

  menuItems.push({ id: 'settings', label: t('common.settings'), icon: Settings, path: '/settings' });

  return (
    <div className={`flex min-h-screen bg-[var(--color-bg-main)] transition-colors duration-300 ${isRTL ? 'font-sans' : ''} ${theme === 'dark' ? 'dark' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Sidebar Overlay for Mobile */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${isCollapsed ? 'w-24' : 'w-72'} ${isMobileMenuOpen ? 'fixed inset-y-0 start-0 z-50' : 'hidden md:flex'} bg-[var(--color-card)] border-e border-[var(--color-border-soft)] h-screen sticky top-0 flex-col p-6 overflow-y-auto transition-all duration-500 ease-in-out shadow-sm`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} mb-10 px-2`}>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <Logo size={40} className="text-[var(--color-primary)]" />
              <div className="flex flex-col gap-1">
                <h1 className="font-bold text-xl text-[var(--color-text-main)] tracking-tight leading-tight uppercase">{t('common.brandName')}</h1>
                <span className="text-[10px] font-semibold text-[var(--color-primary)] tracking-[0.15em] uppercase">{t('common.auditSystem')}</span>
              </div>
            </motion.div>
          )}
          {isCollapsed && (
            <Logo size={40} className="text-[var(--color-primary)]" />
          )}
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-2 rounded-full hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] transition-colors ${isCollapsed ? 'mt-4' : ''} hidden md:block`}
          >
            {isRTL ? (
              isCollapsed ? <ChevronLeft size={20} /> : <ChevronRight size={20} />
            ) : (
              isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => (
            <div key={item.id} className="relative group">
              <motion.button
                whileHover={{ scale: 1.02, x: isCollapsed ? 0 : (isRTL ? -4 : 4) }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  navigate(item.path);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-2xl transition-all relative ${
                  activeTab === item.id 
                    ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20' 
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] hover:text-[var(--color-primary)] font-semibold'
                }`}
              >
                <item.icon size={20} className={activeTab === item.id ? 'text-white' : ''} />
                {!isCollapsed && (
                  <motion.span 
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    className="font-semibold text-sm whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
                {item.badge && (
                  <span className={`absolute ${isCollapsed ? '-top-1 -end-1' : 'end-4'} w-5 h-5 bg-[var(--color-danger)] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white`}>
                    {item.badge}
                  </span>
                )}
              </motion.button>
              
              {isCollapsed && (
                <div className={`absolute start-full ms-4 top-1/2 -translate-y-1/2 px-3 py-2 bg-[var(--color-text-main)] text-[var(--color-bg-main)] text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl`}>
                  {item.label}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="mt-8 pt-6 border-t border-[var(--color-border-soft)]">
          <div className="relative group">
            <motion.button 
              whileHover={{ scale: 1.02, x: isCollapsed ? 0 : (isRTL ? -4 : 4) }}
              whileTap={{ scale: 0.98 }}
              onClick={logout}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors font-semibold text-sm rounded-2xl hover:bg-rose-500/10`}
            >
              <LogOut size={20} />
              {!isCollapsed && <span>{t('common.logout')}</span>}
            </motion.button>
            
            {isCollapsed && (
              <div className={`absolute ${isRTL ? 'end-full me-4' : 'start-full ms-4'} top-1/2 -translate-y-1/2 px-3 py-2 bg-[var(--color-danger)] text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl`}>
                {t('logout')}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-[var(--color-card)] border-b border-[var(--color-border-soft)] flex items-center justify-between px-4 sm:px-8 sticky top-0 z-40 shrink-0 transition-colors duration-300 shadow-sm">
          
          {/* Left side (Start) */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h2 className="text-lg sm:text-2xl font-bold text-[var(--color-text-main)] tracking-tight">
              {menuItems.find(m => m.id === activeTab)?.label || t('common.dashboard')}
            </h2>
          </div>

          {/* Right side (End) */}
          <div className="flex items-center gap-2 sm:gap-4">
            <NotificationBell />
            
            <div className="h-8 w-px bg-[var(--color-border-soft)] mx-1 hidden sm:block"></div>
            
            <InteractiveIcon 
              icon={Globe}
              onClick={() => {
                const nextLang = language === Language.EN ? Language.AR : Language.EN;
                setLanguage(nextLang);
                i18n.changeLanguage(nextLang);
              }}
              tooltip={language === 'en' ? t('common.switchToArabic') : t('common.switchToEnglish')}
              size={20}
              variant="ghost"
              className="!p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
            >
              <span className="ms-2 text-xs font-bold">{language === 'en' ? 'AR' : 'EN'}</span>
            </InteractiveIcon>

            <InteractiveIcon 
              icon={theme === 'dark' ? Sun : Moon}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              tooltip={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
              size={20}
              variant="ghost"
              className="!p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
            />

            <div className="h-8 w-px bg-[var(--color-border-soft)] mx-1 hidden sm:block"></div>

            <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="text-end hidden sm:block">
                <p className="text-sm font-bold text-[var(--color-text-main)] leading-tight">{translateName(user?.name)}</p>
                <p className="text-xs text-[var(--color-text-muted)] font-medium">{translateName(user?.job_title) || translateName(user?.role)}</p>
              </div>
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[var(--color-bg-main)] flex items-center justify-center overflow-hidden border-2 border-[var(--color-border-soft)] shadow-sm">
                {user?.profile_picture ? (
                  <img src={user.profile_picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={20} className="text-[var(--color-text-muted)]" />
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-[var(--color-bg-main)]">
          <div className="max-w-7xl mx-auto w-full animate-fade-in">
            {children}
          </div>
        </div>
        <Chatbot />
      </main>
    </div>
  );

};

export default Layout;
