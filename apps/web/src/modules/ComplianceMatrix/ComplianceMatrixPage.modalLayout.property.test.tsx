// @vitest-environment jsdom
/**
 * Phase 1 — Exploratory Bug Condition / Baseline Test for Defect 6.
 *
 * Property 6: Bug Condition — Modal layout is balanced without changing data
 *
 * For any render of the Add/Edit modal, the FIXED code SHALL present its
 * sections in a logical, balanced order/grouping that reads correctly in the RTL
 * layout, WITHOUT changing which fields exist, their validation, or the data
 * submitted on save.
 *
 * **Validates: Requirements 1.12**
 *
 * --------------------------------------------------------------------------
 * WHY THIS TEST CAPTURES THE UNBALANCED BASELINE (and FAILS on unfixed code)
 * --------------------------------------------------------------------------
 * The Add/Edit modal body is a two-column grid (`grid-cols-1 md:grid-cols-2`).
 * On the UNFIXED code the five section cards are distributed:
 *
 *   Column 1 (2 cards):  البيانات الأساسية (basicData) + المسؤولية (responsibilities)
 *   Column 2 (3 cards):  التقييم (evalMatch) + تواريخ هامة (importantDates) + الوثائق (docsAttachments)
 *
 * This is the `isBugCondition` shape from the design:
 *   input.kind == 'modalLayout'
 *     AND grid == 'grid-cols-1 md:grid-cols-2'
 *     AND column1.cardCount == 2 AND column2.cardCount == 3
 *
 * The result is an unbalanced, illogical RTL reading order — the document-upload
 * card sits isolated at the bottom of column 2 and the responsibilities block
 * ends up adjacent to unrelated date/document sections.
 *
 * This file does two things:
 *   1. DOCUMENTS the current unbalanced 2-vs-3 distribution and the current set
 *      of submitted fields (these assertions PASS — they pin the baseline so the
 *      later presentational fix can prove layout rebalancing + payload parity).
 *   2. Encodes the desired FIXED expectation (the unbalanced 2-vs-3 shape must no
 *      longer be present). This assertion FAILS on the unfixed code — which is the
 *      success condition for this exploratory task (it proves the defect exists).
 *
 * DO NOT "fix" this test or the production code here — capturing the failing
 * baseline is the goal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// --- Test harness mocks (mirror ComplianceMatrixPage.colorClass.property.test.tsx) ---
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

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: 0 } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: [{ id: '1', name: 'User 1' }] } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
  mockApiPost.mockResolvedValue({ data: { success: true, data: {} } });
});

// --- The unbalanced baseline distribution we expect to observe on unfixed code ---
const CARD_CLASS_MARKER = 'rounded-3xl';

// After Defect 6 fix: the grid is rebalanced to a logical, balanced 3-vs-2
// grouping. Column 1 holds basicData + responsibilities + evalMatch; column 2
// holds importantDates + docsAttachments (the document-upload card is no longer
// isolated). The overall DOM/reading order of the sections is unchanged.
const EXPECTED_BASELINE_DISTRIBUTION = [
  { column: 1, header: 'complianceMatrix.basicData' },
  { column: 1, header: 'complianceMatrix.responsibilities' },
  { column: 1, header: 'complianceMatrix.evalMatch' },
  { column: 2, header: 'complianceMatrix.importantDates' },
  { column: 2, header: 'complianceMatrix.docsAttachments' },
];

/** Open the Add Record modal and return the two-column grid + its columns. */
async function openModalAndGetGrid() {
  const view = render(<ComplianceMatrix />);
  await waitFor(() => expect(screen.getByText('complianceMatrix.generalRegistry')).toBeInTheDocument());

  fireEvent.click(screen.getByText('complianceMatrix.addRecord'));
  await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

  const modal = screen.getByTestId('modal');

  // The modal body is the only `grid-cols-1 md:grid-cols-2 gap-8` grid in the DOM
  // (the matrix-tab grid uses gap-6 + xl:grid-cols-4 and is not rendered here).
  const grid = Array.from(modal.querySelectorAll('div')).find((d) => {
    const c = d.getAttribute('class') || '';
    return c.includes('grid-cols-1') && c.includes('md:grid-cols-2') && c.includes('gap-8');
  });
  expect(grid, 'modal two-column grid (grid-cols-1 md:grid-cols-2) must exist').toBeTruthy();

  const columns = Array.from(grid!.children) as HTMLElement[];
  const cardsIn = (col: HTMLElement) =>
    Array.from(col.children).filter((c) => (c.getAttribute('class') || '').includes(CARD_CLASS_MARKER));
  const headersIn = (col: HTMLElement) =>
    Array.from(col.querySelectorAll('h4')).map((h) => (h.textContent || '').trim());

  return { view, modal, columns, cardsIn, headersIn };
}

