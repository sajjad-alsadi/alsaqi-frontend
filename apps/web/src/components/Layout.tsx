import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useUser } from '../context/UserContext';
import { usePreferences } from '../context/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { useNavigationItems, NAVIGATION_SECTIONS, NavigationSection } from '../hooks/useNavigationItems';
import NotificationBell from './NotificationBell';
import StalePermissionsIndicator from './StalePermissionsIndicator';
import { motion, AnimatePresence } from 'motion/react';
import InteractiveIcon from './InteractiveIcon';
import Logo from './Logo';
import Chatbot from './Chatbot';
import { useFormat } from '../utils/formatService';
import { 
  LogOut,
  Globe,
  User as UserIcon,
  ChevronRight,
  ChevronLeft,
  Moon,
  Sun,
  Menu,
  X,
  PanelTopClose,
  PanelTop,
  Settings2,
} from 'lucide-react';
import { Language } from '../constants';
import type { MenuItemResolved } from '../hooks/useNavigationItems';


/**
 * Memoized sidebar navigation item. Prevents re-rendering all nav items
 * when only the active tab changes (only the previously-active and
 * newly-active items re-render).
 *
 * **Validates: Requirement 3.7**
 */
interface SidebarNavItemProps {
  item: MenuItemResolved;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate: (path: string) => void;
}

