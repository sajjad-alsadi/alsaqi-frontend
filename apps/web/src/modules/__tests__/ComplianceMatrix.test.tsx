// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('../../hooks/useFileUploadValidation', () => ({
  useFileUploadValidation: () => ({
    validateAndFilter: vi.fn().mockResolvedValue([]),
  }),
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPatch = vi.fn();

vi.mock('../../api/httpClient', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
    patch: (...args: any[]) => mockApiPatch(...args),
  },
}));

vi.mock('../../hooks/useDepartments', () => ({
  useDepartments: () => ({
    departments: [
      { id: '1', name: 'Finance' },
      { id: '2', name: 'IT' },
    ],
  }),
}));

// Mock @/components/ui/button
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }: any) =>
    React.createElement('button', { onClick, className }, children),
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, children, title, onClose }: any) =>
    isOpen ? React.createElement('div', { 'data-testid': 'modal', role: 'dialog' },
      React.createElement('h2', null, title),
      children,
      React.createElement('button', { onClick: onClose, 'data-testid': 'modal-close' }, 'Close')
    ) : null,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) => React.createElement('svg', { ...props, ref }));
  return {
    ShieldCheck: icon, Search: icon, Filter: icon, Plus: icon,
    Edit2: icon, Trash2: icon, Eye: icon, Download: icon, FileText: icon,
    CheckCircle: icon, AlertTriangle: icon, XCircle: icon, AlertCircle: icon,
    LayoutGrid: icon, List: icon, BarChart3: icon, ArrowRight: icon,
    Calendar: icon, User: icon, Building: icon, Tag: icon, Info: icon,
    MoreHorizontal: icon, ChevronRight: icon, FileDown: icon, Layers: icon, Upload: icon,
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
    AnimatePresence: ({ children, mode }: any) => children,
  };
});

import ComplianceMatrix from '../ComplianceMatrix/ComplianceMatrixPage';

function createMockItems(count: number = 3) {
  const statuses = ['compliant', 'partial', 'non_compliant', 'under_review'] as const;
  const sources = ['cbi_instruction', 'law', 'internal_policy', 'admin_decision'] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `cm-${i + 1}`,
    ref_number: `REF-${String(i + 1).padStart(3, '0')}`,
    title: `Compliance Item ${i + 1}`,
    source_type: sources[i % sources.length]!,
    issuing_authority: 'Central Bank',
    category: 'Banking',
    issue_date: '2025-01-01',
    effective_date: '2025-02-01',
    review_date: '2025-12-31',
    compliance_status: statuses[i % statuses.length]!,
    maturity_score: 75,
    gap_notes: null,
    responsible_person_id: '1',
    responsible_person_name: `Person ${i + 1}`,
    department_id: '1',
    department_name: 'Finance',
    description: `Description for item ${i + 1}`,
    keywords: 'compliance,banking',
    version: '1.0',
    attachment_path: null,
    open_findings_count: i === 2 ? 3 : 0,
  }));
}

describe('ComplianceMatrix Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default API responses
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/compliance/summary')) {
        return Promise.resolve({ data: { success: true, data: { total: 3, compliant: 1, partial: 1, non_compliant: 1 } } });
      }
      if (url.includes('/compliance')) {
        return Promise.resolve({ data: { success: true, data: createMockItems() } });
      }
      if (url.includes('/users')) {
        return Promise.resolve({ data: { success: true, data: [{ id: '1', name: 'User 1' }] } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });
  });

  it('renders the compliance matrix with tabs', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.generalRegistry')).toBeInTheDocument();
    });
    expect(screen.getByText('complianceMatrix.gapMatrixTab')).toBeInTheDocument();
    expect(screen.getByText('complianceMatrix.dashboard')).toBeInTheDocument();
  });

  it('renders search input on registry tab', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('complianceMatrix.searchPlaceholder');
      expect(searchInput).toBeInTheDocument();
    });
  });

  it('renders add record button', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.addRecord')).toBeInTheDocument();
    });
  });

  it('renders table headers in registry tab', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.ref')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.titleData')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.source')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.complianceStatus')).toBeInTheDocument();
    });
  });

  it('renders compliance items from API', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('Compliance Item 1')).toBeInTheDocument();
      expect(screen.getByText('Compliance Item 2')).toBeInTheDocument();
      expect(screen.getByText('Compliance Item 3')).toBeInTheDocument();
    });
  });

  it('renders ref numbers for items', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('REF-001')).toBeInTheDocument();
      expect(screen.getByText('REF-002')).toBeInTheDocument();
      expect(screen.getByText('REF-003')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    // Mock slow response
    mockApiGet.mockImplementation(() => new Promise(() => {}));
    render(<ComplianceMatrix />);

    // While loading with no items yet, the shared table skeleton is shown.
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('shows empty state when no items found', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/compliance/summary')) {
        return Promise.resolve({ data: { success: true, data: { total: 0 } } });
      }
      if (url.includes('/compliance')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url.includes('/users')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.noRecords')).toBeInTheDocument();
    });
  });

  it('switches to matrix tab when clicked', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.gapMatrixTab')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('complianceMatrix.gapMatrixTab'));

    await waitFor(() => {
      // Matrix view shows status columns
      expect(screen.getByText('complianceMatrix.compliant')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.partial')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.nonCompliant')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.underReview')).toBeInTheDocument();
    });
  });

  it('switches to dashboard tab when clicked', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.dashboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('complianceMatrix.dashboard'));

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.totalRecords')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.fullyCompliant')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    const toast = (await import('react-hot-toast')).default;
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/compliance') && !url.includes('summary')) {
        return Promise.reject(new Error('Network error'));
      }
      if (url.includes('/users')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.resolve({ data: { success: true, data: {} } });
    });

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('complianceMatrix.loadError');
    });
  });

  it('allows typing in search field', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('complianceMatrix.searchPlaceholder');
      expect(searchInput).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('complianceMatrix.searchPlaceholder');
    fireEvent.change(searchInput, { target: { value: 'test query' } });
    expect(searchInput).toHaveValue('test query');
  });

  it('opens add form modal when add record is clicked', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.addRecord')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('complianceMatrix.addRecord'));

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  it('renders source filter dropdown', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.allSources')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.cbiInstruction')).toBeInTheDocument();
      expect(screen.getByText('complianceMatrix.law')).toBeInTheDocument();
    });
  });

  it('renders status filter dropdown', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.allStatuses')).toBeInTheDocument();
    });
  });

  it('renders responsible person names in table', async () => {
    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('Person 1')).toBeInTheDocument();
      expect(screen.getByText('Person 2')).toBeInTheDocument();
    });
  });
});
