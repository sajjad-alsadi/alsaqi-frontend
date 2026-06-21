// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Property 1: Bug Condition - Compliance Matrix Envelope-Agnostic Consumption
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * EXPLORATORY BUG-CONDITION TEST (bugfix workflow).
 *
 * This test deliberately bypasses the mask used by the existing
 * `ComplianceMatrix.test.tsx`: that test mocks `../../api/httpClient` and returns
 * the ALREADY-ENVELOPED shape (`{ data: { success: true, data: ... } }`), which
 * never exercises the real unwrapping interceptor and therefore hides the bug.
 *
 * Here we mock `api.get` to return the UNWRAPPED payloads the real interceptor in
 * `apps/web/src/api/client.ts` actually produces for success-enveloped responses:
 *   - `/compliance`          -> an array (no `success` field)         e.g. { data: [...] }
 *   - `/compliance` (null)   -> `null`                                e.g. { data: null }
 *   - `/compliance/summary`  -> the inner summary object              e.g. { data: { total } }
 *   - `/users/summary`       -> the inner users array                 e.g. { data: [...] }
 *
 * Bug condition (from design `isBugCondition`): for ComplianceMatrix,
 *   X is null OR X has no field named "success".
 *
 * Expected behavior the fix must satisfy (asserted below): for all such inputs the
 * component does NOT crash, populates state from the unwrapped payload, renders an
 * empty list for null/empty, and NEVER surfaces `complianceMatrix.loadError`.
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: this test FAILS (proving the bug exists).
 * DO NOT "fix" the test when it fails — the failure is the signal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import React from 'react';

// ─── Mocks (mirror the existing module test, but feed UNWRAPPED payloads) ───────

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

// ─── Unwrapped payload generators ───────────────────────────────────────────────

interface UnwrappedItem {
  id: string;
  ref_number: string;
  title: string;
  source_type: 'cbi_instruction' | 'law' | 'internal_policy' | 'admin_decision';
  compliance_status: 'compliant' | 'partial' | 'non_compliant' | 'under_review';
  responsible_person_name: string;
}

/** Arbitrary unwrapped compliance items (the inner array the interceptor leaves behind). */
const arbItem = fc.record({
  seed: fc.integer({ min: 1, max: 1_000_000 }),
  source_type: fc.constantFrom(
    'cbi_instruction',
    'law',
    'internal_policy',
    'admin_decision'
  ) as fc.Arbitrary<UnwrappedItem['source_type']>,
  compliance_status: fc.constantFrom(
    'compliant',
    'partial',
    'non_compliant',
    'under_review'
  ) as fc.Arbitrary<UnwrappedItem['compliance_status']>,
});

/** Arrays of varying length, including empty — the unwrapped list shape. */
const arbUnwrappedList = fc
  .array(arbItem, { minLength: 0, maxLength: 6 })
  .map((rows) =>
    rows.map((r, i): UnwrappedItem => ({
      id: `cm-${r.seed}-${i}`,
      ref_number: `REF-${String(r.seed).padStart(6, '0')}-${i}`,
      title: `ComplianceTitle-${r.seed}-${i}`,
      source_type: r.source_type,
      compliance_status: r.compliance_status,
      responsible_person_name: `Person-${r.seed}-${i}`,
    }))
  );

/**
 * Configure `api.get` to return UNWRAPPED payloads (post-interceptor shape).
 * `complianceData` is placed directly at `res.data` (array or null) — exactly what
 * the real interceptor produces from `{ success: true, data: <complianceData> }`.
 */
function setUnwrappedResponses(
  complianceData: UnwrappedItem[] | null,
  summaryData: unknown = { total: 7 },
  usersData: unknown = [{ id: '1', name: 'User One' }]
) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: summaryData });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: complianceData });
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: usersData });
    }
    return Promise.resolve({ data: [] });
  });
}

function loadErrorShown(): boolean {
  const toastErrorCalled = (toast.error as any).mock.calls.some(
    (call: any[]) => call[0] === LOAD_ERROR_KEY
  );
  const panelShown = screen.queryAllByText(LOAD_ERROR_KEY).length > 0;
  return toastErrorCalled || panelShown;
}

describe('Property 1: Bug Condition - Compliance Matrix Envelope-Agnostic Consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1.1 unwrapped list (array, no `success`) → items render and no load-error (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbUnwrappedList, async (list) => {
        cleanup();
        vi.clearAllMocks();
        setUnwrappedResponses(list);

        render(<ComplianceMatrix />);

        // Wait for the initial load to settle (registry toolbar always renders).
        await waitFor(() => {
          expect(
            screen.getByPlaceholderText('complianceMatrix.searchPlaceholder')
          ).toBeInTheDocument();
        });

        // The load-error state must never be surfaced for a successful response.
        await waitFor(() => {
          expect(loadErrorShown()).toBe(false);
        });

        if (list.length === 0) {
          // Empty list → empty state, no crash, no error.
          await waitFor(() => {
            expect(screen.getByText('complianceMatrix.noRecords')).toBeInTheDocument();
          });
        } else {
          // Non-empty unwrapped list → items must populate state and render.
          await waitFor(() => {
            expect(screen.getByText(list[0]!.title)).toBeInTheDocument();
          });
        }
      }),
      { numRuns: 25 }
    );
  });

  it('1.2 unwrapped to `null` → empty list, no crash, no load-error', async () => {
    setUnwrappedResponses(null);

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('complianceMatrix.searchPlaceholder')
      ).toBeInTheDocument();
    });

    // Reading `.success` off `null` throws a TypeError on unfixed code, which is
    // caught and surfaced as the load-error state. The fix must avoid that.
    await waitFor(() => {
      expect(loadErrorShown()).toBe(false);
    });
    expect(screen.getByText('complianceMatrix.noRecords')).toBeInTheDocument();
  });

  it('1.3 unwrapped summary object → summary populates dashboard total', async () => {
    // Distinct summary total (999) that cannot coincide with the (empty) item count.
    setUnwrappedResponses([], { total: 999 });

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.dashboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('complianceMatrix.dashboard'));

    await waitFor(() => {
      expect(screen.getByText('999')).toBeInTheDocument();
    });
  });

  it('1.4 unwrapped users array → users populate the responsible-person dropdown', async () => {
    setUnwrappedResponses([], { total: 0 }, [
      { id: 'u-1', name: 'Distinct User Alpha' },
    ]);

    render(<ComplianceMatrix />);

    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.addRecord')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('complianceMatrix.addRecord'));

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Distinct User Alpha')).toBeInTheDocument();
    });
  });
});
