// @vitest-environment jsdom
/**
 * Property 3: Preservation - Compliance Matrix Unchanged Behavior
 *
 * **Validates: Requirements 3.1, 3.2, 3.4**
 *
 * PRESERVATION TEST (bugfix workflow).
 *
 * These tests capture behavior that MUST remain unchanged by the fix. They are
 * written observation-first against the UNFIXED code and MUST PASS on it; they
 * MUST continue to pass after the envelope-agnostic fix is applied.
 *
 * The fix only changes the SUCCESS path of `fetchItems` / `fetchSummary` /
 * `fetchUsers` (how the unwrapped payload is read). It does NOT touch the
 * `try/catch` error handling, the filter wiring, or the tab rendering — so all
 * of the following remain identical before and after:
 *
 *   3.1  A genuine `/compliance` request error still surfaces the load-error
 *        state (`complianceMatrix.loadError` toast + error panel).
 *   3.2  After a successful load the search / source-type / status filters still
 *        drive re-fetches with the corresponding query params.
 *   3.4  The registry / gap-matrix / dashboard tabs still render and switch.
 *
 * For the success-path tests we feed the NON-buggy baseline input
 * (`{ success: true, data: [...] }` — i.e. `NOT isBugCondition`, the shape that
 * makes the UNFIXED `if (res.data.success)` branch run). `toList` returns the
 * same inner array after the fix, so items load identically either way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import fc from 'fast-check';
import React from 'react';

// ─── Mocks (mirror the exploration test setup) ──────────────────────────────────

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
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
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

vi.mock('../../api/hooks/useDepartments', () => ({
  useDepartments: () => ({
    departments: [
      { id: '1', name: 'Finance' },
      { id: '2', name: 'IT' },
    ],
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }: any) =>
    React.createElement('button', { onClick, className }, children),
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, children, title, onClose }: any) =>
    isOpen
      ? React.createElement(
          'div',
          { 'data-testid': 'modal', role: 'dialog' },
          React.createElement('h2', null, title),
          children,
          React.createElement(
            'button',
            { onClick: onClose, 'data-testid': 'modal-close' },
            'Close'
          )
        )
      : null,
}));

vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) =>
    React.createElement('svg', { ...props, ref })
  );
  return {
    ShieldCheck: icon, Search: icon, Filter: icon, Plus: icon,
    Edit2: icon, Trash2: icon, Eye: icon, Download: icon, FileText: icon,
    CheckCircle: icon, AlertTriangle: icon, XCircle: icon, AlertCircle: icon,
    LayoutGrid: icon, List: icon, BarChart3: icon, ArrowRight: icon,
    Calendar: icon, User: icon, Building: icon, Tag: icon, Info: icon,
    MoreHorizontal: icon, ChevronRight: icon, FileDown: icon, Layers: icon, Upload: icon,
  };
});

vi.mock('motion/react', () => {
  const ReactLib = require('react');
  const createMotionComponent = (tag: string) =>
    ReactLib.forwardRef(
      (
        {
          children,
          initial,
          animate,
          exit,
          transition,
          whileHover,
          whileTap,
          layout,
          ...props
        }: any,
        ref: any
      ) => ReactLib.createElement(tag, { ...props, ref }, children)
    );
  return {
    motion: new Proxy(
      {},
      {
        get: (_t: any, prop: string) => createMotionComponent(prop),
      }
    ),
    AnimatePresence: ({ children }: any) => children,
  };
});

import ComplianceMatrix from '../ComplianceMatrix/ComplianceMatrixPage';
import toast from 'react-hot-toast';

const LOAD_ERROR_KEY = 'complianceMatrix.loadError';

// ─── Helpers ────────────────────────────────────────────────────────────────────

interface BaselineItem {
  id: string;
  ref_number: string;
  title: string;
  source_type: 'cbi_instruction' | 'law' | 'internal_policy' | 'admin_decision';
  compliance_status: 'compliant' | 'partial' | 'non_compliant' | 'under_review';
  responsible_person_name: string;
}

/** Build the NON-buggy enveloped baseline payload the UNFIXED code expects. */
function envelope<T>(data: T) {
  return { success: true, data };
}

const sampleItems: BaselineItem[] = [
  {
    id: 'cm-1',
    ref_number: 'REF-000001',
    title: 'BaselineComplianceItemAlpha',
    source_type: 'law',
    compliance_status: 'compliant',
    responsible_person_name: 'Person One',
  },
  {
    id: 'cm-2',
    ref_number: 'REF-000002',
    title: 'BaselineComplianceItemBeta',
    source_type: 'internal_policy',
    compliance_status: 'under_review',
    responsible_person_name: 'Person Two',
  },
];

/** Configure all endpoints to resolve with the enveloped baseline (success path). */
function setEnvelopedSuccess(items: BaselineItem[] = sampleItems) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: envelope({ total: items.length }) });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: envelope(items) });
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: envelope([{ id: '1', name: 'User One' }]) });
    }
    return Promise.resolve({ data: envelope([]) });
  });
}

