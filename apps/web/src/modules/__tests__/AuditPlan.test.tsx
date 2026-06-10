// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock dependencies
vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: string) => d || '',
    formatNumber: (n: number) => String(n),
    formatDateTime: (d: string) => d,
    translateStatus: (s: string) => s,
    translateName: (n: string) => n,
  }),
}));

vi.mock('../../context/PreferencesContext', () => ({
  usePreferences: () => ({ language: 'en', theme: 'light' }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../api', () => ({
  api: {
    auditPlans: {
      list: vi.fn(),
      delete: vi.fn(),
    },
    findings: {
      list: vi.fn(),
    },
  },
}));

vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockUseAuditPlans = vi.fn();
vi.mock('../../hooks/useAuditPlans', () => ({
  useAuditPlans: (...args: any[]) => mockUseAuditPlans(...args),
}));

const mockUseDebounce = vi.fn((value: string) => value);
vi.mock('../../hooks/useDebounce', () => ({
  useDebounce: (...args: [string]) => mockUseDebounce(...args),
}));

// Mock sub-components that may cause rendering issues
vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, children, title, onClose }: any) => 
    isOpen ? React.createElement('div', { 'data-testid': 'modal', role: 'dialog' }, 
      React.createElement('h2', null, title),
      children,
      React.createElement('button', { onClick: onClose }, 'Close')
    ) : null,
}));

vi.mock('../../components/AuditPlanForm', () => ({
  default: ({ onSuccess, onCancel }: any) => (
    React.createElement('div', { 'data-testid': 'audit-plan-form' },
      React.createElement('button', { onClick: onSuccess }, 'Submit'),
      React.createElement('button', { onClick: onCancel }, 'Cancel')
    )
  ),
}));

vi.mock('../../components/InteractiveIcon', () => ({
  default: ({ icon: Icon, onClick, tooltip }: any) => 
    React.createElement('button', { onClick, title: tooltip, 'data-testid': 'interactive-icon' },
      React.createElement(Icon || 'span', { size: 16 })
    ),
}));

vi.mock('../../components/Badge', () => ({
  default: ({ children, variant }: any) => 
    React.createElement('span', { 'data-testid': 'badge', 'data-variant': variant }, children),
}));

vi.mock('../../components/LoadingSpinner', () => ({
  default: ({ text }: any) => React.createElement('div', { 'data-testid': 'loading-spinner' }, text || 'Loading...'),
}));

vi.mock('../../components/Pagination', () => ({
  default: ({ currentPage, totalPages, onPageChange }: any) => 
    React.createElement('div', { 'data-testid': 'pagination' }, `Page ${currentPage} of ${totalPages}`),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = (props: any) => React.createElement('svg', props);
  return {
    Plus: icon, Search: icon, Filter: icon, MoreVertical: icon,
    Calendar: icon, User: icon, Tag: icon, Edit: icon, Trash2: icon,
  };
});

// Override motion/react mock to include AnimatePresence and all motion elements
vi.mock('motion/react', () => {
  const React = require('react');
  const createMotionComponent = (tag: string) => React.forwardRef(({ children, initial, animate, exit, transition, whileHover, whileTap, layout, ...props }: any, ref: any) => {
    return React.createElement(tag, { ...props, ref }, children);
  });
  return {
    motion: new Proxy({}, {
      get: (_target: any, prop: string) => createMotionComponent(prop),
    }),
    AnimatePresence: ({ children }: any) => children,
  };
});

import AuditPlanModule from '../AuditPlan';

function createMockPlans(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    plan_code: `IA-PL-25-${String(i + 1).padStart(3, '0')}`,
    title: `Audit Plan ${i + 1}`,
    department: `Department ${i + 1}`,
    type: i % 2 === 0 ? 'Financial' : 'Operational',
    risk_rating: i === 0 ? 'High' : i === 1 ? 'Medium' : 'Low',
    status: i === 0 ? 'Draft' : i === 1 ? 'Fieldwork' : 'Closed',
    lead_auditor: `Auditor ${i + 1}`,
    planned_start_date: '2025-01-15',
    planned_end_date: '2025-02-15',
  }));
}

