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

vi.mock('../../context/UserContext', () => ({
  useUser: () => ({
    user: { id: 1, username: 'admin', role: 'Admin' },
  }),
}));

// Mock @/components/ui/button
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, variant }: any) =>
    React.createElement('button', { onClick, className, 'data-variant': variant }, children),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) => React.createElement('svg', { ...props, ref }));
  return {
    ShieldAlert: icon, Lock: icon, Plus: icon, FileText: icon,
    Eye: icon, EyeOff: icon,
  };
});

// Mock sub-components
vi.mock('../FraudLog/components/AccessGate', () => ({
  AccessGate: ({ isManager, accessStatus }: any) =>
    React.createElement('div', { 'data-testid': 'access-gate' }, `Status: ${accessStatus}`),
}));

vi.mock('../FraudLog/components/FraudTable', () => ({
  FraudTable: ({ cases }: any) =>
    React.createElement('div', { 'data-testid': 'fraud-table' },
      cases.map((c: any) => React.createElement('div', { key: c.id, 'data-testid': `case-${c.id}` }, c.condition))
    ),
}));

vi.mock('../FraudLog/components/AddCaseModal', () => ({
  AddCaseModal: ({ isOpen, onClose, onAdd }: any) =>
    isOpen ? React.createElement('div', { 'data-testid': 'add-case-modal' },
      React.createElement('button', { onClick: onClose }, 'Close Modal'),
      React.createElement('button', { onClick: () => onAdd({ condition: 'Test' }) }, 'Add Case'),
    ) : null,
}));

const mockUseFraudLog = vi.fn();
vi.mock('../FraudLog/hooks/useFraudLog', () => ({
  useFraudLog: (...args: any[]) => mockUseFraudLog(...args),
}));

import FraudLog from '../FraudLog/index';

function createMockCases(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `FR-${i + 1}`,
    detectionDate: '2025-01-15',
    source: 'Internal Audit',
    riskCategory: i % 2 === 0 ? 'Financial' : 'Operational' as const,
    condition: `Fraud case ${i + 1} description`,
    suspects: `Suspect ${i + 1}`,
    financialImpact: `$${(i + 1) * 10000}`,
    status: i === 0 ? 'Open' : 'Under Investigation' as const,
    correctiveActions: `Action ${i + 1}`,
  }));
}

function setupMock(options?: {
  hasAccess?: boolean;
  cases?: any[];
  accessStatus?: string;
}) {
  mockUseFraudLog.mockReturnValue({
    cases: options?.cases ?? createMockCases(),
    policyContent: 'Fraud policy content here',
    requests: [],
    accessStatus: options?.accessStatus ?? 'Approved',
    myRequest: null,
    hasAccess: options?.hasAccess ?? true,
    isRequestModalOpen: false,
    setIsRequestModalOpen: vi.fn(),
    requestReason: '',
    setRequestReason: vi.fn(),
    requestError: null,
    submitAccessRequest: vi.fn(),
    approveRequest: vi.fn(),
    rejectRequest: vi.fn(),
    addCase: vi.fn(),
    savePolicy: vi.fn(),
  });
}

describe('FraudLog Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the fraud log title and confidential label', () => {
    setupMock();
    render(<FraudLog />);

    expect(screen.getByText('integrity.fraud')).toBeInTheDocument();
    expect(screen.getByText('integrity.confidentialAccess')).toBeInTheDocument();
  });

  it('renders the fraud table with cases when user has access', () => {
    setupMock();
    render(<FraudLog />);

    expect(screen.getByTestId('fraud-table')).toBeInTheDocument();
    expect(screen.getByTestId('case-FR-1')).toBeInTheDocument();
    expect(screen.getByTestId('case-FR-2')).toBeInTheDocument();
    expect(screen.getByTestId('case-FR-3')).toBeInTheDocument();
  });

  it('shows access gate when user does not have access', () => {
    setupMock({ hasAccess: false, accessStatus: 'Pending' });
    render(<FraudLog />);

    expect(screen.getByTestId('access-gate')).toBeInTheDocument();
    expect(screen.getByText('Status: Pending')).toBeInTheDocument();
  });

  it('renders report case button for managers', () => {
    setupMock();
    render(<FraudLog />);

    expect(screen.getByText('integrity.reportCase')).toBeInTheDocument();
  });

  it('renders view policy button', () => {
    setupMock();
    render(<FraudLog />);

    expect(screen.getByText('integrity.viewPolicy')).toBeInTheDocument();
  });

  it('opens add case modal when report case button is clicked', () => {
    setupMock();
    render(<FraudLog />);

    fireEvent.click(screen.getByText('integrity.reportCase'));

    expect(screen.getByTestId('add-case-modal')).toBeInTheDocument();
  });

  it('renders cases descriptions in the fraud table', () => {
    const cases = createMockCases(2);
    setupMock({ cases });
    render(<FraudLog />);

    expect(screen.getByText('Fraud case 1 description')).toBeInTheDocument();
    expect(screen.getByText('Fraud case 2 description')).toBeInTheDocument();
  });

  it('renders empty fraud table when no cases exist', () => {
    setupMock({ cases: [] });
    render(<FraudLog />);

    expect(screen.getByTestId('fraud-table')).toBeInTheDocument();
    expect(screen.queryByTestId('case-FR-1')).not.toBeInTheDocument();
  });
});
