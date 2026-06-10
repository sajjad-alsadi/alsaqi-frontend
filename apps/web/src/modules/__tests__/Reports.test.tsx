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

vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock sub-components
vi.mock('../Reports/components/KPICards', () => ({
  default: ({ execData, onCardClick }: any) =>
    React.createElement('div', { 'data-testid': 'kpi-cards' }, `Total: ${execData.totalAudits}`),
}));

vi.mock('../Reports/components/ExecutiveCharts', () => ({
  default: ({ execData }: any) =>
    React.createElement('div', { 'data-testid': 'executive-charts' }, 'Charts'),
}));

vi.mock('../Reports/components/TopRisksList', () => ({
  default: ({ risks }: any) =>
    React.createElement('div', { 'data-testid': 'top-risks' }, `Risks: ${risks.length}`),
}));

vi.mock('../Reports/components/ReportFilters', () => ({
  default: ({ searchQuery, setSearchQuery }: any) =>
    React.createElement('div', { 'data-testid': 'report-filters' },
      React.createElement('input', {
        'data-testid': 'search-input',
        value: searchQuery,
        onChange: (e: any) => setSearchQuery(e.target.value),
        placeholder: 'Search reports',
      })
    ),
}));

vi.mock('../Reports/components/AuditReportCard', () => ({
  default: ({ report, onDownload, onDelete }: any) =>
    React.createElement('div', { 'data-testid': `report-card-${report.id}` },
      React.createElement('span', null, report.title),
      React.createElement('button', { 'data-testid': `download-${report.id}`, onClick: () => onDownload(report) }, 'Download'),
      React.createElement('button', { 'data-testid': `delete-${report.id}`, onClick: () => onDelete(report.id) }, 'Delete'),
    ),
}));

vi.mock('../Reports/components/ReportFormModal', () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? React.createElement('div', { 'data-testid': 'report-form-modal' },
      React.createElement('button', { onClick: onClose }, 'Close Form')
    ) : null,
}));

vi.mock('../Reports/components/ScheduleReportModal', () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? React.createElement('div', { 'data-testid': 'schedule-modal' },
      React.createElement('button', { onClick: onClose }, 'Close Schedule')
    ) : null,
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, children, title, onClose }: any) =>
    isOpen ? React.createElement('div', { 'data-testid': 'modal', role: 'dialog' },
      React.createElement('h2', null, title),
      children,
      React.createElement('button', { onClick: onClose }, 'Close')
    ) : null,
}));

vi.mock('../../components/ChartContainer', () => ({
  default: ({ children, debugName }: any) =>
    React.createElement('div', { 'data-testid': `chart-${debugName}` }, children(400, 300)),
}));

// Mock recharts
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => React.createElement('div', { 'data-testid': 'pie-chart' }, children),
  Pie: ({ children }: any) => React.createElement('div', null, children),
  Cell: () => React.createElement('div'),
  Tooltip: () => React.createElement('div'),
  Legend: () => React.createElement('div'),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) => React.createElement('svg', { ...props, ref }));
  return {
    FileText: icon, Plus: icon, Download: icon, BarChart3: icon,
    Calendar: icon, LayoutDashboard: icon, FileBarChart: icon,
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

// Mock @/components/ui/button
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }: any) =>
    React.createElement('button', { onClick, className }, children),
}));

const mockUseReports = vi.fn();
vi.mock('../Reports/hooks/useReports', () => ({
  useReports: (...args: any[]) => mockUseReports(...args),
}));

import Reports from '../Reports/index';

function createMockExecData() {
  return {
    totalAudits: 12,
    completedAudits: 8,
    highRiskFindings: 5,
    topRisks: [
      { description: 'Risk 1', rating: 'High', owner: 'User 1' },
      { description: 'Risk 2', rating: 'Medium', owner: 'User 2' },
    ],
    findingsByDept: [
      { department: 'Finance', count: 10 },
      { department: 'IT', count: 7 },
    ],
    findingsTrend: [
      { month: 'Jan', count: 3 },
      { month: 'Feb', count: 5 },
    ],
  };
}

