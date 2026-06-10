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

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ token: 'mock-token' }),
}));

vi.mock('../../api', () => ({
  api: {
    riskRegister: {
      create: vi.fn(),
      delete: vi.fn(),
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

vi.mock('exceljs', () => ({
  default: { Workbook: vi.fn() },
  Workbook: vi.fn(),
}));

vi.mock('../../hooks/useFileUploadValidation', () => ({
  useFileUploadValidation: () => ({
    validateAndFilter: vi.fn().mockResolvedValue([]),
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) => React.createElement('svg', { ...props, ref }));
  return {
    Plus: icon, Search: icon, ShieldAlert: icon, Activity: icon,
    ArrowRight: icon, Info: icon, Upload: icon, Edit: icon, Trash2: icon,
  };
});

// Override motion/react mock
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

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, children, title, onClose }: any) =>
    isOpen ? React.createElement('div', { 'data-testid': 'modal', role: 'dialog' },
      React.createElement('h2', null, title),
      children,
      React.createElement('button', { onClick: onClose }, 'Close')
    ) : null,
}));

vi.mock('../../components/RiskForm', () => ({
  default: ({ onSuccess, onCancel, initialData }: any) =>
    React.createElement('div', { 'data-testid': 'risk-form' },
      React.createElement('button', { onClick: onSuccess }, 'Submit'),
      React.createElement('button', { onClick: onCancel }, 'Cancel'),
    ),
}));

vi.mock('../../components/Badge', () => ({
  default: ({ children, type, value }: any) =>
    React.createElement('span', { 'data-testid': 'badge', 'data-value': value }, value),
}));

vi.mock('../../components/LoadingSpinner', () => ({
  default: ({ size, text }: any) =>
    React.createElement('div', { 'data-testid': 'loading-spinner' }, 'Loading...'),
}));

vi.mock('../../components/InteractiveIcon', () => ({
  default: ({ icon: Icon, onClick, tooltip }: any) =>
    React.createElement('button', { onClick, title: tooltip, 'data-testid': `icon-${tooltip}` },
      React.createElement(Icon || 'span', { size: 16 })
    ),
}));

const mockUseRisks = vi.fn();
vi.mock('../../hooks/useRisks', () => ({
  useRisks: (...args: any[]) => mockUseRisks(...args),
}));

import RiskRegister from '../RiskRegister';

function createMockRisks(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    risk_id: `RSK-${String(i + 1).padStart(3, '0')}`,
    description: `Risk description ${i + 1}`,
    owner: `Owner ${i + 1}`,
    type: i % 2 === 0 ? 'Financial' : 'Operational',
    likelihood: i === 0 ? 'High' : 'Medium',
    impact: i === 0 ? 'High' : 'Low',
    score: (i + 1) * 5,
    rating: i === 0 ? 'Critical' : i === 1 ? 'High' : 'Medium',
    controls: `Control measure ${i + 1}`,
    mitigation: `Mitigation plan ${i + 1}`,
    control_assessment: 'Effective',
    treatment_option: 'Mitigate',
    residual_likelihood: 'Low',
    residual_impact: 'Low',
    residual_score: 2,
    residual_rating: 'Low',
    status: 'Open',
    target_date: '2025-06-30',
    review_date: '2025-03-30',
    notes: '',
    source: 'Internal Audit',
    early_warning: '',
    entry_date: '2025-01-01',
    entered_by: 'Admin',
  }));
}

function setupMock(options?: { loading?: boolean; risks?: any[] }) {
  mockUseRisks.mockReturnValue({
    risks: options?.risks ?? createMockRisks(),
    loading: options?.loading ?? false,
    fetchRisks: vi.fn(),
  });
}

