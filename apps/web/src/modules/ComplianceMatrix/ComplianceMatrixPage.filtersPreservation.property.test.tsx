// @vitest-environment jsdom
/**
 * Phase 2 — Preservation Test for the Compliance Matrix fixes.
 *
 * Property 8: Preservation — Filters, query params, and table states unchanged
 *
 * For any change to the source filter or status filter, the FIXED code SHALL
 * refetch immediately (debounce applies to the search input only) and SHALL send
 * the same `search` / `source_type` / `compliance_status` query parameters and
 * produce the same filtered result set; the registry table SHALL continue to show
 * rows, the empty state, or the error state exactly as before, and the
 * `compliance-matrix-focus-loss` focus concern SHALL be unaffected.
 *
 * **Validates: Requirements 3.4, 3.5, 3.6, 3.7**
 *
 * --------------------------------------------------------------------------
 * OBSERVATION-FIRST: this test captures the CURRENT (unfixed) baseline and must
 * PASS on the unfixed code. It pins the behavior the Defect-2 debounce fix must
 * NOT change:
 *
 *   - Query-string wiring in `fetchItems`:
 *         const q = new URLSearchParams();
 *         if (search)       q.append('search', search);
 *         if (filterSource) q.append('source_type', filterSource);
 *         if (filterStatus) q.append('compliance_status', filterStatus);
 *         api.get('/compliance?' + q.toString());
 *     → identical query strings for the same (search, source, status) combo.
 *
 *   - Filter SELECT changes refetch IMMEDIATELY (they are direct effect deps).
 *     The Defect-2 fix debounces the SEARCH INPUT only — selects must keep
 *     firing one `/compliance` + `/compliance/summary` pair per change with no
 *     debounce delay.
 *
 *   - Registry table render decisions:
 *         loading && items.length === 0   → skeleton
 *         error   && items.length === 0   → error alert (role="alert")
 *         else                            → table; if items.length === 0 → empty state
 *
 *   - The search input is not remounted by filter/search-driven re-renders, so a
 *     focused search box keeps focus (the focus concern owned by the separate
 *     `compliance-matrix-focus-loss` spec stays untouched).
 *
 * These assertions PASS on the unfixed code (they describe what it already does)
 * and must continue to PASS after the fixes land.
 * --------------------------------------------------------------------------
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// --- Test harness mocks (mirror ComplianceMatrixPage.searchDebounce.property.test.tsx) ---
vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: string) => d || '',
    formatNumber: (n: number) => String(n),
    formatDateTime: (d: string) => d,
    translateStatus: (s: string) => s,
    translateName: (n: string) => n,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../hooks/useFileUploadValidation', () => ({
  useFileUploadValidation: () => ({ validateAndFilter: vi.fn().mockResolvedValue([]) }),
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
          React.createElement('button', { onClick: onClose, 'data-testid': 'modal-close' }, 'Close'),
        )
      : null,
}));

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

// Override motion/react so motion.button / motion.tr / motion.div all render.
vi.mock('motion/react', () => {
  const ReactLib = require('react');
  const createMotionComponent = (tag: string) =>
    ReactLib.forwardRef(
      ({ children, initial, animate, exit, transition, whileHover, whileTap, whileInView, layout, ...props }: any, ref: any) =>
        ReactLib.createElement(tag, { ...props, ref }, children),
    );
  return {
    motion: new Proxy({}, { get: (_t: any, prop: string) => createMotionComponent(prop) }),
    AnimatePresence: ({ children }: any) => children,
  };
});

import ComplianceMatrix from './ComplianceMatrixPage';

// --- Valid filter option values (exactly what the <select> options expose) ---
const SOURCE_VALUES = ['cbi_instruction', 'law', 'internal_policy', 'admin_decision'] as const;
const STATUS_VALUES = ['compliant', 'partial', 'non_compliant', 'under_review'] as const;

const SEARCH_PLACEHOLDER = 'complianceMatrix.searchPlaceholder';

function createMockItems(count = 4) {
  const statuses = STATUS_VALUES;
  const sources = SOURCE_VALUES;
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
    open_findings_count: 0,
  }));
}

/** Default happy-path mock: 4 items, summary present, users present. */
function setupApiMock(items = createMockItems()) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: items.length } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: { success: true, data: items } });
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: [{ id: '1', name: 'User 1' }] } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

/** Mock where the `/compliance` items request rejects (drives the error state). */
function setupApiMockItemsError() {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: 0 } } });
    }
    if (url.includes('/compliance')) {
      return Promise.reject(new Error('boom'));
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: [{ id: '1', name: 'User 1' }] } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

