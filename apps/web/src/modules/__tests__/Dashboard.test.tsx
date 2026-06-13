// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock dependencies before importing the component
vi.mock('../../context/PreferencesContext', () => ({
  usePreferences: () => ({ language: 'en', theme: 'light' }),
}));

vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: string) => d,
    formatNumber: (n: number) => String(n),
    formatDateTime: (d: string) => d,
    translateStatus: (s: string) => s,
    translateName: (n: string) => n,
  }),
}));

const mockUseDashboardStats = vi.fn();
vi.mock('../../api/hooks/useDashboardStats', () => ({
  useDashboardStats: (...args: any[]) => mockUseDashboardStats(...args),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock lucide-react icons used by Dashboard/index.tsx
vi.mock('lucide-react', () => {
  const icon = (props: any) => React.createElement('svg', props);
  return {
    Activity: icon, AlertCircle: icon, CheckCircle2: icon, Clock: icon,
    FileText: icon, ShieldAlert: icon, Inbox: icon, Send: icon,
    Briefcase: icon, AlertTriangle: icon, TrendingUp: icon, FileSearch: icon,
    History: icon, Plus: icon, Scale: icon, ArrowUpRight: icon, ArrowDownRight: icon,
  };
});

// Mock sub-component hooks
vi.mock('../../hooks/useCountUp', () => ({
  useCountUp: (value: number) => value,
}));

vi.mock('../../hooks/useScrollReveal', () => ({
  useScrollReveal: () => ({ ref: { current: null }, isVisible: true }),
}));

// Mock Dashboard sub-components to simplify testing
vi.mock('../Dashboard/DashboardHeader', () => ({
  default: ({ activeFilter, setActiveFilter }: any) => 
    React.createElement('div', { 'data-testid': 'dashboard-header' }, 'Dashboard Header'),
}));

vi.mock('../Dashboard/DashboardKpiGrid', () => ({
  default: ({ cards }: any) => 
    React.createElement('div', { 'data-testid': 'kpi-grid' },
      cards.map((card: any) => 
        React.createElement('div', { key: card.id, 'data-testid': `kpi-${card.id}` },
          React.createElement('p', null, card.title),
          React.createElement('p', null, String(card.value)),
          card.trend && React.createElement('span', null, card.trend)
        )
      )
    ),
}));

vi.mock('../Dashboard/DashboardAuditProgress', () => ({
  default: () => React.createElement('div', { 'data-testid': 'audit-progress' }, 'Audit Progress'),
}));

vi.mock('../Dashboard/DashboardRiskOverview', () => ({
  default: () => React.createElement('div', { 'data-testid': 'risk-overview' }, 'Risk Overview'),
}));

vi.mock('../Dashboard/DashboardActivityFeed', () => ({
  default: () => React.createElement('div', { 'data-testid': 'activity-feed' }, 'Activity Feed'),
}));

vi.mock('../Dashboard/DashboardQuickActions', () => ({
  default: () => React.createElement('div', { 'data-testid': 'quick-actions' }, 'Quick Actions'),
}));

import Dashboard from '../Dashboard/index';

function createMockStats(overrides?: Partial<any>) {
  return {
    audits: {
      total: 25,
      completed: 18,
      progress_by_type: [
        { type: 'Operational', planned: 8, completed: 5 },
        { type: 'Financial', planned: 6, completed: 4 },
        { type: 'Compliance', planned: 5, completed: 3 },
        { type: 'IT', planned: 4, completed: 4 },
        { type: 'AML', planned: 2, completed: 2 },
      ],
    },
    findings: {
      summary: { open: 12, high_risk_open: 3 },
    },
    recommendations: {
      open: 8,
      overdue: 2,
    },
    risks: {
      summary: { total: 15, high: 4 },
    },
    correspondence: {
      incoming_total: 45,
      outgoing_total: 30,
      pending_responses: 7,
    },
    compliance: {
      total: 10,
    },
    activity: [],
    ...overrides,
  };
}

describe('Dashboard Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders KPI stat cards with mock data', () => {
    const stats = createMockStats();
    mockUseDashboardStats.mockReturnValue({ stats, loading: false, error: null, refresh: vi.fn() });

    render(<Dashboard />);

    // Total audits
    expect(screen.getByText('dashboard.totalAudits')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    // Completed audits
    expect(screen.getByText('dashboard.completedAudits')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();

    // Open findings
    expect(screen.getByText('dashboard.openFindings')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    // High risk findings
    expect(screen.getByText('dashboard.highRiskFindings')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders correspondence stats cards', () => {
    const stats = createMockStats();
    mockUseDashboardStats.mockReturnValue({ stats, loading: false, error: null, refresh: vi.fn() });

    render(<Dashboard />);

    expect(screen.getByText('dashboard.incomingCorrespondence')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();

    expect(screen.getByText('dashboard.outgoingCorrespondence')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();

    expect(screen.getByText('dashboard.pendingResponses')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders risk and recommendation stats', () => {
    const stats = createMockStats();
    mockUseDashboardStats.mockReturnValue({ stats, loading: false, error: null, refresh: vi.fn() });

    render(<Dashboard />);

    expect(screen.getByText('dashboard.totalRisks')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    expect(screen.getByText('dashboard.highRisks')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    expect(screen.getByText('dashboard.openRecommendations')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();

    expect(screen.getByText('dashboard.overdueRecommendations')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows loading state while fetching stats', () => {
    mockUseDashboardStats.mockReturnValue({ stats: null, loading: true, error: null, refresh: vi.fn() });

    render(<Dashboard />);

    // While loading, the dashboard renders the shared stats skeleton.
    expect(screen.getByTestId('stats-skeleton')).toBeInTheDocument();
  });

  it('shows error state when API fails', () => {
    // Error state now takes precedence over the loading/skeleton branch:
    // when the query fails, the component renders an error indication
    // (error heading, the error message, and a retry action) and never
    // leaves the skeleton visible.
    mockUseDashboardStats.mockReturnValue({ stats: null, loading: false, error: 'Network error', refresh: vi.fn() });

    render(<Dashboard />);

    // Error heading and the surfaced error message are shown.
    expect(screen.getByText('common.error')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
    // A retry action is offered.
    expect(screen.getByText('dashboard.retry')).toBeInTheDocument();
    // The skeleton is no longer displayed once an error is present.
    expect(screen.queryByTestId('stats-skeleton')).not.toBeInTheDocument();
  });

  it('calculates completion rate correctly', () => {
    const stats = createMockStats({ audits: { total: 20, completed: 15, progress_by_type: [] } });
    mockUseDashboardStats.mockReturnValue({ stats, loading: false, error: null, refresh: vi.fn() });

    render(<Dashboard />);

    // Completion rate = (15/20)*100 = 75%
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders compliance stats', () => {
    const stats = createMockStats();
    mockUseDashboardStats.mockReturnValue({ stats, loading: false, error: null, refresh: vi.fn() });

    render(<Dashboard />);

    expect(screen.getByText('dashboard.activeInstructions')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