describe('RiskRegister Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the risk register title', () => {
    setupMock();
    render(<RiskRegister />);

    expect(screen.getByText('risks')).toBeInTheDocument();
    expect(screen.getByText('globalInternalAuditStandardsAlignment')).toBeInTheDocument();
  });

  it('renders risk cards with data', () => {
    setupMock();
    render(<RiskRegister />);

    expect(screen.getByText('Risk description 1')).toBeInTheDocument();
    expect(screen.getByText('Risk description 2')).toBeInTheDocument();
    expect(screen.getByText('Risk description 3')).toBeInTheDocument();
  });

  it('renders risk score for each card', () => {
    setupMock();
    render(<RiskRegister />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders owner and type info', () => {
    setupMock();
    render(<RiskRegister />);

    expect(screen.getByText(/Owner 1/)).toBeInTheDocument();
    expect(screen.getByText(/Owner 2/)).toBeInTheDocument();
  });

  it('shows loading state while fetching risks', () => {
    setupMock({ loading: true });
    render(<RiskRegister />);

    expect(screen.getByText('loadingRiskRegister')).toBeInTheDocument();
  });

  it('renders add risk button', () => {
    setupMock();
    render(<RiskRegister />);

    expect(screen.getByText('common.add')).toBeInTheDocument();
  });

  it('renders import excel button', () => {
    setupMock();
    render(<RiskRegister />);

    expect(screen.getByText('importExcel')).toBeInTheDocument();
  });

  it('opens add risk modal when add button is clicked', () => {
    setupMock();
    render(<RiskRegister />);

    fireEvent.click(screen.getByText('common.add'));

    expect(screen.getByTestId('risk-form')).toBeInTheDocument();
  });

  it('renders details button for each risk card', () => {
    setupMock();
    render(<RiskRegister />);

    const detailButtons = screen.getAllByText('details');
    expect(detailButtons.length).toBe(3);
  });

  it('opens details modal when details button is clicked', () => {
    setupMock();
    render(<RiskRegister />);

    const detailButtons = screen.getAllByText('details');
    fireEvent.click(detailButtons[0]!);

    // Details modal should show risk info
    expect(screen.getByText('riskDetails')).toBeInTheDocument();
    // The description appears both in card and in the modal
    const descriptions = screen.getAllByText('Risk description 1');
    expect(descriptions.length).toBeGreaterThanOrEqual(2);
  });

  it('renders empty state when no risks exist', () => {
    setupMock({ risks: [] });
    render(<RiskRegister />);

    // No risk cards should be shown
    expect(screen.queryByText('Risk description 1')).not.toBeInTheDocument();
  });

  it('renders risk rating badges', () => {
    setupMock();
    render(<RiskRegister />);

    const badges = screen.getAllByTestId('badge');
    expect(badges.length).toBe(3);
    expect(badges[0]).toHaveAttribute('data-value', 'Critical');
  });

  it('renders controls and mitigation for each risk', () => {
    setupMock();
    render(<RiskRegister />);

    expect(screen.getByText('Control measure 1')).toBeInTheDocument();
    expect(screen.getByText('Mitigation plan 1')).toBeInTheDocument();
  });

  it('opens edit modal when edit icon is clicked', () => {
    setupMock();
    render(<RiskRegister />);

    const editButtons = screen.getAllByTestId('icon-common.edit');
    fireEvent.click(editButtons[0]!);

    expect(screen.getByTestId('risk-form')).toBeInTheDocument();
    // Modal title should say edit
    expect(screen.getByText('editRisk')).toBeInTheDocument();
  });

  it('opens delete confirmation modal when delete icon is clicked', () => {
    setupMock();
    render(<RiskRegister />);

    const deleteButtons = screen.getAllByTestId('icon-common.delete');
    fireEvent.click(deleteButtons[0]!);

    expect(screen.getByText('deleteConfirm')).toBeInTheDocument();
    expect(screen.getByText('deleteMessage')).toBeInTheDocument();
  });

  it('closes delete modal when cancel is clicked', () => {
    setupMock();
    render(<RiskRegister />);

    const deleteButtons = screen.getAllByTestId('icon-common.delete');
    fireEvent.click(deleteButtons[0]!);

    expect(screen.getByText('deleteConfirm')).toBeInTheDocument();

    fireEvent.click(screen.getByText('common.cancel'));

    expect(screen.queryByText('deleteConfirm')).not.toBeInTheDocument();
  });

  it('calls api delete when confirm delete is clicked', async () => {
    const { api } = await import('../../api');
    (api.riskRegister.delete as any).mockResolvedValue({});
    setupMock();
    render(<RiskRegister />);

    const deleteButtons = screen.getAllByTestId('icon-common.delete');
    fireEvent.click(deleteButtons[0]!);
    fireEvent.click(screen.getByText('common.delete'));

    expect(api.riskRegister.delete).toHaveBeenCalledWith('1');
  });

  it('closes form modal when cancel is clicked in form', () => {
    setupMock();
    render(<RiskRegister />);

    // Open the add modal
    const addButtons = screen.getAllByText('common.add');
    fireEvent.click(addButtons[0]!);

    expect(screen.getByTestId('risk-form')).toBeInTheDocument();

    // Cancel the form
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByTestId('risk-form')).not.toBeInTheDocument();
  });

  it('renders detail view with risk id and status', () => {
    setupMock();
    render(<RiskRegister />);

    const detailButtons = screen.getAllByText('details');
    fireEvent.click(detailButtons[0]!);

    expect(screen.getByText('RSK-001')).toBeInTheDocument();
  });

  it('closes detail modal when close button is clicked', () => {
    setupMock();
    render(<RiskRegister />);

    const detailButtons = screen.getAllByText('details');
    fireEvent.click(detailButtons[0]!);

    expect(screen.getByText('riskDetails')).toBeInTheDocument();

    fireEvent.click(screen.getByText('common.close'));

    expect(screen.queryByText('riskDetails')).not.toBeInTheDocument();
  });

  it('renders likelihood and impact in card view', () => {
    setupMock();
    render(<RiskRegister />);

    const likelihoodLabels = screen.getAllByText('likelihood');
    expect(likelihoodLabels.length).toBeGreaterThan(0);

    const impactLabels = screen.getAllByText('impact');
    expect(impactLabels.length).toBeGreaterThan(0);
  });
});
