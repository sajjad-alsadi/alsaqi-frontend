// @vitest-environment jsdom
/**
 * Phase 1 — Exploratory Bug Condition Test for Defect 2.
 *
 * Property 2: Bug Condition — Search refetch is debounced
 *
 * For any sequence of rapid consecutive keystrokes in the registry search box,
 * the FIXED code SHALL issue a single `/compliance` + `/compliance/summary`
 * request pair after the user pauses, rather than one pair per character, while
 * still sending the same `search` query parameter.
 *
 * **Validates: Requirements 1.7**
 *
 * --------------------------------------------------------------------------
 * WHY THIS TEST IS EXPECTED TO FAIL ON THE UNFIXED CODE
 * --------------------------------------------------------------------------
 * The data-loading effect depends directly on `search`:
 *
 *     useEffect(() => { fetchItems(); fetchSummary(); },
 *              [filterSource, filterStatus, search]);
 *
 * Every keystroke mutates `search`, so the effect re-runs synchronously and
 * fires BOTH `/compliance` and `/compliance/summary` (and toggles `loading`) on
 * each character — there is no debounce. Typing an N-character term therefore
 * produces N `/compliance` + N `/compliance/summary` request pairs.
 *
 * This test encodes the EXPECTED (fixed) behavior: a burst of N keystrokes must
 * collapse into exactly ONE debounced refetch pair after the user pauses. On the
 * UNFIXED code the burst fires N pairs, so the `toBe(1)` assertions FAIL — which
 * CONFIRMS the bug. After Defect 2 is fixed (debounce the search input only,
 * effect depends on `debouncedSearch`), the same assertions PASS.
 *
 * DO NOT "fix" this test or the production code here — failure is the success
 * condition for this exploratory task.
 *
 * The test advances fake timers by a large amount after the burst so it is
 * agnostic to the eventual debounce duration the fix chooses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// --- Test harness mocks (mirror src/modules/__tests__/ComplianceMatrix.test.tsx) ---
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

function createMockItems(count = 4) {
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
    open_findings_count: 0,
  }));
}

function setupApiMock() {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: 4 } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: { success: true, data: createMockItems() } });
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: [{ id: '1', name: 'User 1' }] } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

// `/compliance?...` items request (excludes the `/compliance/summary` stats call).
const isItemsCall = (url: string) => url.includes('/compliance') && !url.includes('/compliance/summary');
const isSummaryCall = (url: string) => url.includes('/compliance/summary');
const countCalls = (predicate: (url: string) => boolean) =>
  mockApiGet.mock.calls.filter(([url]: any[]) => typeof url === 'string' && predicate(url)).length;

const SEARCH_PLACEHOLDER = 'complianceMatrix.searchPlaceholder';

/**
 * Resolve the React `onChange` prop attached to the live search input.
 *
 * In React 19 the internal `__reactProps$*` key is NON-enumerable (so `Object.keys`
 * misses it) and, in this jsdom setup, DOM-level `fireEvent`/dispatched events do
 * not reach React's controlled-text-input handler (verified: `fireEvent.change` on
 * the `<select>` filters works, but not on the text `<input>`). Invoking the rendered
 * `onChange` prop directly is the faithful equivalent of a browser keystroke: the
 * browser sets the new value and calls the element's onChange with it. We re-resolve
 * before every keystroke because each render produces a fresh handler closure.
 */
function getSearchOnChange(): ((e: { target: { value: string } }) => void) | null {
  const el = document.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`);
  if (!el) return null;
  const key = Object.getOwnPropertyNames(el).find((k) => k.startsWith('__reactProps$'));
  return key ? ((el as any)[key].onChange ?? null) : null;
}

/**
 * Render, drain the initial mount fetch, then "type" `term` one keystroke at a time
 * by invoking the input's onChange with each successive prefix (each committed +
 * effect-flushed in its own act), then wait past any debounce window. Returns how
 * many refetch pairs the burst produced.
 *
 * On unfixed code the data-loading effect depends directly on `search`, so each
 * keystroke fires its own `/compliance` + `/compliance/summary` pair. On fixed
 * (debounced) code the burst coalesces into a single pair after the pause.
 */
async function typeBurstAndCount(term: string) {
  render(<ComplianceMatrix />);

  // Wait for the registry tree to settle and the initial fetch to register.
  await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
  await waitFor(() => expect(countCalls(isItemsCall)).toBeGreaterThanOrEqual(1));

  const baseItems = countCalls(isItemsCall);
  const baseSummary = countCalls(isSummaryCall);

  // Rapid keystroke burst: 'p', 'po', 'pol', ... — each onChange call is a distinct
  // keystroke, committed + effect-flushed in its own act (mirrors real typing).
  for (let i = 1; i <= term.length; i++) {
    const onChange = getSearchOnChange();
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      onChange?.({ target: { value: term.slice(0, i) } });
    });
  }

  // Let any debounce window elapse. On unfixed code the refetches already fired
  // per keystroke above; on fixed code the single debounced pair fires here.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });

  return {
    itemsRefetches: countCalls(isItemsCall) - baseItems,
    summaryRefetches: countCalls(isSummaryCall) - baseSummary,
  };
}

describe('Property 2: Bug Condition — Search refetch is debounced (Requirement 1.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMock();
  });

  it('collapses a 6-keystroke burst ("policy") into ONE /compliance + /compliance/summary pair (FAILS on unfixed code)', async () => {
    const { itemsRefetches, summaryRefetches } = await typeBurstAndCount('policy');

    expect(
      itemsRefetches,
      `typing "policy" (6 chars) should debounce to ONE /compliance refetch, but fired ${itemsRefetches} ` +
        `(unfixed code fires one per keystroke — no debounce)`,
    ).toBe(1);
    expect(
      summaryRefetches,
      `typing "policy" (6 chars) should debounce to ONE /compliance/summary refetch, but fired ${summaryRefetches}`,
    ).toBe(1);
    cleanup();
  }, 30_000);

  it('property: any burst of N rapid keystrokes debounces to exactly one refetch pair (FAILS on unfixed code)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 8 }).map((n) => 'abcdefgh'.slice(0, n)),
        async (term) => {
          vi.clearAllMocks();
          setupApiMock();
          try {
            const { itemsRefetches, summaryRefetches } = await typeBurstAndCount(term);

            // Expected (fixed) behavior: one debounced pair regardless of burst length.
            expect(
              itemsRefetches,
              `typing a ${term.length}-char burst should debounce to ONE /compliance refetch, got ${itemsRefetches}`,
            ).toBe(1);
            expect(
              summaryRefetches,
              `typing a ${term.length}-char burst should debounce to ONE /compliance/summary refetch, got ${summaryRefetches}`,
            ).toBe(1);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60_000);
});