const SidebarNavItem = memo<SidebarNavItemProps>(({ item, isActive, isCollapsed, onNavigate }) => (
  <div className="relative group">
    <button
      onClick={() => onNavigate(item.path)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed ? item.label : undefined}
      className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-2.5 rounded-xl transition-colors duration-150 relative active:scale-[0.98] ${
        isActive 
          ? 'text-white' 
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] hover:text-[var(--color-primary)] font-medium'
      }`}
    >
      {/* Animated active background */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active-indicator"
          className="absolute inset-0 bg-[var(--color-primary)] rounded-xl shadow-md shadow-[var(--color-primary)]/20"
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />
      )}
      <item.icon size={18} className={`relative z-10 ${isActive ? 'text-white' : ''}`} />
      {!isCollapsed && (
        <span className="relative z-10 font-medium text-sm whitespace-nowrap overflow-hidden">
          {item.label}
        </span>
      )}
      {item.badge && (
        <span className={`absolute ${isCollapsed ? '-top-1 -end-1' : 'end-3'} z-10 w-5 h-5 bg-[var(--color-danger)] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white`}>
          {item.badge}
        </span>
      )}
    </button>
    
    {/* Collapsed tooltip */}
    {isCollapsed && (
      <div className="absolute start-full ms-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[var(--color-text-main)] text-[var(--color-bg-main)] text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
        {item.label}
      </div>
    )}
  </div>
));

SidebarNavItem.displayName = 'SidebarNavItem';


interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { logout } = useAppContext();
  const { user } = useUser();
  const { language, setLanguage, theme, setTheme } = usePreferences();
  const { t, i18n } = useTranslation();
  const { translateName } = useFormat();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(() => {
    try { return localStorage.getItem('audit_header_hidden') === 'true'; } catch { return false; }
  });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showPrefsPopover, setShowPrefsPopover] = useState(false);
  const prefsRef = useRef<HTMLDivElement>(null);
  const logoutConfirmRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isRTL = i18n.language === 'ar';

  const activeTab = location.pathname.substring(1) || 'dashboard';

  // Navigation items derived from ModuleRegistry with permission filtering and bilingual labels
  const menuItems = useNavigationItems();

  // Derived active page label — memoized to avoid re-computing on every render
  const activePageLabel = useMemo(() => {
    return menuItems.find(m => m.id === activeTab)?.label || t('common.dashboard');
  }, [menuItems, activeTab, t]);

  // Group menu items by section
  const groupedItems = useMemo(() => {
    const groups: Record<NavigationSection, typeof menuItems> = {
      audit: [],
      governance: [],
      organization: [],
      system: [],
    };
    for (const item of menuItems) {
      groups[item.section].push(item);
    }
    return groups;
  }, [menuItems]);

  // Stable callback for sidebar navigation — passed to memoized SidebarNavItem
  const handleNavItemClick = useCallback((path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  }, [navigate]);

  // Close preferences popover when clicking outside
  useEffect(() => {
    if (!showPrefsPopover) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (prefsRef.current && !prefsRef.current.contains(event.target as Node)) {
        setShowPrefsPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPrefsPopover]);

  // Close logout confirm when clicking outside
  useEffect(() => {
    if (!showLogoutConfirm) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (logoutConfirmRef.current && !logoutConfirmRef.current.contains(event.target as Node)) {
        setShowLogoutConfirm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLogoutConfirm]);

  // Close popovers on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPrefsPopover(false);
        setShowLogoutConfirm(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentLang = i18n.language === 'ar' ? 'ar' : 'en';

  return (
    <div className={`flex min-h-screen bg-[var(--color-bg-main)] transition-colors duration-300 ${isRTL ? 'font-sans' : ''} ${theme === 'dark' ? 'dark' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Skip to main content link for keyboard users */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[200] focus:px-6 focus:py-3 focus:bg-[var(--color-primary)] focus:text-white focus:rounded-xl focus:shadow-xl focus:font-bold focus:text-sm"
      >
        {t('common.skipToContent')}
      </a>

      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`${isCollapsed ? 'w-24' : 'w-72'} ${isMobileMenuOpen ? 'fixed inset-y-0 start-0 z-50' : 'hidden md:flex'} bg-[var(--color-card)] border-e border-[var(--color-border-soft)] h-screen sticky top-0 flex-col p-6 overflow-y-auto overflow-x-hidden transition-[width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-sm`} role="navigation" aria-label="Main navigation">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} mb-8 px-2`}>
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
            className={`p-2 rounded-full hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] transition-all duration-200 ${isCollapsed ? 'mt-4' : ''} hidden md:block`}
            aria-label={isCollapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
          >
            <motion.span
              animate={{ rotate: isCollapsed ? 180 : 0 }}
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              className="inline-flex"
            >
              {isRTL ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </motion.span>
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden" aria-label="Main menu">
          {NAVIGATION_SECTIONS.map((section, sectionIndex) => {
            const sectionItems = groupedItems[section.id];
            if (sectionItems.length === 0) return null;
            
            return (
              <div key={section.id} className={sectionIndex > 0 ? 'mt-4 pt-4 border-t border-[var(--color-border-soft)]' : ''}>
                {/* Section label - hidden when collapsed */}
                {!isCollapsed && (
                  <span className="block px-4 mb-2 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider select-none">
                    {section.label[currentLang]}
                  </span>
                )}
                {isCollapsed && sectionIndex > 0 && (
                  <div className="mx-3 mb-2 border-t border-[var(--color-border-soft)]" />
                )}
                
                <div className="space-y-1">
                  {sectionItems.map((item) => (
                    <SidebarNavItem
                      key={item.id}
                      item={item}
                      isActive={activeTab === item.id}
                      isCollapsed={isCollapsed}
                      onNavigate={handleNavItemClick}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="mt-4 pt-4 border-t border-[var(--color-border-soft)] relative" ref={logoutConfirmRef}>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-2.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors font-medium text-sm rounded-xl hover:bg-[var(--color-danger-light)] active:scale-[0.98]`}
          >
            <LogOut size={18} />
            {!isCollapsed && <span>{t('common.logout')}</span>}
          </button>
          
          {/* Logout confirmation popover */}
          <AnimatePresence>
            {showLogoutConfirm && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className={`absolute ${isCollapsed ? 'start-full ms-3' : 'start-0 end-0'} bottom-full mb-2 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-lg p-4 z-50`}
              >
                <p className="text-sm font-medium text-[var(--color-text-main)] mb-3">
                  {t('common.logoutConfirmation')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-soft)] rounded-lg hover:bg-[var(--color-bg-main)] transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => {
                      setShowLogoutConfirm(false);
                      logout();
                    }}
                    className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-[var(--color-danger)] rounded-lg hover:opacity-90 transition-opacity"
                  >
                    {t('common.logout')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collapsed tooltip */}
          {isCollapsed && !showLogoutConfirm && (
            <div className="absolute start-full ms-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[var(--color-danger)] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
              {t('common.logout')}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Header */}
        <AnimatePresence>
          {!isHeaderHidden && (
            <motion.header 
              initial={{ height: 80, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="h-20 bg-[var(--color-card)] border-b border-[var(--color-border-soft)] flex items-center justify-between px-4 sm:px-8 relative z-30 shrink-0 transition-colors duration-300"
            >
              {/* Left side (Start) */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                  aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={isMobileMenuOpen}
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
                <h2 className="text-lg sm:text-2xl font-bold text-[var(--color-text-main)] tracking-tight">
                  {activePageLabel}
                </h2>
              </div>

              {/* Right side (End) */}
              <div className="flex items-center gap-2 sm:gap-3">
                <StalePermissionsIndicator />
                <NotificationBell />
                
                <div className="h-8 w-px bg-[var(--color-border-soft)] mx-1 hidden sm:block" />
                
                {/* Preferences popover (language + theme + hide header) */}
                <div className="relative" ref={prefsRef}>
                  <InteractiveIcon
                    icon={Settings2}
                    onClick={() => setShowPrefsPopover(!showPrefsPopover)}
                    tooltip={t('common.preferences')}
                    size={18}
                    variant="ghost"
                    className="!p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                    ariaExpanded={showPrefsPopover}
                  />
                  
                  <AnimatePresence>
                    {showPrefsPopover && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full mt-2 end-0 w-56 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl shadow-lg overflow-hidden z-[9999]"
                      >
                        {/* Language toggle */}
                        <button
                          onClick={() => {
                            const nextLang = language === Language.EN ? Language.AR : Language.EN;
                            setLanguage(nextLang);
                            i18n.changeLanguage(nextLang);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)] transition-colors"
                        >
                          <Globe size={16} className="text-[var(--color-text-muted)]" />
                          <span className="flex-1 text-start font-medium">
                            {language === 'en' ? t('common.switchToArabic') : t('common.switchToEnglish')}
                          </span>
                          <span className="text-xs font-bold text-[var(--color-primary)]">
                            {language === 'en' ? 'AR' : 'EN'}
                          </span>
                        </button>
                        
                        {/* Theme toggle */}
                        <button
                          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-main)] hover:bg-[var(--color-bg-soft)] transition-colors"
                        >
                          {theme === 'dark' ? (
                            <Sun size={16} className="text-[var(--color-text-muted)]" />
                          ) : (
                            <Moon size={16} className="text-[var(--color-text-muted)]" />
                          )}
                          <span className="flex-1 text-start font-medium">
                            {theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
                          </span>
                        </button>
                        
                        {/* Divider */}
                        <div className="border-t border-[var(--color-border-soft)]" />
                        
                        {/* Hide header */}
                        <button
                          onClick={() => {
                            setIsHeaderHidden(true);
                            setShowPrefsPopover(false);
                            try { localStorage.setItem('audit_header_hidden', 'true'); } catch {}
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-soft)] transition-colors"
                        >
                          <PanelTopClose size={16} />
                          <span className="flex-1 text-start font-medium">{t('common.hideHeader')}</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="h-8 w-px bg-[var(--color-border-soft)] mx-1 hidden sm:block" />

                <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                  <div className="text-end hidden sm:block">
                    <p className="text-sm font-bold text-[var(--color-text-main)] leading-tight">{translateName(user?.name)}</p>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">{translateName(user?.job_title) || translateName(user?.role)}</p>
                  </div>
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[var(--color-bg-main)] flex items-center justify-center overflow-hidden border-2 border-[var(--color-border-soft)]">
                    {user?.profile_picture ? (
                      <img src={user.profile_picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon size={20} className="text-[var(--color-text-muted)]" />
                    )}
                  </div>
                </div>
              </div>
            </motion.header>
          )}
        </AnimatePresence>

        {/* Show header button when hidden */}
        {isHeaderHidden && (
          <div className="flex items-center justify-between px-4 sm:px-8 py-2 bg-[var(--color-card)] border-b border-[var(--color-border-soft)] shrink-0">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
              >
                <Menu size={20} />
              </button>
              <h2 className="text-sm font-bold text-[var(--color-text-main)] tracking-tight">
                {activePageLabel}
              </h2>
            </div>
            <button
              onClick={() => {
                setIsHeaderHidden(false);
                try { localStorage.setItem('audit_header_hidden', 'false'); } catch {}
              }}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-soft)] transition-colors cursor-pointer"
              title={t('common.showHeader')}
            >
              <PanelTop size={18} />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div id="main-content" role="main" className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-[var(--color-bg-main)]" tabIndex={-1}>
          <div className="max-w-7xl mx-auto w-full animate-fade-in">
            {children}
          </div>
        </div>
        {location.pathname === '/dashboard' && <Chatbot />}
      </main>
    </div>
  );

};

export default Layout;
