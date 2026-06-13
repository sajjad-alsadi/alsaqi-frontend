// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loading-state unit tests for the four data-fetching views (Area E, Req 5.1–5.4).
 *
 * For each view this verifies the Loading → Loaded / Error state machine:
 *   (1) while loading, exactly ONE SkeletonLoader variant is shown and NO partial data,
 *   (2) on success the skeleton is removed and content renders (within 300ms),
 *   (3) on failure the skeleton is removed and an error indication is shown.
 *
 * A static assertion (Req 5.4) checks that the four view files load through the
 * shared SkeletonLoader / LoadingSpinner components and contain no ad-hoc <div>
 * spinner markup for their loading indicators. (SystemErrorLogs intentionally keeps a
 * small RefreshCw `animate-spin` icon inside the Clear action button — an
 * action-progress indicator, not a view loading indicator — so the assertion is scoped
 * to div-based spinners rather than a blanket `animate-spin` ban.)
 */

// ---------------------------------------------------------------------------
// Shared mocks (hoisted, apply to the whole file)
// ---------------------------------------------------------------------------

// Cover every motion.<tag> used across the views (motion.tr / motion.button / motion.div ...)
vi.mock('motion/react', () => {
  const React = require('react');
  const make = (tag: string) =>
    React.forwardRef(
      (
        { children, initial, animate, exit, transition, whileHover, whileTap, layout, ...props }: any,
        ref: any,
      ) => React.createElement(tag, { ...props, ref }, children),
    );
  return {
    motion: new Proxy({}, { get: (_t: any, prop: string) => make(prop) }),
    AnimatePresence: ({ children }: any) => children,
  };
});

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, disabled, variant }: any) =>
    React.createElement('button', { onClick, className, disabled, 'data-variant': variant }, children),
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen
      ? React.createElement('div', { 'data-testid': 'modal', role: 'dialog' }, title, children)
      : null,
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: string) => d || '',
    formatNumber: (n: number) => String(n),
    formatDateTime: (d: string) => d,
  }),
}));