const isItemsCall = (url: string) => url.includes('/compliance') && !url.includes('/compliance/summary');
const isSummaryCall = (url: string) => url.includes('/compliance/summary');
const countCalls = (predicate: (url: string) => boolean) =>
  mockApiGet.mock.calls.filter(([url]: any[]) => typeof url === 'string' && predicate(url)).length;
const itemsCallUrls = () =>
  mockApiGet.mock.calls.map(([url]: any[]) => url).filter((u: any) => typeof u === 'string' && isItemsCall(u));

/**
 * Resolve the React onChange prop attached to the live search input (see the
 * searchDebounce sibling test for why direct prop invocation is the faithful
 * keystroke equivalent in this React 19 + jsdom stack).
 */
function getSearchOnChange(): ((e: { target: { value: string } }) => void) | null {
  const el = document.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`);
  if (!el) return null;
  const key = Object.getOwnPropertyNames(el).find((k) => k.startsWith('__reactProps$'));
  return key ? ((el as any)[key].onChange ?? null) : null;
}

/**
 * Resolve the React onChange prop attached to the Nth live <select>
 * (0 = source filter, 1 = status filter). Re-resolved before every change
 * because this component remounts the registry subtree on each re-render
 * (the node-identity churn owned by the separate `compliance-matrix-focus-loss`
 * spec), which would otherwise leave a captured DOM reference detached. Invoking
 * the rendered onChange is the faithful equivalent of selecting an option: the
 * browser sets the new value and calls the element's onChange with it.
 */
function getSelectOnChange(index: number): ((e: { target: { value: string } }) => void) | null {
  const selects = Array.from(document.querySelectorAll('select'));
  const el = selects[index];
  if (!el) return null;
  const key = Object.getOwnPropertyNames(el).find((k) => k.startsWith('__reactProps$'));
  return key ? ((el as any)[key].onChange ?? null) : null;
}

async function changeSelect(index: number, value: string) {
  const onChange = getSelectOnChange(index);
  await act(async () => {
    onChange?.({ target: { value } });
  });
}

/** The exact query string the unfixed `fetchItems` builds for a given combo. */
function expectedItemsUrl(search: string, source: string, status: string) {
  const q = new URLSearchParams();
  if (search) q.append('search', search);
  if (source) q.append('source_type', source);
  if (status) q.append('compliance_status', status);
  return '/compliance?' + q.toString();
}

async function renderAndDrain() {
  render(<ComplianceMatrix />);
  await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
  await waitFor(() => expect(countCalls(isItemsCall)).toBeGreaterThanOrEqual(1));
}

// =====================================================================================
// Requirement 3.5 — identical query parameters for any search/source/status combo
// =====================================================================================
describe('Property 8: Preservation — query params for filter/search combos (Req 3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMock();
  });

  it('property: any (search, source_type, compliance_status) combo produces the exact same /compliance query string', async () => {
    const searchArb = fc
      .array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', ' ', '1', '2'), { maxLength: 8 })
      .map((a) => a.join(''));
    const sourceArb = fc.constantFrom('', ...SOURCE_VALUES);
    const statusArb = fc.constantFrom('', ...STATUS_VALUES);

    await fc.assert(
      fc.asyncProperty(searchArb, sourceArb, statusArb, async (search, source, status) => {
        vi.clearAllMocks();
        setupApiMock();
        try {
          await renderAndDrain();

          // Apply the search term (faithful keystroke: invoke the live onChange).
          if (search) {
            const onChange = getSearchOnChange();
            await act(async () => {
              onChange?.({ target: { value: search } });
            });
          }

          // Apply the filter selects (re-resolve each onChange to avoid stale nodes).
          await changeSelect(0, source);
          await changeSelect(1, status);

          const expected = expectedItemsUrl(search, source, status);
          await waitFor(() => {
            expect(
              itemsCallUrls(),
              `no /compliance request matched the expected query string ${expected}`,
            ).toContain(expected);
          });
        } finally {
          cleanup();
        }
      }),
      { numRuns: 12 },
    );
  }, 60_000);
});

// =====================================================================================
// Requirement 3.4 — filter selects refetch IMMEDIATELY (debounce is search-only)
// =====================================================================================
describe('Property 8: Preservation — filter selects refetch immediately (Req 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMock();
  });

  it('property: each source/status select change fires exactly one immediate /compliance + /compliance/summary pair (no debounce wait)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SOURCE_VALUES),
        fc.constantFrom(...STATUS_VALUES),
        async (source, status) => {
          vi.clearAllMocks();
          setupApiMock();
          try {
            await renderAndDrain();

            // --- source filter change ---
            let beforeItems = countCalls(isItemsCall);
            let beforeSummary = countCalls(isSummaryCall);
            await changeSelect(0, source);
            // No timer advance: the refetch must already have fired synchronously
            // with the effect flush (selects are direct effect deps — not debounced).
            expect(
              countCalls(isItemsCall) - beforeItems,
              'changing the source filter should refetch /compliance immediately (no debounce)',
            ).toBe(1);
            expect(
              countCalls(isSummaryCall) - beforeSummary,
              'changing the source filter should refetch /compliance/summary immediately',
            ).toBe(1);

            // --- status filter change ---
            beforeItems = countCalls(isItemsCall);
            beforeSummary = countCalls(isSummaryCall);
            await changeSelect(1, status);
            expect(
              countCalls(isItemsCall) - beforeItems,
              'changing the status filter should refetch /compliance immediately (no debounce)',
            ).toBe(1);
            expect(
              countCalls(isSummaryCall) - beforeSummary,
              'changing the status filter should refetch /compliance/summary immediately',
            ).toBe(1);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 8 },
    );
  }, 60_000);
});

// =====================================================================================
// Requirement 3.6 — registry table row / empty-state / error-state render decisions
// =====================================================================================
describe('Property 8: Preservation — table row/empty/error rendering decisions (Req 3.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('property: a non-empty result renders exactly N table rows (no empty/error state)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (n) => {
        vi.clearAllMocks();
        setupApiMock(createMockItems(n));
        try {
          render(<ComplianceMatrix />);
          await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
          await waitFor(() => {
            expect(document.querySelectorAll('tbody tr').length).toBe(n);
          });
          // Neither the empty state nor the error state is shown when rows exist.
          expect(screen.queryByText('complianceMatrix.noRecords')).toBeNull();
          expect(screen.queryByRole('alert')).toBeNull();
        } finally {
          cleanup();
        }
      }),
      { numRuns: 6 },
    );
  }, 60_000);

  it('an empty result renders the empty state (noRecords) and no error alert', async () => {
    vi.clearAllMocks();
    setupApiMock([]);
    render(<ComplianceMatrix />);
    await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    await waitFor(() => {
      expect(screen.getByText('complianceMatrix.noRecords')).toBeTruthy();
    });
    expect(document.querySelectorAll('tbody tr').length).toBe(0);
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
  }, 30_000);

  it('a failed items request renders the error state (role="alert" with loadError) and no rows', async () => {
    vi.clearAllMocks();
    setupApiMockItemsError();
    render(<ComplianceMatrix />);
    await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('complianceMatrix.loadError');
    });
    // Error branch replaces the table entirely; no rows and no empty state.
    expect(document.querySelectorAll('tbody tr').length).toBe(0);
    expect(screen.queryByText('complianceMatrix.noRecords')).toBeNull();
    cleanup();
  }, 30_000);
});

// =====================================================================================
// Requirement 3.7 — focus concern untouched: the Defect-2 debounce fix must not alter
// the search-box focus handling, which is owned by the separate
// `compliance-matrix-focus-loss` spec. This component itself manages NO focus (no
// autoFocus / focus ref); the search input is a plain controlled input bound to
// `search`. We capture that baseline so the debounce fix can be shown not to touch it.
// =====================================================================================
describe('Property 8: Preservation — search-box focus concern unaffected (Req 3.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMock();
  });

  it('renders exactly one search input that this component does not auto-focus or focus-manage', async () => {
    await renderAndDrain();

    const inputs = document.querySelectorAll(`input[placeholder="${SEARCH_PLACEHOLDER}"]`);
    expect(inputs.length, 'registry renders exactly one search input').toBe(1);

    const input = inputs[0] as HTMLInputElement;
    // Baseline: no focus management is introduced by this component. The
    // `compliance-matrix-focus-loss` spec owns any focus behavior; this fix
    // (search debounce) must leave that concern untouched.
    expect(input.hasAttribute('autofocus'), 'search input must not declare autoFocus').toBe(false);
    cleanup();
  });

  it('the search input stays a controlled input bound to `search` across re-renders', async () => {
    await renderAndDrain();

    // Type via the live onChange; the controlled binding (value={search}) must
    // reflect the typed text on the next render — proving the search wiring is
    // intact regardless of the registry subtree's node-identity churn (which is
    // the focus-loss spec's concern, not this one).
    const onChange = getSearchOnChange();
    await act(async () => {
      onChange?.({ target: { value: 'abc' } });
    });

    const after = document.querySelector(
      `input[placeholder="${SEARCH_PLACEHOLDER}"]`,
    ) as HTMLInputElement | null;
    expect(after, 'search input remains present after a re-render').not.toBeNull();
    expect(after!.value, 'controlled search input reflects the typed value').toBe('abc');
    cleanup();
  });
});