function loadErrorShown(): boolean {
  const toastErrorCalled = (toast.error as any).mock.calls.some(
    (call: any[]) => call[0] === LOAD_ERROR_KEY
  );
  const panelShown = screen.queryAllByText(LOAD_ERROR_KEY).length > 0;
  return toastErrorCalled || panelShown;
}

/** Return the most recent URL passed to `api.get` that targets `/compliance` list. */
function lastComplianceListUrl(): string | undefined {
  const calls = mockApiGet.mock.calls
    .map((c) => c[0] as string)
    .filter((u) => u.startsWith('/compliance?') || u === '/compliance?');
  return calls[calls.length - 1];
}

// ─── 3.1 Genuine error preservation ─────────────────────────────────────────────

describe('Property 3: Preservation - Compliance Matrix genuine error still shows load-error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3.1 a rejected /compliance request still surfaces the load-error toast + panel (PBT over error shapes)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          status: fc.constantFrom(400, 401, 403, 404, 500, 503),
          message: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        async ({ status, message }) => {
          cleanup();
          vi.clearAllMocks();

          mockApiGet.mockImplementation((url: string) => {
            if (url.includes('/compliance/summary')) {
              return Promise.resolve({ data: envelope({ total: 0 }) });
            }
            if (url.includes('/compliance')) {
              // Genuine request error (rejected promise) — outside isBugCondition.
              return Promise.reject(
                Object.assign(new Error(message), { response: { status } })
              );
            }
            if (url.includes('/users')) {
              return Promise.resolve({ data: envelope([]) });
            }
            return Promise.resolve({ data: envelope([]) });
          });

          render(<ComplianceMatrix />);

          // The load-error state must be surfaced exactly as before the fix:
          // toast.error(loadError) AND the error panel (role="alert").
          await waitFor(() => {
            const toastCalled = (toast.error as any).mock.calls.some(
              (call: any[]) => call[0] === LOAD_ERROR_KEY
            );
            expect(toastCalled).toBe(true);
          });

          const alert = await screen.findByRole('alert');
          expect(alert).toHaveTextContent(LOAD_ERROR_KEY);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ─── 3.2 Filters preservation ────────────────────────────────────────────────────

describe('Property 3: Preservation - Compliance Matrix filters drive re-fetch', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('3.2a source-type filter re-fetches /compliance with source_type query param', async () => {
    setEnvelopedSuccess();

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('BaselineComplianceItemAlpha')).toBeInTheDocument();
    });

    // Two filter <select>s: [0] source-type, [1] compliance-status.
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    fireEvent.change(selects[0]!, { target: { value: 'law' } });
    await waitFor(() => {
      expect(lastComplianceListUrl() ?? '').toContain('source_type=law');
    });
    expect(loadErrorShown()).toBe(false);
  });

  it('3.2b status filter re-fetches /compliance with compliance_status query param', async () => {
    setEnvelopedSuccess();

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('BaselineComplianceItemAlpha')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1]!, { target: { value: 'compliant' } });
    await waitFor(() => {
      expect(lastComplianceListUrl() ?? '').toContain('compliance_status=compliant');
    });
    expect(loadErrorShown()).toBe(false);
  });

  it('3.2c search filter re-fetches /compliance with search query param', async () => {
    setEnvelopedSuccess();

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('BaselineComplianceItemAlpha')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      'complianceMatrix.searchPlaceholder'
    );
    fireEvent.change(searchInput, { target: { value: 'audit' } });
    await waitFor(() => {
      expect(lastComplianceListUrl() ?? '').toContain('search=audit');
    });
    expect(loadErrorShown()).toBe(false);
  });
});

// ─── 3.4 Tabs preservation ────────────────────────────────────────────────────────

describe('Property 3: Preservation - Compliance Matrix registry/matrix/dashboard tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3.4 registry, gap-matrix, and dashboard tabs still render and switch after a successful load', async () => {
    setEnvelopedSuccess();

    render(<ComplianceMatrix />);

    // Registry tab is the default — its search toolbar renders.
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('complianceMatrix.searchPlaceholder')
      ).toBeInTheDocument();
    });

    // Switch to the gap-matrix tab.
    fireEvent.click(screen.getByText('complianceMatrix.gapMatrixTab'));
    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.gapMatrix')).toBeInTheDocument();
    });

    // Switch to the dashboard tab.
    fireEvent.click(screen.getByText('complianceMatrix.dashboard'));
    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.totalRecords')).toBeInTheDocument();
    });

    // Switch back to the registry tab — toolbar renders again.
    fireEvent.click(screen.getByText('complianceMatrix.generalRegistry'));
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('complianceMatrix.searchPlaceholder')
      ).toBeInTheDocument();
    });

    expect(loadErrorShown()).toBe(false);
  });
});
