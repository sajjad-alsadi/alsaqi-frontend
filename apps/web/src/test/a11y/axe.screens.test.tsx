// @vitest-environment jsdom
/**
 * Zero-axe-violation assertions for the key screens (Stream 5, task 5.3).
 *
 * Renders each of the five covered screens (login, dashboard, audit-plan,
 * finding, correspondence) through the {@link audit} harness in BOTH `dir="ltr"`
 * and `dir="rtl"` and asserts axe reports zero WCAG 2.1 A/AA violations. On
 * failure the assertion message reports the affected screen, the text direction,
 * and the violated rule identifier(s) (Requirement 5.5).
 *
 * The screens depend on context providers, React Query hooks, and the API
 * client. Rather than stand up the full provider tree (which would pull in live
 * network, WebSocket, and session side-effects), the consumed context/data hooks
 * are mocked so axe analyses the screens' real rendered markup in isolation.
 *
 * @see Requirements 5.3, 5.5
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import type { AxeResults } from 'axe-core';
import { audit, coveredScreens, type CoveredScreen, type TextDirection } from './axe';
import { Language } from '../../constants';

// ─── Shared, per-test mutable mock state ─────────────────────────────────────────
// Drives the language the mocked PreferencesContext reports, so each screen renders
// its own `dir`/`lang` aligned with the direction under test (rtl ⇒ ar, ltr ⇒ en).
const mockState = vi.hoisted(() => ({ language: 'en' as 'en' | 'ar' }));

// ─── Mocks ───────────────────────────────────────────────────────────────────────

// Only DashboardKpiGrid / DashboardActivityFeed / DashboardQuickActions use the
// router; provide inert hook stubs so they render without a <Router> ancestor.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
  useParams: () => ({}),
}));

// Comprehensive `motion/react` stub: render any `motion.<tag>` as the plain tag and
// strip animation-only props so they never leak onto the DOM. Overrides the lighter
// global stub from test/setup.ts (which only covers `motion.div`).
vi.mock('motion/react', () => {
  const ReactLib = require('react');
  const make = (tag: string) =>
    ReactLib.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const {
        children,
        initial,
        animate,
        exit,
        transition,
        whileHover,
        whileTap,
        whileInView,
        viewport,
        layout,
        variants,
        ...rest
      } = props;
      return ReactLib.createElement(tag, { ...rest, ref }, children as React.ReactNode);
    });
  const cache: Record<string, unknown> = {};
  const motion = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        const tag = typeof prop === 'string' ? prop : 'div';
        if (!cache[tag]) cache[tag] = make(tag);
        return cache[tag];
      },
    },
  );
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => children };
});

vi.mock('../../context/PreferencesContext', () => ({
  usePreferences: () => ({
    language: mockState.language,
    setLanguage: vi.fn(),
    theme: 'light',
    setTheme: vi.fn(),
    dashboardLayout: 'standard',
    setDashboardLayout: vi.fn(),
  }),
}));

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    setActiveTab: vi.fn(),
    fetchNotifications: vi.fn(),
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    token: 'authenticated',
    setToken: vi.fn(),
    logout: vi.fn(),
    isCheckingSession: false,
  }),
}));

vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: unknown) => (d == null ? '' : String(d)),
    formatDateTime: (d: unknown) => (d == null ? '' : String(d)),
    formatNumber: (n: unknown) => String(n ?? 0),
    formatCurrency: (n: unknown) => String(n ?? 0),
    translateStatus: (s: unknown) => String(s ?? ''),
    translateName: (n: unknown) => String(n ?? ''),
    translateModule: (m: unknown) => String(m ?? ''),
    translateAction: (a: unknown) => String(a ?? ''),
  }),
}));

// Avoid IntersectionObserver-driven reveal/count-up animation indeterminacy so the
// dashboard renders its loaded markup deterministically.
vi.mock('../../hooks/useScrollReveal', () => ({
  useScrollReveal: () => ({ ref: { current: null }, isVisible: true }),
}));

vi.mock('../../hooks/useCountUp', () => ({
  useCountUp: (value: number) => value,
}));

vi.mock('../../api/hooks/useDashboardStats', () => ({
  useDashboardStats: () => ({
    stats: {
      audits: { total: 24, completed: 18, in_progress: 4, delayed: 2, progress_by_type: [] },
      findings: { summary: { total: 12, open: 5, high_risk_open: 2 }, byRisk: [] },
      recommendations: { total: 9, open: 4, overdue: 1 },
      risks: { summary: { total: 7, high: 2 }, byLevel: [] },
      correspondence: { incoming_total: 15, outgoing_total: 9, pending_responses: 3 },
      compliance: { total: 6 },
      activity: [],
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../api/hooks/useCorrespondence', () => ({
  useCorrespondence: () => ({
    stats: { total_incoming: 15, total_outgoing: 9, pending_response: 3, archived: 4 },
    incoming: [],
    outgoing: [],
    archive: [],
    loading: false,
    error: null,
    fetchStats: vi.fn(),
    fetchIncoming: vi.fn(),
    fetchOutgoing: vi.fn(),
    fetchArchive: vi.fn(),
    refreshAll: vi.fn(),
  }),
}));

// `../../api` (the composed client index) exports both the `api` object and the
// audit-plans/findings query hooks consumed by the audit-plan and finding screens.
vi.mock('../../api', () => ({
  api: {
    auth: { login: vi.fn() },
    auditPlans: { delete: vi.fn(), list: vi.fn() },
    findings: { list: vi.fn() },
  },
  useAuditPlans: () => ({
    data: { items: [], total: 0, totalPages: 0 },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useFindings: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

// ─── Screens under audit (imported after mocks are registered) ───────────────────
import Login from '../../components/Login';
import Dashboard from '../../modules/Dashboard';
import AuditPlanModule from '../../modules/AuditPlan';
import AuditFindings from '../../modules/AuditFindings';
import CorrespondenceSystem from '../../modules/Correspondence/CorrespondenceSystem';

const directions: readonly TextDirection[] = ['ltr', 'rtl'];

const screenFactories: Record<CoveredScreen, () => React.ReactElement> = {
  login: () => <Login />,
  dashboard: () => <Dashboard />,
  'audit-plan': () => <AuditPlanModule />,
  finding: () => <AuditFindings />,
  correspondence: () => (
    <CorrespondenceSystem language={mockState.language === 'ar' ? Language.AR : Language.EN} />
  ),
};

/** Build a failure message naming the screen, direction, and each violated rule id. */
function formatViolations(
  screen: CoveredScreen,
  dir: TextDirection,
  results: AxeResults,
): string {
  const rules = results.violations
    .map((v) => `${v.id} [${v.impact ?? 'n/a'}] (${v.nodes.length} node(s)): ${v.help}`)
    .join('\n  - ');
  return `axe found ${results.violations.length} violation(s) on screen "${screen}" [dir=${dir}]:\n  - ${rules}`;
}

// ─── Assertions ──────────────────────────────────────────────────────────────────

describe('A11y: zero axe violations on key screens (dir=ltr and dir=rtl)', () => {
  for (const screen of coveredScreens) {
    for (const dir of directions) {
      it(`"${screen}" reports zero axe violations in dir="${dir}"`, async () => {
        mockState.language = dir === 'rtl' ? 'ar' : 'en';

        const results = await audit(screenFactories[screen](), { dir });

        // Report the screen, direction, and violated rule id(s) on failure (Req 5.5).
        expect(results.violations, formatViolations(screen, dir, results)).toEqual([]);
      });
    }
  }
});
