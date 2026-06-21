// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * Component Tests - Layout
 *
 * Tests the Layout component rendering, navigation, accessibility features,
 * and responsive behavior.
 */

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/dashboard' }),
}));

// Mock context providers
const mockLogout = vi.fn();
vi.mock('../context/AppContext', () => ({
  useAppContext: () => ({
    logout: mockLogout,
  }),
}));

vi.mock('../context/UserContext', () => ({
  useUser: () => ({
    user: { id: 'user-1', name: 'Admin User', role: 'Admin', job_title: 'System Administrator', profile_picture: null },
  }),
}));

const mockSetLanguage = vi.fn();
const mockSetTheme = vi.fn();
vi.mock('../context/PreferencesContext', () => ({
  usePreferences: () => ({
    language: 'en',
    setLanguage: mockSetLanguage,
    theme: 'light',
    setTheme: mockSetTheme,
  }),
}));

vi.mock('../context/NotificationContext', () => ({
  useNotificationContext: () => ({
    unreadCount: 3,
  }),
}));

// Mock hooks
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canView: () => true,
  }),
}));

// Mock formatService
vi.mock('../utils/formatService', () => ({
  useFormat: () => ({
    formatNumber: (val: any) => String(val ?? ''),
    translateName: (val: any) => val || '',
  }),
}));

// Mock motion/react - must be comprehensive for Layout which uses motion.div, motion.button, motion.header, and AnimatePresence
vi.mock('motion/react', () => {
  const React = require('react');
  const createMotionComponent = (tag: string) =>
    React.forwardRef(({ children, initial, animate, exit, transition, whileHover, whileTap, layout, ...props }: any, ref: any) => {
      return React.createElement(tag, { ...props, ref }, children);
    });

  return {
    motion: {
      div: createMotionComponent('div'),
      button: createMotionComponent('button'),
      header: createMotionComponent('header'),
      span: createMotionComponent('span'),
      a: createMotionComponent('a'),
      nav: createMotionComponent('nav'),
      aside: createMotionComponent('aside'),
      section: createMotionComponent('section'),
      main: createMotionComponent('main'),
      p: createMotionComponent('p'),
      h1: createMotionComponent('h1'),
      h2: createMotionComponent('h2'),
      li: createMotionComponent('li'),
      ul: createMotionComponent('ul'),
    },
    AnimatePresence: ({ children }: any) => children,
  };
});

// Mock child components
vi.mock('./NotificationBell', () => ({
  default: () => <div data-testid="notification-bell">NotificationBell</div>,
}));

vi.mock('./InteractiveIcon', () => ({
  default: ({ icon, onClick, tooltip, children }: any) => (
    <button onClick={onClick} title={tooltip} data-testid={`interactive-icon-${tooltip || 'unknown'}`}>
      {children}
    </button>
  ),
}));

vi.mock('./Logo', () => ({
  default: ({ size, className }: any) => <div data-testid="logo" className={className}>Logo</div>,
}));

vi.mock('./LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher">LanguageSwitcher</div>,
}));

vi.mock('./Chatbot', () => ({
  default: () => <div data-testid="chatbot">Chatbot</div>,
}));