function setupMock(plans: any[] = [], pagination?: any) {
  mockUseAuditPlans.mockReturnValue({
    plans,
    loading: false,
    error: null,
    pagination: pagination || {
      total: plans.length,
      totalPages: 1,
      page: 1,
      limit: 15,
    },
    fetchPlans: vi.fn(),
  });
}

describe('AuditPlan Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDebounce.mockImplementation((value: string) => value);
  });

  it('renders the audit plan list with data', () => {
    const plans = createMockPlans(3);
    setupMock(plans);

    render(<AuditPlanModule />);

    expect(screen.getByText('Audit Plan 1')).toBeInTheDocument();
    expect(screen.getByText('Audit Plan 2')).toBeInTheDocument();
    expect(screen.getByText('Audit Plan 3')).toBeInTheDocument();

    // Plan codes should be visible
    expect(screen.getByText('IA-PL-25-001')).toBeInTheDocument();
    expect(screen.getByText('IA-PL-25-002')).toBeInTheDocument();
  });

  it('renders department and type columns', () => {
    const plans = createMockPlans(2);
    setupMock(plans);

    render(<AuditPlanModule />);

    expect(screen.getByText('Department 1')).toBeInTheDocument();
    expect(screen.getByText('Department 2')).toBeInTheDocument();
  });

  it('renders the search input field', () => {
    setupMock(createMockPlans());

    render(<AuditPlanModule />);

    const searchInput = screen.getByPlaceholderText('plan.search');
    expect(searchInput).toBeInTheDocument();
  });

  it('allows typing in the search field', () => {
    setupMock(createMockPlans());

    render(<AuditPlanModule />);

    const searchInput = screen.getByPlaceholderText('plan.search');
    fireEvent.change(searchInput, { target: { value: 'Financial' } });
    expect(searchInput).toHaveValue('Financial');
  });

  it('shows loading state while fetching plans', () => {
    mockUseAuditPlans.mockReturnValue({
      plans: [],
      loading: true,
      error: null,
      pagination: { total: 0, totalPages: 0, page: 1, limit: 15 },
      fetchPlans: vi.fn(),
    });

    render(<AuditPlanModule />);

    expect(screen.getByText('plan.loadingAuditPlans')).toBeInTheDocument();
  });

  it('renders add plan button', () => {
    setupMock(createMockPlans());

    render(<AuditPlanModule />);

    expect(screen.getByText('plan.add')).toBeInTheDocument();
  });

  it('opens modal when add button is clicked', () => {
    setupMock(createMockPlans());

    render(<AuditPlanModule />);

    fireEvent.click(screen.getByText('plan.add'));

    expect(screen.getByTestId('audit-plan-form')).toBeInTheDocument();
  });

  it('renders table headers correctly', () => {
    setupMock(createMockPlans());

    render(<AuditPlanModule />);

    expect(screen.getByText('plan.code')).toBeInTheDocument();
    expect(screen.getByText('plan.title')).toBeInTheDocument();
    expect(screen.getByText('plan.department')).toBeInTheDocument();
    expect(screen.getByText('plan.type')).toBeInTheDocument();
    expect(screen.getByText('plan.riskRating')).toBeInTheDocument();
    expect(screen.getByText('plan.startDate')).toBeInTheDocument();
    expect(screen.getByText('plan.status')).toBeInTheDocument();
  });

  it('renders empty table when no plans exist', () => {
    setupMock([]);

    render(<AuditPlanModule />);

    // Table headers should still be visible
    expect(screen.getByText('plan.code')).toBeInTheDocument();

    // No plan data should be present
    expect(screen.queryByText('IA-PL-25-001')).not.toBeInTheDocument();
  });
});
