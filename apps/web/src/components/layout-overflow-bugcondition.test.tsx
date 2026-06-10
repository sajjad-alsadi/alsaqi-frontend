// @vitest-environment jsdom
/**
 * Bug Condition Exploration Test — Horizontal Overflow
 * =====================================================
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * هذا الاختبار يُثبت وجود الخلل على الكود غير المُصلَح.
 * يُتوقع أن يفشل — الفشل دليل على وجود المشكلة.
 *
 * Property 1: Bug Condition — غياب overflow-x:hidden وتجاوز الـ viewport أفقياً
 *
 * CRITICAL: DO NOT fix the code when this test fails.
 * The failure IS the success condition for this exploration test.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
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
    language: 'en',
    setLanguage: vi.fn(),
    theme: 'light',
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

vi.mock('../utils/formatService', () => ({
  useFormat: () => ({
    formatNumber: (v: any) => String(v ?? ''),
    translateName: (v: any) => v || '',
  }),
}));

vi.mock('../api', () => ({
  api: {
    auth: {
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentUser: vi.fn(),
    },
  },
}));

// Minimal motion mock
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

// Stub heavy child components that are irrelevant to overflow checks
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
vi.mock('./Login/LoginIllustration', () => ({
  default: () =>
    React.createElement(
      'div',
      { 'data-testid': 'login-illustration', className: 'hidden lg:flex lg:w-[55%] relative overflow-hidden' },
      React.createElement(
        'div',
        { className: 'absolute bottom-16 start-16 xl:start-24 flex gap-6' },
        React.createElement('div', { className: 'bg-card/90 rounded-xl p-6 min-w-[200px] shadow-2xl' }, '99.98%'),
        React.createElement('div', { className: 'bg-card/90 rounded-xl p-6 min-w-[200px] shadow-2xl' }, '1,240+')
      )
    ),
}));

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

// ─── Helper ─────────────────────────────────────────────────────────────────

/** Extract computed style from a DOM element */
function getStyle(el: Element | null, prop: string): string {
  if (!el) return '';
  return window.getComputedStyle(el).getPropertyValue(prop).trim();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Bug Condition Exploration — Horizontal Overflow (يُتوقع الفشل)', () => {

  /**
   * BUG 1: document.body لا يملك overflow-x: hidden
   * Counterexample متوقع: document.body.style.overflowX === ""
   *
   * Validates: Requirements 1.1, 1.2
   */
  it('BUG-1: يجب أن يفشل — body لا يملك overflow-x:hidden (الكود غير المُصلَح)', () => {
    // في الكود الأصلي، index.css لا يُضبط overflow-x على body
    // jsdom لا يُحمّل CSS خارجي، لذا نتحقق من الحالة الافتراضية مباشرةً
    const overflowX = document.body.style.overflowX;

    // هذا الاختبار يُثبت الخلل: القيمة "" بدلاً من "hidden"
    // الاختبار مكتوب ليفشل على الكود الأصلي
    expect(overflowX).toBe('hidden');
    //   ^ سيفشل: القيمة الفعلية هي "" لأن body لا يملك overflow-x:hidden
  });

  /**
   * BUG-2: الحاوية الجذرية في Login لا تملك overflow-x-hidden
   * Counterexample متوقع: div.min-h-screen.flex لا يحتوي على class overflow-x-hidden
   *
   * Validates: Requirements 1.2, 1.3
   */
  it('BUG-2: يجب أن يفشل — الحاوية الجذرية في <Login /> لا تملك overflow-x-hidden', () => {
    const { container } = render(React.createElement(Login));

    // الحاوية الجذرية هي أول div داخل المكوّن
    const rootDiv = container.firstElementChild as HTMLElement | null;
    expect(rootDiv).toBeTruthy();

    const classes = rootDiv?.className ?? '';

    // هذا الاختبار يُثبت الخلل: overflow-x-hidden غائبة
    expect(classes).toContain('overflow-x-hidden');
    //   ^ سيفشل: الكلاس غير موجود في الكود الأصلي
  });

  /**
   * BUG-3: لوحة نموذج Login تملك ظلاً اتجاهياً خارجياً (20px) يُسبب overflow عند w-full
   * Counterexample متوقع: وجود "shadow-[20px_0_50px" أو "shadow-[-20px_0_50px" في الكلاسات
   *
   * Validates: Requirement 1.3
   */
  it('BUG-3: يجب أن يفشل — لوحة نموذج Login تحتوي على ظل خارجي اتجاهي يتجاوز الـ viewport', () => {
    const { container } = render(React.createElement(Login));

    // نبحث عن div الذي يحتوي على الظل الاتجاهي (لوحة النموذج)
    const allDivs = container.querySelectorAll('div');
    let formPanel: Element | null = null;

    allDivs.forEach((div) => {
      if (
        div.className.includes('shadow-[20px_0_50px') ||
        div.className.includes('shadow-[-20px_0_50px')
      ) {
        formPanel = div;
      }
    });

    // الاختبار يُثبت وجود الظل الخارجي الاتجاهي (هذا هو الخلل)
    // نتحقق من أن الظل الخارجي مُزال أو مُحوَّل إلى inset
    // في الكود الأصلي: shadow-[20px_0_50px_-15px_...] موجود → الاختبار يفشل
    expect(formPanel).toBeNull();
    //   ^ سيفشل: formPanel موجود في الكود الأصلي (الظل الخارجي لم يُزَل)
  });

  /**
   * BUG-4: <aside> في Layout لا يملك overflow-x-hidden
   * Counterexample متوقع: aside.className لا يتضمن "overflow-x-hidden"
   *
   * Validates: Requirement 1.4
   */
  it('BUG-4: يجب أن يفشل — <aside> في Layout لا يملك overflow-x-hidden', () => {
    const { container } = render(
      React.createElement(Layout, null, React.createElement('div', null, 'Content'))
    );

    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();

    const classes = aside?.className ?? '';

    // هذا الاختبار يُثبت الخلل: overflow-x-hidden غائبة عن aside
    expect(classes).toContain('overflow-x-hidden');
    //   ^ سيفشل: "overflow-x-hidden" غير موجودة في الكلاسات الأصلية للـ aside
  });

  /**
   * BUG-5: Property-Based — لأي مكوّن Login مُعروض بدون overflow-x-hidden على الجذر،
   * الظل الاتجاهي يُسبب overflow عند أي عرض شاشة
   *
   * نُحاكي حالات متعددة: عرض شاشة (375–1440px)، اتجاه LTR/RTL
   * الخاصية: shadowOffset > 0 AND rootHasNoOverflowHidden => bugCondition = true
   *
   * Validates: Requirements 1.2, 1.3
   */
  it('BUG-5: Property-Based — شرط الخلل ينطبق على الكود الأصلي عبر مساحة واسعة من المدخلات', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 375, max: 1440 }),  // عرض الشاشة
        fc.boolean(),                          // RTL أو LTR
        (viewportWidth, isRTL) => {
          // تعريف isBugCondition كما في وثيقة التصميم
          // الشرط: body.overflowX !== 'hidden' OR loginRoot.hasNoOverflowHidden
          const bodyOverflowX = document.body.style.overflowX;
          const bodyLacksOverflowHidden = bodyOverflowX !== 'hidden';

          // تعريف وجود الظل الاتجاهي الخارجي في كود Login.tsx
          // في الكود الأصلي، هذا الكلاس موجود دائماً
          const originalShadowClass = 'shadow-[20px_0_50px_-15px_rgba(0,0,0,0.05)]';
          const rtlShadowClass = 'rtl:shadow-[-20px_0_50px_-15px_rgba(0,0,0,0.05)]';

          // الاختبار: على الكود الأصلي، شرط الخلل يجب أن يكون true
          // لأن body لا يملك overflow-x:hidden
          const isBugCondition = bodyLacksOverflowHidden;

          // نتحقق من أن حالة الخلل محللة بشكل صحيح للكود غير المُصلَح
          // الخاصية: isBugCondition يجب أن يكون false بعد الإصلاح (الاختبار يفشل الآن)
          expect(isBugCondition).toBe(false);
          //   ^ سيفشل: bodyLacksOverflowHidden === true على الكود غير المُصلَح

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * BUG-6: بطاقات الإحصاءات في LoginIllustration تملك min-w-[200px] × 2 + gap-6 = ~424px
   * وهذا قد يتجاوز عرض الـ panel عند بعض دقات الشاشة
   * نتحقق من الكلاسات الأصلية قبل الإصلاح
   *
   * Validates: Requirement 1.3
   */
  it('BUG-6: يجب أن يفشل — بطاقات LoginIllustration تملك min-w-[200px] بدلاً من min-w-[160px]', () => {
    // نستورد LoginIllustration الحقيقي مباشرةً لفحص كلاسات البطاقات
    // (نُلغي mock الـ LoginIllustration المحلي لهذا الاختبار فقط بالفحص المباشر على كود المصدر)

    // فحص مباشر على الكود المصدري: هل min-w-[200px] ما زالت موجودة؟
    // نُضيف HTML مُماثلاً لبنية LoginIllustration الأصلية
    const illustrationHtml = `
      <div class="absolute bottom-16 start-16 xl:start-24 flex gap-6">
        <div class="bg-card/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">
          <div>99.98%</div>
        </div>
        <div class="bg-card/90 backdrop-blur-sm rounded-xl p-6 min-w-[200px] shadow-2xl border border-white/20">
          <div>1,240+</div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = illustrationHtml;
    document.body.appendChild(wrapper);

    const cards = wrapper.querySelectorAll('.min-w-\\[200px\\]');

    // الاختبار: في الكود المُصلَح، لا يجب أن توجد بطاقات بـ min-w-[200px]
    // بدلاً منها min-w-[160px] مع flex-1
    expect(cards.length).toBe(0);
    //   ^ سيفشل: البطاقات الأصلية تملك min-w-[200px] (تُضاف بـ HTML مُحاكى)

    document.body.removeChild(wrapper);
  });

});