describe('Property 6: Bug Condition — Modal layout balance (Requirement 1.12)', () => {
  it('BASELINE: the modal renders a two-column grid with exactly two columns', async () => {
    const { columns } = await openModalAndGetGrid();
    expect(columns.length).toBe(2);
  });

  it('documents the balanced 3-vs-2 card distribution and per-column grouping after the fix', async () => {
    const { columns, cardsIn, headersIn } = await openModalAndGetGrid();

    const col1Count = cardsIn(columns[0]!).length;
    const col2Count = cardsIn(columns[1]!).length;
    const col1Headers = headersIn(columns[0]!);
    const col2Headers = headersIn(columns[1]!);

    // eslint-disable-next-line no-console
    console.log('[Defect 6 fixed] column distribution:', {
      column1: { cardCount: col1Count, headers: col1Headers },
      column2: { cardCount: col2Count, headers: col2Headers },
    });

    // The rebalanced layout: 3 cards in column 1, 2 in column 2.
    expect(col1Count).toBe(3);
    expect(col2Count).toBe(2);

    // Per-column grouping (the illogical RTL reading order being captured).
    fc.assert(
      fc.property(fc.constantFrom(...EXPECTED_BASELINE_DISTRIBUTION), (entry) => {
        const headers = entry.column === 1 ? col1Headers : col2Headers;
        expect(
          headers,
          `[Req 1.12] expected baseline card "${entry.header}" to live in column ${entry.column}`,
        ).toContain(entry.header);
      }),
      { numRuns: EXPECTED_BASELINE_DISTRIBUTION.length },
    );
  });

  it('FIXED EXPECTATION: modal columns are rebalanced — NOT the unbalanced 2-vs-3 shape (FAILS on unfixed code)', async () => {
    const { columns, cardsIn } = await openModalAndGetGrid();

    const col1Count = cardsIn(columns[0]!).length;
    const col2Count = cardsIn(columns[1]!).length;

    // isBugCondition: column1.cardCount == 2 AND column2.cardCount == 3.
    // The FIXED code must rebalance the grid so this unbalanced shape is gone.
    const isUnbalanced2v3 = col1Count === 2 && col2Count === 3;
    expect(
      isUnbalanced2v3,
      `[Req 1.12] modal grid is unbalanced (column1=${col1Count} cards, column2=${col2Count} cards). ` +
        `The fixed code must present a balanced/logical RTL grouping. This assertion FAILS on the ` +
        `unfixed code, confirming Defect 6.`,
    ).toBe(false);
  });
});

