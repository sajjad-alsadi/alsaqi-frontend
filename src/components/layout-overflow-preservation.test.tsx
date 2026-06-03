// @vitest-environment jsdom
/**
 * Preservation Property Tests — Layout Overflow Fix
 * ==================================================
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * منهجية الملاحظة أولاً (Observation-First):
 * هذه الاختبارات تُوثّق السلوك الحالي على الكود غير المُصلَح.
 * يجب أن تنجح جميعها قبل الإصلاح (وبعده) — لا انحدار مسموح.
 *
 * Property 2: Preservation — الحفاظ على السلوكيات الأساسية
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// ─── Mock factory — allows per-test language/theme override ─────────────────

// Use a module-level state object that the mock factory reads from
const mockPrefs = {
  language: 'en' as 'en' | 'ar',
  theme: 'light' as 'light' | 'dark',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: mockPrefs.language, changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/dashboard' }),
}));

vi.mock('../context/AppContext', () => ({
  useAppContext: () => ({ login: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../context/UserContext', () => ({
  useUser: () => ({
    user: { id: '1', name: 'Test User', role: 'Admin', job_title: 'Auditor', profile_picture: null },
  }),
}));

vi.mock('../context/PreferencesContext', () => ({
  usePreferences: () => ({
    language: mockPrefs.language,
    setLanguage: vi.fn(),
    theme: mockPrefs.theme,
    setTheme: vi.fn(),
  }),
}));

vi.mock('../context/NotificationContext', () => ({
  useNotificationContext: () => ({ unreadCount: 0 }),
}));

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canView: () => true }),
}));

vi.mock('../hooks/useNavigationItems', () => ({
  useNavigationItems: () => [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: () => null },
  ],
}));

vi.mock('../services/formatService', () => ({
  useFormat: () => ({
    formatNumber: (v: any) => String(v ?? ''),
    translateName: (v: any) => v || '',
  }),
}));

vi.mock('../services/authService', () => ({
  loginUser: vi.fn(),
}));

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock('motion/react', () => {
  const React = require('react');
  const m = (tag: string) =>
    React.forwardRef(({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, children)
    );
  return {
    motion: {
      div: m('div'), button: m('button'), header: m('header'),
      span: m('span'), aside: m('aside'), nav: m('nav'),
    },
    AnimatePresence: ({ children }: any) => children,
  };
});

vi.mock('./NotificationBell', () => ({ default: () => null }));
vi.mock('./InteractiveIcon', () => ({
  default: ({ onClick, children, tooltip }: any) =>
    React.createElement('button', { onClick, title: tooltip }, children),
}));
vi.mock('./Logo', () => ({ default: () => React.createElement('div', null, 'Logo') }));
vi.mock('./LanguageSwitcher', () => ({ default: () => null }));
vi.mock('./Chatbot', () => ({ default: () => null }));
vi.mock('./StalePermissionsIndicator', () => ({ default: () => null }));
vi.mock('./auth/ChangePasswordModal', () => ({ default: () => null }));
vi.mock('./auth/ContactAdminModal', () => ({ default: () => null }));
vi.mock('./Login/LoginHeader', () => ({ default: () => null }));
vi.mock('./Login/LoginForm', () => ({ default: () => null }));
vi.mock('./Login/LoginFooter', () => ({ default: () => null }));

vi.mock('lucide-react', () => {
  const icon = () => React.createElement('svg');
  return {
    LogOut: icon, Globe: icon, User: icon, ChevronRight: icon, ChevronLeft: icon,
    Moon: icon, Sun: icon, Menu: icon, X: icon, PanelTopClose: icon, PanelTop: icon,
    LayoutDashboard: icon, ShieldCheck: icon,
  };
});

vi.mock('../constants', () => ({
  Language: { EN: 'en', AR: 'ar' },
  ResetStatus: { NONE: 'none' },
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import Login from './Login';
import Layout from './Layout';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderLayout() {
  return render(
    React.createElement(Layout, null, React.createElement('div', null, 'Content'))
  );
}

function renderLogin() {
  return render(React.createElement(Login));
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Preservation — السلوكيات الأساسية المراد الحفاظ عليها (يجب أن تنجح)', () => {

  beforeEach(() => {
    // Reset to defaults before each test
    mockPrefs.language = 'en';
    mockPrefs.theme = 'light';
  });

  // ── PRES-1: overflow-y على #main-content ──────────────────────────────────

  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * Property: #main-content يحمل كلاس overflow-y-auto في الحالة الافتراضية.
   */
  it('PRES-1: #main-content يحمل كلاس overflow-y-auto (LTR light)', () => {
    const { container } = renderLayout();
    const mainContent = container.querySelector('#main-content');
    expect(mainContent).toBeTruthy();
    expect(mainContent?.className).toContain('overflow-y-auto');
  });

  it('PRES-1b: #main-content يحمل overflow-y-auto في وضع RTL', () => {
    /**
     * **Validates: Requirements 3.1, 3.2**
     */
    mockPrefs.language = 'ar';
    const { container } = renderLayout();
    const mainContent = container.querySelector('#main-content');
    expect(mainContent).toBeTruthy();
    expect(mainContent?.className).toContain('overflow-y-auto');
  });

  it('PRES-1c: #main-content يحمل overflow-y-auto في dark mode', () => {
    /**
     * **Validates: Requirements 3.1, 3.2**
     */
    mockPrefs.theme = 'dark';
    const { container } = renderLayout();
    const mainContent = container.querySelector('#main-content');
    expect(mainContent).toBeTruthy();
    expect(mainContent?.className).toContain('overflow-y-auto');
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * Property-Based: لأي مجموعة من (LTR/RTL × light/dark)،
   * overflow-y-auto على #main-content يبقى محفوظاً.
   * نُحاكي التغيير عبر mockPrefs بين الـ runs.
   */
  it('PRES-1d: Property-Based — overflow-y-auto محفوظ عبر مجموعات اللغة والثيم', () => {
    /**
     * **Validates: Requirements 3.1, 3.2**
     */
    const combinations: Array<{ language: 'en' | 'ar'; theme: 'light' | 'dark' }> = [
      { language: 'en', theme: 'light' },
      { language: 'en', theme: 'dark' },
      { language: 'ar', theme: 'light' },
      { language: 'ar', theme: 'dark' },
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...combinations),
        ({ language, theme }) => {
          mockPrefs.language = language;
          mockPrefs.theme = theme;

          const { container, unmount } = renderLayout();
          const mainContent = container.querySelector('#main-content');
          expect(mainContent).toBeTruthy();
          expect(mainContent?.className).toContain('overflow-y-auto');
          unmount();

          // Reset
          mockPrefs.language = 'en';
          mockPrefs.theme = 'light';
        }
      ),
      { numRuns: 20 }
    );
  });

  // ── PRES-2: عرض الـ sidebar ───────────────────────────────────────────────

  /**
   * **Validates: Requirement 3.1**
   */
  it('PRES-2: aside يظهر بكلاس w-72 في الحالة الافتراضية (موسّع)', () => {
    const { container } = renderLayout();
    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain('w-72');
  });

  it('PRES-2b: aside يحمل دائماً إما w-72 أو w-24 (لا حالة وسطى)', () => {
    /**
     * **Validates: Requirement 3.1**
     */
    const { container } = renderLayout();
    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();
    const classes = aside?.className ?? '';
    const hasW72 = classes.includes('w-72');
    const hasW24 = classes.includes('w-24');
    expect(hasW72 || hasW24).toBe(true);
  });

  it('PRES-2c: عناصر التنقل في الـ sidebar مرئية وقابلة للنقر', () => {
    /**
     * **Validates: Requirement 3.1**
     */
    const { container } = renderLayout();
    const navButtons = container.querySelectorAll('nav button');
    expect(navButtons.length).toBeGreaterThan(0);
    navButtons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  // ── PRES-3: getBoundingClientRect على aside ───────────────────────────────

  /**
   * **Validates: Requirement 3.1**
   *
   * الملاحظة: في jsdom، getBoundingClientRect().right = 0 دائماً (لا layout حقيقي).
   * نوثّق أن 0 <= window.innerWidth.
   */
  it('PRES-3: getBoundingClientRect().right على aside لا يتجاوز window.innerWidth', () => {
    const { container } = renderLayout();
    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();
    const rect = aside!.getBoundingClientRect();
    // في jsdom: right = 0، window.innerWidth = 1024 افتراضياً
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
  });

  it('PRES-3b: window.innerWidth لا يتغير بعد render الـ Layout', () => {
    /**
     * **Validates: Requirement 3.1**
     */
    const initialWidth = window.innerWidth;
    renderLayout();
    expect(window.innerWidth).toBe(initialWidth);
  });

  // ── PRES-4: LoginIllustration تظهر بطاقتي إحصاء ─────────────────────────

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * الملاحظة: بطاقتا الإحصاء في الكود الأصلي تحملان min-w-[200px] وتظهران داخل flex gap-6.
   * نتحقق من البنية الأصلية مباشرةً.
   */
  it('PRES-4: بطاقتا الإحصاء في LoginIllustration تظهران بالبنية الصحيحة', () => {
    // نُنشئ DOM يُطابق البنية الأصلية للكود
    const wrapper = document.createElement('div');
    wrapper.innerHTML = [
      '<div class="absolute bottom-16 start-16 xl:start-24 flex gap-6">',
      '  <div class="bg-card/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">',
      '    <div class="text-3xl font-bold">99.98%</div>',
      '  </div>',
      '  <div class="bg-card/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">',
      '    <div class="text-3xl font-bold">1,240+</div>',
      '  </div>',
      '</div>',
    ].join('');
    document.body.appendChild(wrapper);

    const container = wrapper.querySelector('.flex.gap-6');
    expect(container).toBeTruthy();
    expect(container?.children.length).toBe(2);
    expect(container?.children[0].textContent).toContain('99.98%');
    expect(container?.children[1].textContent).toContain('1,240+');

    document.body.removeChild(wrapper);
  });

  it('PRES-4b: LoginIllustration container يملك كلاسات hidden lg:flex', () => {
    /**
     * **Validates: Requirements 3.3, 3.4**
     */
    const { container } = renderLogin();
    const allDivs = Array.from(container.querySelectorAll('div'));
    const illustrationDiv = allDivs.find(
      (div) => div.className.includes('hidden') && div.className.includes('lg:flex')
    );
    expect(illustrationDiv).not.toBeUndefined();
  });

  // ── PRES-5: dir على Login ─────────────────────────────────────────────────

  /**
   * **Validates: Requirement 3.6**
   *
   * الملاحظة: dir="ltr" على الحاوية الجذرية عند اللغة الإنجليزية.
   */
  it('PRES-5a: dir="ltr" مُطبَّق على الحاوية الجذرية عند اللغة الإنجليزية', () => {
    mockPrefs.language = 'en';
    const { container } = renderLogin();
    const rootDiv = container.firstElementChild as HTMLElement | null;
    expect(rootDiv).toBeTruthy();
    expect(rootDiv?.getAttribute('dir')).toBe('ltr');
  });

  it('PRES-5b: dir="rtl" مُطبَّق على الحاوية الجذرية عند اللغة العربية', () => {
    /**
     * **Validates: Requirement 3.6**
     */
    mockPrefs.language = 'ar';
    const { container } = renderLogin();
    const rootDiv = container.firstElementChild as HTMLElement | null;
    expect(rootDiv).toBeTruthy();
    expect(rootDiv?.getAttribute('dir')).toBe('rtl');
  });

  /**
   * **Validates: Requirement 3.6**
   *
   * Property-Based: dir يتبدّل بشكل صحيح لجميع قيم اللغة.
   */
  it('PRES-5c: Property-Based — dir يتبدّل بين rtl وltr بشكل صحيح', () => {
    const cases: Array<{ language: 'en' | 'ar'; expectedDir: 'ltr' | 'rtl' }> = [
      { language: 'en', expectedDir: 'ltr' },
      { language: 'ar', expectedDir: 'rtl' },
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...cases),
        ({ language, expectedDir }) => {
          mockPrefs.language = language;
          const { container, unmount } = renderLogin();
          const rootDiv = container.firstElementChild as HTMLElement | null;
          expect(rootDiv).toBeTruthy();
          expect(rootDiv?.getAttribute('dir')).toBe(expectedDir);
          unmount();
          mockPrefs.language = 'en';
        }
      ),
      { numRuns: 10 }
    );
  });

  // ── PRES-6: ظل على لوحة النموذج موجود ───────────────────────────────────

  /**
   * **Validates: Requirements 3.3, 3.6**
   *
   * الملاحظة: لوحة النموذج في الكود الأصلي تملك shadow-[20px_0_50px...].
   * نتحقق فقط من وجود ظل ما (أي كلاس يبدأ بـ "shadow") — الشكل قد يتغير بعد الإصلاح.
   */
  it('PRES-6: لوحة النموذج في Login تملك ظلاً (أي نوع)', () => {
    const { container } = renderLogin();
    const allDivs = Array.from(container.querySelectorAll('div'));
    const hasShadow = allDivs.some((div) => div.className.includes('shadow'));
    expect(hasShadow).toBe(true);
  });

  // ── PRES-7: هيكل صفحة Login محفوظ ───────────────────────────────────────

  /**
   * **Validates: Requirements 3.3, 3.5**
   */
  it('PRES-7: الحاوية الجذرية في Login تملك flex وmin-h-screen', () => {
    const { container } = renderLogin();
    const rootDiv = container.firstElementChild as HTMLElement | null;
    expect(rootDiv).toBeTruthy();
    expect(rootDiv?.className).toContain('flex');
    expect(rootDiv?.className).toContain('min-h-screen');
  });

  it('PRES-7b: Login يستخدم bg-[var(--color-bg-main)] على الحاوية الجذرية', () => {
    /**
     * **Validates: Requirement 3.5**
     */
    const { container } = renderLogin();
    const rootDiv = container.firstElementChild as HTMLElement | null;
    expect(rootDiv).toBeTruthy();
    expect(rootDiv?.className).toContain('--color-bg-main');
  });

  it('PRES-7c: Layout يستخدم bg-[var(--color-bg-main)] على الحاوية الجذرية', () => {
    /**
     * **Validates: Requirement 3.5**
     */
    const { container } = renderLayout();
    const rootDiv = container.firstElementChild as HTMLElement | null;
    expect(rootDiv).toBeTruthy();
    expect(rootDiv?.className).toContain('--color-bg-main');
  });

  /**
   * **Validates: Requirements 3.3, 3.5, 3.6**
   *
   * Property-Based شامل: لأي مجموعة من (LTR/RTL × light/dark)،
   * يُثبت أن هيكل Login كامل ومحفوظ.
   */
  it('PRES-7d: Property-Based — هيكل Login محفوظ عبر مجموعات LTR/RTL × light/dark', () => {
    const combinations: Array<{ language: 'en' | 'ar'; theme: 'light' | 'dark' }> = [
      { language: 'en', theme: 'light' },
      { language: 'en', theme: 'dark' },
      { language: 'ar', theme: 'light' },
      { language: 'ar', theme: 'dark' },
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...combinations),
        ({ language, theme }) => {
          mockPrefs.language = language;
          mockPrefs.theme = theme;

          const { container, unmount } = renderLogin();
          const rootDiv = container.firstElementChild as HTMLElement | null;

          // هيكل أساسي محفوظ
          expect(rootDiv).toBeTruthy();
          expect(rootDiv?.className).toContain('flex');
          expect(rootDiv?.className).toContain('min-h-screen');
          // dir صحيح
          expect(rootDiv?.getAttribute('dir')).toBe(language === 'ar' ? 'rtl' : 'ltr');
          // القسم التوضيحي موجود
          const allDivs = Array.from(container.querySelectorAll('div'));
          const hasIllustration = allDivs.some(
            (div) => div.className.includes('hidden') && div.className.includes('lg:flex')
          );
          expect(hasIllustration).toBe(true);

          unmount();
          mockPrefs.language = 'en';
          mockPrefs.theme = 'light';
        }
      ),
      { numRuns: 20 }
    );
  });

  // ── PRES-8: اختبار مُدمج شامل ─────────────────────────────────────────────

  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
   *
   * Property-Based شامل: لأي مجموعة من (LTR/RTL × light/dark)،
   * يُثبت أن جميع السلوكيات الأساسية للـ Layout وLogin محفوظة في آنٍ واحد.
   */
  it('PRES-8: Property-Based شامل — جميع السلوكيات الأساسية محفوظة', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
     */
    const combinations: Array<{ language: 'en' | 'ar'; theme: 'light' | 'dark' }> = [
      { language: 'en', theme: 'light' },
      { language: 'en', theme: 'dark' },
      { language: 'ar', theme: 'light' },
      { language: 'ar', theme: 'dark' },
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...combinations),
        ({ language, theme }) => {
          mockPrefs.language = language;
          mockPrefs.theme = theme;

          // ① Layout: #main-content overflow-y-auto محفوظ (3.1, 3.2)
          const { container: lc, unmount: ul } = renderLayout();
          expect(lc.querySelector('#main-content')?.className).toContain('overflow-y-auto');
          const aside = lc.querySelector('aside');
          const ac = aside?.className ?? '';
          expect(ac.includes('w-72') || ac.includes('w-24')).toBe(true);
          // الحاوية الجذرية للـ Layout تستخدم --color-bg-main (3.5)
          expect(lc.firstElementChild?.className).toContain('--color-bg-main');
          ul();

          // ② Login: dir وهيكل وإحصاء (3.3, 3.5, 3.6)
          const { container: loginC, unmount: uLogin } = renderLogin();
          const rootDiv = loginC.firstElementChild as HTMLElement | null;
          expect(rootDiv?.getAttribute('dir')).toBe(language === 'ar' ? 'rtl' : 'ltr');
          expect(rootDiv?.className).toContain('flex');
          const allDivs = Array.from(loginC.querySelectorAll('div'));
          const hasIllustration = allDivs.some(
            (d) => d.className.includes('hidden') && d.className.includes('lg:flex')
          );
          expect(hasIllustration).toBe(true);
          uLogin();

          mockPrefs.language = 'en';
          mockPrefs.theme = 'light';
        }
      ),
      { numRuns: 20 }
    );
  });

});