function createMockReports(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Report ${i + 1}`,
    report_type: 'auditReport',
    generated_by: `User ${i + 1}`,
    date_generated: '2025-01-15',
    status: 'Final',
    audit_id: i + 1,
    content: '{}',
  }));
}

function setupMock(options?: {
  loading?: boolean;
  execLoading?: boolean;
  execData?: any;
  reports?: any[];
  error?: string | null;
}) {
  mockUseReports.mockReturnValue({
    reports: options?.reports ?? createMockReports(),
    audits: [
      { id: 1, title: 'Audit 1', department: 'Finance', risk_rating: 'High' },
      { id: 2, title: 'Audit 2', department: 'IT', risk_rating: 'Medium' },
    ],
    loading: options?.loading ?? false,
    execData: options?.execData ?? createMockExecData(),
    execLoading: options?.execLoading ?? false,
    error: options?.error ?? null,
    setError: vi.fn(),
    isModalOpen: false,
    setIsModalOpen: vi.fn(),
    isDeleteModalOpen: false,
    setIsDeleteModalOpen: vi.fn(),
    isScheduleModalOpen: false,
    setIsScheduleModalOpen: vi.fn(),
    itemToDelete: null,
    setItemToDelete: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    deptFilter: '',
    setDeptFilter: vi.fn(),
    statusFilter: '',
    setStatusFilter: vi.fn(),
    riskFilter: '',
    setRiskFilter: vi.fn(),
    reportTypes: [
      { id: 'auditReport', label: 'Audit Report', description: 'Desc' },
      { id: 'quarterlyReport', label: 'Quarterly Report', description: 'Desc' },
    ],
    selectedAuditId: null,
    setSelectedAuditId: vi.fn(),
    findings: [],
    setFindings: vi.fn(),
    selectedFindings: [],
    reportTitle: '',
    setReportTitle: vi.fn(),
    reportSummary: '',
    setReportSummary: vi.fn(),
    selectedReportType: 'auditReport',
    handleAuditSelect: vi.fn(),
    toggleFinding: vi.fn(),
    handleReportTypeSelect: vi.fn(),
    generateAuditPDF: vi.fn(),
    generateExecPDF: vi.fn(),
    saveReport: vi.fn(),
    confirmDelete: vi.fn(),
    downloadExistingReport: vi.fn(),
    filteredReports: options?.reports ?? createMockReports(),
  });
}

describe('Reports Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the reports title and subtitle', () => {
    setupMock();
    render(<Reports />);

    expect(screen.getByText('reports.title')).toBeInTheDocument();
    expect(screen.getByText('reports.executiveSubtitle')).toBeInTheDocument();
  });

  it('renders executive and audit tab buttons', () => {
    setupMock();
    render(<Reports />);

    expect(screen.getByText('reports.executiveReports')).toBeInTheDocument();
    expect(screen.getByText('reports.auditReports')).toBeInTheDocument();
  });

  it('renders executive dashboard by default with KPI cards', () => {
    setupMock();
    render(<Reports />);

    expect(screen.getByTestId('kpi-cards')).toBeInTheDocument();
    expect(screen.getByText('Total: 12')).toBeInTheDocument();
  });

  it('shows executive charts and top risks on executive tab', () => {
    setupMock();
    render(<Reports />);

    expect(screen.getByTestId('executive-charts')).toBeInTheDocument();
    expect(screen.getByTestId('top-risks')).toBeInTheDocument();
    expect(screen.getByText('Risks: 2')).toBeInTheDocument();
  });

  it('shows loading state for executive data', () => {
    setupMock({ execLoading: true, execData: null });
    render(<Reports />);

    expect(screen.getByText('reports.loadingAnalytics')).toBeInTheDocument();
  });

  it('switches to audit reports tab when clicked', () => {
    setupMock();
    render(<Reports />);

    fireEvent.click(screen.getByText('reports.auditReports'));

    // After clicking, the state changes and shows audit tab content
    // The audit tab renders report cards
    expect(screen.getByTestId('report-filters')).toBeInTheDocument();
  });

  it('displays report cards in audit tab', () => {
    // Simulate audit sub-tab being active
    const reports = createMockReports(2);
    setupMock({ reports });

    render(<Reports />);
    fireEvent.click(screen.getByText('reports.auditReports'));

    expect(screen.getByTestId('report-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('report-card-2')).toBeInTheDocument();
    expect(screen.getByText('Report 1')).toBeInTheDocument();
    expect(screen.getByText('Report 2')).toBeInTheDocument();
  });

  it('shows loading state for audit reports', () => {
    setupMock({ loading: true });
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.auditReports'));

    expect(screen.getByText('reports.loadingReports')).toBeInTheDocument();
  });

  it('shows empty state when no reports exist', () => {
    setupMock({ reports: [] });
    mockUseReports.mockReturnValue({
      ...mockUseReports(),
      reports: [],
      filteredReports: [],
    });
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.auditReports'));

    expect(screen.getByText('reports.noReportsYet')).toBeInTheDocument();
  });

  it('renders error message when error state is set', () => {
    setupMock({ error: 'Something went wrong' });
    render(<Reports />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders schedule report and generate buttons on executive tab', () => {
    setupMock();
    render(<Reports />);

    expect(screen.getByText('reports.scheduleReport')).toBeInTheDocument();
    expect(screen.getByText('reports.generateExecutiveReport')).toBeInTheDocument();
  });

  it('renders new report button on audit tab', () => {
    setupMock();
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.auditReports'));

    expect(screen.getByText('reports.newReport')).toBeInTheDocument();
  });
});