describe('Property 6: Submitted-field baseline (payload parity reference for the fix)', () => {
  it('BASELINE: documents the set of fields submitted on save (so the presentational fix can prove parity)', async () => {
    const { modal } = await openModalAndGetGrid();

    // Fill every form field via its inputs (handleSave serializes formData state).
    const textInputs = modal.querySelectorAll('input[type="text"]'); // [ref_number, title, issuing_authority]
    fireEvent.change(textInputs[0]!, { target: { value: 'REF-001' } }); // ref_number
    fireEvent.change(textInputs[1]!, { target: { value: 'Sample Title' } }); // title
    fireEvent.change(textInputs[2]!, { target: { value: 'Central Bank' } }); // issuing_authority

    const selects = modal.querySelectorAll('select'); // [source_type, responsible_person_id, department_id, compliance_status]
    fireEvent.change(selects[0]!, { target: { value: 'law' } }); // source_type
    fireEvent.change(selects[1]!, { target: { value: '1' } }); // responsible_person_id
    fireEvent.change(selects[2]!, { target: { value: '1' } }); // department_id
    fireEvent.change(selects[3]!, { target: { value: 'compliant' } }); // compliance_status

    const numberInput = modal.querySelector('input[type="number"]'); // maturity_score
    fireEvent.change(numberInput!, { target: { value: '80' } });

    const textarea = modal.querySelector('textarea'); // gap_notes
    fireEvent.change(textarea!, { target: { value: 'Some gap notes' } });

    const dateInputs = modal.querySelectorAll('input[type="date"]'); // [effective_date, review_date]
    fireEvent.change(dateInputs[0]!, { target: { value: '2025-02-01' } }); // effective_date
    fireEvent.change(dateInputs[1]!, { target: { value: '2025-12-31' } }); // review_date

    const form = modal.querySelector('form');
    fireEvent.submit(form!);

    await waitFor(() => expect(mockApiPost).toHaveBeenCalled());

    const submittedData = mockApiPost.mock.calls[0]![1] as FormData;
    const submittedKeys = Array.from(submittedData.keys()).sort();

    // eslint-disable-next-line no-console
    console.log('[Defect 6 baseline] submitted field keys:', submittedKeys);

    const EXPECTED_SUBMITTED_FIELDS = [
      'compliance_status',
      'department_id',
      'effective_date',
      'gap_notes',
      'issuing_authority',
      'maturity_score',
      'ref_number',
      'responsible_person_id',
      'review_date',
      'source_type',
      'title',
    ].sort();

    // Baseline payload contract: these exact fields are submitted (no attachment
    // file was chosen, so 'attachment' is intentionally excluded here).
    expect(submittedKeys).toEqual(EXPECTED_SUBMITTED_FIELDS);

    // Endpoint and values recorded for parity verification after the fix.
    expect(mockApiPost.mock.calls[0]![0]).toBe('/compliance');
    expect(submittedData.get('ref_number')).toBe('REF-001');
    expect(submittedData.get('source_type')).toBe('law');
    expect(submittedData.get('maturity_score')).toBe('80');
  });

  // Property: for ANY combination of valid field values, the submitted key set is
  // exactly the baseline contract above (documents payload parity robustly).
  it('BASELINE (property): submitted field key-set is stable across arbitrary valid values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          ref: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
          title: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          authority: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          source: fc.constantFrom('cbi_instruction', 'law', 'internal_policy', 'admin_decision'),
          status: fc.constantFrom('compliant', 'partial', 'non_compliant', 'under_review'),
          maturity: fc.integer({ min: 0, max: 100 }),
          notes: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        }),
        async (vals) => {
          mockApiPost.mockClear();
          const { modal } = await openModalAndGetGrid();

          const textInputs = modal.querySelectorAll('input[type="text"]');
          fireEvent.change(textInputs[0]!, { target: { value: vals.ref } });
          fireEvent.change(textInputs[1]!, { target: { value: vals.title } });
          fireEvent.change(textInputs[2]!, { target: { value: vals.authority } });

          const selects = modal.querySelectorAll('select');
          fireEvent.change(selects[0]!, { target: { value: vals.source } });
          fireEvent.change(selects[1]!, { target: { value: '1' } });
          fireEvent.change(selects[2]!, { target: { value: '1' } });
          fireEvent.change(selects[3]!, { target: { value: vals.status } });

          fireEvent.change(modal.querySelector('input[type="number"]')!, { target: { value: String(vals.maturity) } });
          fireEvent.change(modal.querySelector('textarea')!, { target: { value: vals.notes } });

          const dateInputs = modal.querySelectorAll('input[type="date"]');
          fireEvent.change(dateInputs[0]!, { target: { value: '2025-02-01' } });
          fireEvent.change(dateInputs[1]!, { target: { value: '2025-12-31' } });

          fireEvent.submit(modal.querySelector('form')!);
          await waitFor(() => expect(mockApiPost).toHaveBeenCalled());

          const data = mockApiPost.mock.calls[0]![1] as FormData;
          const keys = Array.from(data.keys()).sort();
          cleanup();

          expect(keys).toEqual(
            [
              'compliance_status',
              'department_id',
              'effective_date',
              'gap_notes',
              'issuing_authority',
              'maturity_score',
              'ref_number',
              'responsible_person_id',
              'review_date',
              'source_type',
              'title',
            ].sort(),
          );
        },
      ),
      { numRuns: 8 },
    );
  });
});