// Raw axios instance shared by ComplianceMatrix + SystemErrorLogs
const mockApiGet = vi.fn();
vi.mock('../../api/httpClient', () => ({
  default: {
    get: (...a: any[]) => mockApiGet(...a),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

// Helper: a promise we control the resolution/rejection of.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ===========================================================================
// 1. Dashboard (StatsSkeleton, hook-driven)
// ===========================================================================
const mockUseDashboardStats = vi.fn();
vi.mock('../../api/hooks/useDashboardStats', () => ({
  useDashboardStats: (...a: any[]) => mockUseDashboardStats(...a),
}));
vi.mock('../../context/PreferencesContext', () => ({
  usePreferences: () => ({ language: 'en', theme: 'light' }),
}));
// Keep the success render trivial + identifiable.
vi.mock('../Dashboard/DashboardHeader', () => ({
  default: () => React.createElement('div', { 'data-testid': 'dashboard-content' }, 'header'),
}));
vi.mock('../Dashboard/DashboardKpiGrid', () => ({ default: () => React.createElement('div', null, 'kpi') }));
vi.mock('../Dashboard/DashboardAuditProgress', () => ({ default: () => React.createElement('div', null, 'progress') }));
vi.mock('../Dashboard/DashboardRiskOverview', () => ({ default: () => React.createElement('div', null, 'risk') }));
vi.mock('../Dashboard/DashboardActivityFeed', () => ({ default: () => React.createElement('div', null, 'activity') }));
vi.mock('../Dashboard/DashboardQuickActions', () => ({ default: () => React.createElement('div', null, 'quick') }));

import Dashboard from '../Dashboard';

const SAMPLE_STATS = {
  audits: { total: 10, completed: 4, in_progress: 3, delayed: 1, progress_by_type: [] },
  findings: { summary: { total: 5, open: 2, high_risk_open: 1 }, byRisk: [] },
  recommendations: { total: 3, open: 1, overdue: 0 },
  risks: { summary: { total: 7, high: 2 }, byLevel: [] },
  correspondence: { incoming_total: 9, outgoing_total: 8, pending_responses: 1 },
  compliance: { total: 4 },
  activity: [],
};

describe('Dashboard loading states (Req 5.1, 5.2, 5.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows exactly one StatsSkeleton and no content while loading', () => {
    mockUseDashboardStats.mockReturnValue({ stats: null, loading: true, error: null });
    render(<Dashboard />);

    expect(screen.getAllByTestId('stats-skeleton')).toHaveLength(1);
    // No other skeleton variant
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-skeleton')).not.toBeInTheDocument();
    // No partial content
    expect(screen.queryByTestId('dashboard-content')).not.toBeInTheDocument();
  });

  it('replaces the skeleton with content on success', async () => {
    mockUseDashboardStats.mockReturnValue({ stats: SAMPLE_STATS, loading: false, error: null });
    render(<Dashboard />);

    await waitFor(
      () => expect(screen.getByTestId('dashboard-content')).toBeInTheDocument(),
      { timeout: 300 },
    );
    expect(screen.queryByTestId('stats-skeleton')).not.toBeInTheDocument();
  });

  it('removes the skeleton and shows an error indication on failure', () => {
    mockUseDashboardStats.mockReturnValue({ stats: null, loading: false, error: 'Boom' });
    render(<Dashboard />);

    expect(screen.queryByTestId('stats-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('common.error')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-content')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 2. ComplianceMatrix (TableSkeleton, api-driven)
// ===========================================================================
vi.mock('../../api/hooks/useDepartments', () => ({
  useDepartments: () => ({ departments: [{ id: '1', name: 'Finance' }] }),
}));
vi.mock('../../hooks/useFileUploadValidation', () => ({
  useFileUploadValidation: () => ({ validateAndFilter: vi.fn().mockResolvedValue([]) }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import ComplianceMatrix from '../ComplianceMatrix/ComplianceMatrixPage';

const COMPLIANCE_ITEM = {
  id: 'cm-1',
  ref_number: 'REF-001',
  title: 'Compliance Item One',
  source_type: 'law',
  compliance_status: 'compliant',
  responsible_person_name: 'Person A',
  review_date: '2025-12-31',
  open_findings_count: 0,
};

describe('ComplianceMatrix loading states (Req 5.1, 5.2, 5.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows exactly one TableSkeleton and no rows while loading', async () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ComplianceMatrix />);

    await waitFor(() => expect(screen.getByTestId('table-skeleton')).toBeInTheDocument());
    expect(screen.getAllByTestId('table-skeleton')).toHaveLength(1);
    expect(screen.queryByTestId('stats-skeleton')).not.toBeInTheDocument();
    // No partial data rendered
    expect(screen.queryByText('Compliance Item One')).not.toBeInTheDocument();
  });

  it('replaces the skeleton with table content on success', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/compliance/summary')) return Promise.resolve({ data: { success: true, data: { total: 1 } } });
      if (url.includes('/compliance')) return Promise.resolve({ data: { success: true, data: [COMPLIANCE_ITEM] } });
      return Promise.resolve({ data: { success: true, data: [] } });
    });
    render(<ComplianceMatrix />);

    await waitFor(
      () => expect(screen.getByText('Compliance Item One')).toBeInTheDocument(),
      { timeout: 300 },
    );
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
  });

  it('removes the skeleton and shows an error indication on failure', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/compliance') && !url.includes('summary')) return Promise.reject(new Error('Network error'));
      // /users/summary and /compliance/summary must return array/objects the view can render
      return Promise.resolve({ data: { success: true, data: [] } });
    });
    render(<ComplianceMatrix />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('complianceMatrix.loadError')).toBeInTheDocument();
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 3. SystemErrorLogs (TableSkeleton, api-driven)
// ===========================================================================
vi.mock('../SystemErrorLogs/SystemErrorAnalytics', () => ({
  default: () => React.createElement('div', { 'data-testid': 'analytics' }),
}));
vi.mock('../../components/Pagination', () => ({
  default: () => React.createElement('div', { 'data-testid': 'pagination' }),
}));

import SystemErrorLogs from '../SystemErrorLogs';

const LOG_ROW = {
  id: 1,
  message: 'Something failed badly',
  stack: 'at foo()',
  module: 'api',
  timestamp: '2025-01-01T00:00:00Z',
  severity: 'error' as const,
};

describe('SystemErrorLogs loading states (Req 5.1, 5.2, 5.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows exactly one TableSkeleton and no rows while loading', async () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SystemErrorLogs />);

    await waitFor(() => expect(screen.getByTestId('table-skeleton')).toBeInTheDocument());
    expect(screen.getAllByTestId('table-skeleton')).toHaveLength(1);
    expect(screen.queryByText('Something failed badly')).not.toBeInTheDocument();
  });

  it('replaces the skeleton with log rows on success', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/system-errors/analytics')) return Promise.resolve({ data: [] });
      if (url.includes('/system-errors')) {
        return Promise.resolve({ data: { data: [LOG_ROW], pagination: { total: 1, totalPages: 1 } } });
      }
      if (url.includes('/auth/ws-token')) return Promise.resolve({ data: { token: null } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<SystemErrorLogs />);

    await waitFor(
      () => expect(screen.getByText('Something failed badly')).toBeInTheDocument(),
      { timeout: 300 },
    );
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
  });

  it('removes the skeleton and shows an error indication on failure', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/system-errors/analytics')) return Promise.resolve({ data: [] });
      if (url.includes('/system-errors')) return Promise.reject(new Error('boom'));
      if (url.includes('/auth/ws-token')) return Promise.resolve({ data: { token: null } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<SystemErrorLogs />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('common.error')).toBeInTheDocument();
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 4. Notifications (CardSkeleton, context-driven)
// ===========================================================================
const mockUseNotificationContext = vi.fn();
vi.mock('../../context/NotificationContext', () => ({
  useNotificationContext: () => mockUseNotificationContext(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import Notifications from '../Notifications';

const NOTIFICATION = {
  id: 'n-1',
  title: 'New finding assigned',
  description: 'A finding was assigned to you',
  related_module: 'findings',
  event_type: 'Created',
  date: '2025-01-01T00:00:00Z',
  is_read: false,
  status: 'Unread',
};

function notifContext(over: Record<string, unknown>) {
  return {
    notifications: [],
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    isLoading: false,
    ...over,
  };
}

describe('Notifications loading states (Req 5.1, 5.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows exactly one CardSkeleton and no notifications while loading', () => {
    mockUseNotificationContext.mockReturnValue(notifContext({ notifications: [], isLoading: true }));
    render(<Notifications />);

    expect(screen.getAllByTestId('card-skeleton')).toHaveLength(1);
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByText('New finding assigned')).not.toBeInTheDocument();
  });

  it('replaces the skeleton with notification content on success', async () => {
    mockUseNotificationContext.mockReturnValue(notifContext({ notifications: [NOTIFICATION], isLoading: false }));
    render(<Notifications />);

    await waitFor(
      () => expect(screen.getByText('New finding assigned')).toBeInTheDocument(),
      { timeout: 300 },
    );
    expect(screen.queryByTestId('card-skeleton')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 5. Static assertion: shared loading components, no ad-hoc view spinners (Req 5.4)
// ===========================================================================
describe('Loading indicators use shared components, not inline spinners (Req 5.4)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = {
    Dashboard: path.resolve(here, '../Dashboard/index.tsx'),
    ComplianceMatrix: path.resolve(here, '../ComplianceMatrix/ComplianceMatrixPage.tsx'),
    SystemErrorLogs: path.resolve(here, '../SystemErrorLogs/index.tsx'),
    Notifications: path.resolve(here, '../Notifications.tsx'),
  } as const;

  const read = (p: string) => fs.readFileSync(p, 'utf8');

  // A view loading indicator implemented inline looks like
  // `<div className="... animate-spin ... border ...">`. The shared LoadingSpinner is
  // a <motion.div>, and SystemErrorLogs' RefreshCw spinner is a lucide component
  // (`<RefreshCw ... className="animate-spin" />`), so a div-scoped check avoids false
  // positives on legitimate action-progress icons.
  const adHocDivSpinner = /<div\b[^>]*\banimate-spin\b/;

  it('Dashboard imports and uses the StatsSkeleton variant', () => {
    const src = read(files.Dashboard);
    expect(src).toMatch(/from ['"][^'"]*components\/SkeletonLoader['"]/);
    expect(src).toMatch(/<StatsSkeleton/);
    expect(adHocDivSpinner.test(src)).toBe(false);
  });

  it('ComplianceMatrix imports and uses the TableSkeleton variant', () => {
    const src = read(files.ComplianceMatrix);
    expect(src).toMatch(/from ['"][^'"]*components\/SkeletonLoader['"]/);
    expect(src).toMatch(/<TableSkeleton/);
    expect(adHocDivSpinner.test(src)).toBe(false);
  });

  it('SystemErrorLogs imports and uses the TableSkeleton variant (and keeps no div spinner)', () => {
    const src = read(files.SystemErrorLogs);
    expect(src).toMatch(/from ['"][^'"]*components\/SkeletonLoader['"]/);
    expect(src).toMatch(/<TableSkeleton/);
    // The only animate-spin here is the RefreshCw action icon, not a div spinner.
    expect(adHocDivSpinner.test(src)).toBe(false);
    expect(src).toMatch(/<RefreshCw[^>]*animate-spin/);
  });

  it('Notifications imports and uses the CardSkeleton variant and the shared LoadingSpinner', () => {
    const src = read(files.Notifications);
    expect(src).toMatch(/from ['"][^'"]*components\/SkeletonLoader['"]/);
    expect(src).toMatch(/from ['"][^'"]*components\/LoadingSpinner['"]/);
    expect(src).toMatch(/<CardSkeleton/);
    expect(src).toMatch(/<LoadingSpinner/);
    expect(adHocDivSpinner.test(src)).toBe(false);
  });
});