vi.mock('./StalePermissionsIndicator', () => ({
  default: () => null,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const iconComponent = ({ size, className }: any) => <svg data-testid="icon" className={className} />;
  return {
    LayoutDashboard: iconComponent,
    CalendarRange: iconComponent,
    ClipboardCheck: iconComponent,
    Library: iconComponent,
    FileSearch: iconComponent,
    TrendingUp: iconComponent,
    ShieldAlert: iconComponent,
    Building2: iconComponent,
    Building: iconComponent,
    Scale: iconComponent,
    AlertCircle: iconComponent,
    AlertTriangle: iconComponent,
    History: iconComponent,
    Settings: iconComponent,
    Users: iconComponent,
    LogOut: iconComponent,
    Bell: iconComponent,
    Globe: iconComponent,
    User: iconComponent,
    ChevronRight: iconComponent,
    ChevronLeft: iconComponent,
    Network: iconComponent,
    FileText: iconComponent,
    Briefcase: iconComponent,
    Moon: iconComponent,
    Sun: iconComponent,
    BookOpen: iconComponent,
    BarChart3: iconComponent,
    Users2: iconComponent,
    Menu: iconComponent,
    X: iconComponent,
    ShieldCheck: iconComponent,
    Terminal: iconComponent,
    PanelTopClose: iconComponent,
    PanelTop: iconComponent,
    Settings2: iconComponent,
  };
});

// Mock constants
vi.mock('../constants', () => ({
  Language: { EN: 'en', AR: 'ar' },
  UserRole: {
    ADMIN: 'Admin',
    INTERNAL_AUDITOR: 'Internal Auditor',
    COMPLIANCE_OFFICER: 'Compliance Officer',
    RISK_OFFICER: 'Risk Officer',
    MANAGER: 'Manager',
    VIEWER: 'Viewer',
  },
  ADMIN_ROLES: ['Admin', 'Manager'],
  COMPLIANCE_ROLES: ['Admin', 'Manager', 'Compliance Officer'],
  STAFF_ROLES: ['Admin', 'Manager', 'Internal Auditor', 'Viewer'],
}));

// Mock permissions
vi.mock('../permissions', () => ({
  MODULES: {
    DASHBOARD: 'Dashboard',
    AUDIT_CHARTER: 'Audit Charter',
    AUDIT_PLANS: 'Audit Plans',
    AUDIT_TASKS: 'Audit Tasks',
    AUDIT_PROGRAM_LIBRARY: 'Audit Program Library',
    AUDIT_FINDINGS: 'Audit Findings',
    AUDIT_EVIDENCE: 'Audit Evidence',
    RECOMMENDATIONS: 'Recommendations',
    RISK_REGISTER: 'Risk Register',
    COMPLIANCE_MATRIX: 'Compliance Matrix',
    INTEGRITY_MANAGEMENT: 'Integrity Management',
    DEPARTMENTS: 'Departments',
    REPORTS: 'Reports',
    CORRESPONDENCE: 'Correspondence',
    NOTIFICATIONS: 'Notifications',
    USER_MANAGEMENT: 'User Management',
    SYSTEM_LOGS: 'System Logs',
    SETTINGS: 'Settings',
  },
}));

import Layout from './Layout';

describe('Layout Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage mock
    (localStorage.getItem as any).mockReturnValue('false');
  });

  describe('Rendering', () => {
    it('should render the sidebar with navigation items', () => {
      render(
        <Layout>
          <div>Page Content</div>
        </Layout>
      );

      // Check for navigation landmark
      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      expect(nav).toBeInTheDocument();
    });

    it('should render the main content area with children', () => {
      render(
        <Layout>
          <div data-testid="child-content">Page Content</div>
        </Layout>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Page Content')).toBeInTheDocument();
    });

    it('should render the brand name and logo', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByTestId('logo')).toBeInTheDocument();
      expect(screen.getByText('common.brandName')).toBeInTheDocument();
    });

    it('should render user info in the header', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('System Administrator')).toBeInTheDocument();
    });

    it('should render the notification bell', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    });

    it('should render the chatbot component', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      expect(screen.getByTestId('chatbot')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate when a menu item is clicked', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // Find and click a navigation button (dashboard is active by default)
      const navButtons = screen.getAllByRole('button');
      // Find a nav button that navigates (not the collapse/theme buttons)
      const planButton = navButtons.find(btn => btn.textContent?.includes('common.auditPlan'));
      if (planButton) {
        fireEvent.click(planButton);
        expect(mockNavigate).toHaveBeenCalledWith('/plan');
      }
    });

    it('should highlight the active navigation item', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // The dashboard item should have aria-current="page" since pathname is /dashboard
      const activeItem = screen.getByRole('button', { current: 'page' });
      expect(activeItem).toBeInTheDocument();
    });

    it('should call logout when logout button is clicked and confirmed', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // Find the logout button (contains "common.logout" text) — this now shows the confirmation
      const logoutButton = screen.getByText('common.logout');
      fireEvent.click(logoutButton);

      // Now the confirmation should appear — click the confirm logout button
      // There will be two elements with "common.logout" text: the sidebar button and the confirm button
      const logoutButtons = screen.getAllByText('common.logout');
      const confirmButton = logoutButtons[logoutButtons.length - 1];
      fireEvent.click(confirmButton);

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have a skip-to-content link', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      const skipLink = screen.getByText('common.skipToContent');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('should have a main content area with role="main"', () => {
      const { container } = render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // The main content div has id="main-content" and role="main"
      const mainContent = container.querySelector('#main-content');
      expect(mainContent).toBeInTheDocument();
      expect(mainContent).toHaveAttribute('role', 'main');
    });

    it('should have navigation landmark with aria-label', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      expect(nav).toBeInTheDocument();
    });

    it('should have aria-expanded on mobile menu button', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // Mobile menu button should have aria-expanded attribute
      // The button uses aria-label "Close menu" or "Open menu"
      const mobileMenuButton = screen.getByLabelText(/close menu|open menu/i);
      expect(mobileMenuButton).toBeInTheDocument();
      expect(mobileMenuButton).toHaveAttribute('aria-expanded');
    });

    it('should have aria-label on the sidebar collapse button', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // The t() mock returns the key, so aria-label will be the translation key
      // The collapse button uses: t('common.collapseSidebar') || 'Collapse sidebar'
      // Since t() returns the key string 'common.collapseSidebar', that's what aria-label will be
      const collapseButton = screen.getByLabelText('common.collapseSidebar');
      expect(collapseButton).toBeInTheDocument();
    });
  });

  describe('Theme and Language', () => {
    it('should render preferences button in header', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // Preferences button should be present (with tooltip "Preferences")
      const prefsButton = screen.getByTestId('interactive-icon-common.preferences');
      expect(prefsButton).toBeInTheDocument();
    });

    it('should show preferences popover options when clicked', () => {
      render(
        <Layout>
          <div>Content</div>
        </Layout>
      );

      // Click the preferences button to open popover
      const prefsButton = screen.getByTestId('interactive-icon-common.preferences');
      fireEvent.click(prefsButton);

      // Language option should show switch text
      expect(screen.getByText('common.switchToArabic')).toBeInTheDocument();
      // Theme option should show dark mode text  
      expect(screen.getByText('common.darkMode')).toBeInTheDocument();
    });
  });
});
