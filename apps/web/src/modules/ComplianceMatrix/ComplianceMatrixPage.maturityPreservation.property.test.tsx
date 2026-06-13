// @vitest-environment jsdom
/**
 * Phase 2 — Preservation Test for Property 9.
 *
 * Property 9: Preservation — Valid maturity and all other form fields unchanged
 *
 * For any save with a valid numeric maturity score (including `0`) or an edit of
 * a record that already has a `maturity_score`, the code SHALL store and
 * serialize/display that value as before; for any other form field, the code
 * SHALL serialize and submit it unchanged.
 *
 * **Validates: Requirements 3.8, 3.9, 3.10**
 *
 * --------------------------------------------------------------------------
 * OBSERVATION-FIRST METHODOLOGY
 * --------------------------------------------------------------------------
 * These assertions capture the BASELINE behavior of the UNFIXED code that must
 * NOT change when Defect 3 (maturity NaN) is fixed. They are EXPECTED TO PASS on
 * the unfixed code. Defect 3's fix only sanitizes the *cleared/invalid* input
 * path (rawValue === '' → null); valid numeric values — including the boundary
 * value `0` — must continue to flow through and serialize exactly as they do
 * today. Likewise every non-maturity field must serialize byte-identically.
 *
 * NOTE ON THE `0` CASE (observed, not assumed):
 * The maturity controlled input uses `value={formData.maturity_score || ''}`, so
 * a stored `0` is *rendered* as an empty string (0 is falsy). However the
 * `onChange` stores the parsed number (`parseInt('0') === 0`) in `formData`, and
 * `handleSave` appends any value that is `!== undefined && !== null`, so a stored
 * `0` is *serialized* as the literal string `"0"`. This test documents and pins
 * BOTH facets of the current `0` behavior:
 *   - serialization:  maturity_score === "0"  (present in the payload)
 *   - edit display:   the number input shows ""  (the `|| ''` falsy quirk)
 *
 * DO NOT modify production code to make these pass — they must already pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// --- Test harness mocks (mirror ComplianceMatrixPage.maturityClear.property.test.tsx) ---
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

function installDefaultApiMocks() {
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
  mockApiPost.mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } });
  mockApiPut.mockResolvedValue({ data: { success: true, data: { id: 'edit-1' } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  installDefaultApiMocks();
});

// --- The set of fields we fill and the values used to fill them. ---
interface FormValues {
  ref: string;
  title: string;
  authority: string;
  source: string;
  status: string;
  maturity: number;
  notes: string;
  effective: string;
  review: string;
}

/**
 * Open the Add Record modal, fill every form field with the given values
 * (including a valid maturity score, which MAY be 0), submit, and return the
 * captured multipart FormData passed to `api.post('/compliance', ...)`.
 */
async function fillAndSubmit(vals: FormValues): Promise<FormData> {
  cleanup();
  mockApiPost.mockClear();

  render(<ComplianceMatrix />);
  await waitFor(() => expect(screen.getByText('complianceMatrix.addRecord')).toBeInTheDocument());

  fireEvent.click(screen.getByText('complianceMatrix.addRecord'));
  await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

  const modal = screen.getByTestId('modal');

  const textInputs = modal.querySelectorAll('input[type="text"]'); // [ref, title, authority]
  fireEvent.change(textInputs[0]!, { target: { value: vals.ref } });
  fireEvent.change(textInputs[1]!, { target: { value: vals.title } });
  fireEvent.change(textInputs[2]!, { target: { value: vals.authority } });

  const selects = modal.querySelectorAll('select'); // [source, responsible, dept, status]
  fireEvent.change(selects[0]!, { target: { value: vals.source } });
  fireEvent.change(selects[1]!, { target: { value: '1' } });
  fireEvent.change(selects[2]!, { target: { value: '1' } });
  fireEvent.change(selects[3]!, { target: { value: vals.status } });

  const numberInput = modal.querySelector('input[type="number"]')!; // maturity
  fireEvent.change(numberInput, { target: { value: String(vals.maturity) } });

  const textarea = modal.querySelector('textarea')!; // gap_notes
  fireEvent.change(textarea, { target: { value: vals.notes } });

  const dateInputs = modal.querySelectorAll('input[type="date"]'); // [effective, review]
  fireEvent.change(dateInputs[0]!, { target: { value: vals.effective } });
  fireEvent.change(dateInputs[1]!, { target: { value: vals.review } });

  fireEvent.submit(modal.querySelector('form')!);
  await waitFor(() => expect(mockApiPost).toHaveBeenCalled());

  return mockApiPost.mock.calls[0]![1] as FormData;
}

/** Render the registry with a single existing item, open its Edit modal. */
async function openEditModalForItem(maturityScore: number | null): Promise<HTMLElement> {
  cleanup();
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: 1 } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({
        data: {
          success: true,
          data: [
            {
              id: 'item-1',
              ref_number: 'REF-EDIT',
              title: 'Existing Record',
              source_type: 'law',
              compliance_status: 'compliant',
              maturity_score: maturityScore,
            },
          ],
        },
      });
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: [{ id: '1', name: 'User 1' }] } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });

  const { container } = render(<ComplianceMatrix />);
  await waitFor(() => expect(screen.getByText('Existing Record')).toBeInTheDocument());

  const editButton = container.querySelector('button[title="common.edit"]') as HTMLButtonElement | null;
  if (!editButton) throw new Error('edit button not found for existing item row');
  fireEvent.click(editButton);
  await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

  return screen.getByTestId('modal');
}

describe('Property 9: Preservation — valid maturity (incl. 0) serialization baseline (Req 3.8)', () => {
  it('OBSERVE: documents how a valid maturity score of 0 is serialized on the unfixed code', async () => {
    const data = await fillAndSubmit({
      ref: 'REF-0',
      title: 'Zero Maturity',
      authority: 'Authority',
      source: 'law',
      status: 'compliant',
      maturity: 0,
      notes: 'notes',
      effective: '2025-02-01',
      review: '2025-12-31',
    });
    const serialized = data.get('maturity_score');
    // eslint-disable-next-line no-console
    console.log('[Property 9 observe] maturity=0 -> payload maturity_score =', JSON.stringify(serialized), 'present =', data.has('maturity_score'));
    // Baseline (observed): a stored 0 is serialized as the literal string "0".
    expect(data.has('maturity_score')).toBe(true);
    expect(serialized).toBe('0');
  });

  it('preserves valid maturity values (including 0) in the serialized payload', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 100 }), async (maturity) => {
        const data = await fillAndSubmit({
          ref: 'REF-1',
          title: 'Title',
          authority: 'Authority',
          source: 'law',
          status: 'compliant',
          maturity,
          notes: 'notes',
          effective: '2025-02-01',
          review: '2025-12-31',
        });

        // A valid maturity number must always be present and serialized as its
        // decimal string — including the boundary value 0.
        expect(
          data.has('maturity_score'),
          `valid maturity ${maturity} must be present in the multipart payload`,
        ).toBe(true);
        expect(
          data.get('maturity_score'),
          `valid maturity ${maturity} must serialize as its decimal string`,
        ).toBe(String(maturity));
      }),
      { numRuns: 12 },
    );
  });
});

describe('Property 9: Preservation — all other form fields serialize unchanged (Req 3.10)', () => {
  it('serializes every non-maturity field byte-identically to its input value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          ref: fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0),
          title: fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
          authority: fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
          source: fc.constantFrom('cbi_instruction', 'law', 'internal_policy', 'admin_decision'),
          status: fc.constantFrom('compliant', 'partial', 'non_compliant', 'under_review'),
          maturity: fc.integer({ min: 0, max: 100 }),
          notes: fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
        }),
        async (vals) => {
          const data = await fillAndSubmit({
            ref: vals.ref,
            title: vals.title,
            authority: vals.authority,
            source: vals.source,
            status: vals.status,
            maturity: vals.maturity,
            notes: vals.notes,
            effective: '2025-02-01',
            review: '2025-12-31',
          });

          // Endpoint unchanged.
          expect(mockApiPost.mock.calls[0]![0]).toBe('/compliance');

          // Every non-maturity field round-trips unchanged.
          expect(data.get('ref_number')).toBe(vals.ref);
          expect(data.get('title')).toBe(vals.title);
          expect(data.get('issuing_authority')).toBe(vals.authority);
          expect(data.get('source_type')).toBe(vals.source);
          expect(data.get('compliance_status')).toBe(vals.status);
          expect(data.get('responsible_person_id')).toBe('1');
          expect(data.get('department_id')).toBe('1');
          expect(data.get('gap_notes')).toBe(vals.notes);
          expect(data.get('effective_date')).toBe('2025-02-01');
          expect(data.get('review_date')).toBe('2025-12-31');

          // The exact submitted key-set is the stable baseline contract
          // (no attachment chosen, so 'attachment' is absent).
          const keys = Array.from(data.keys()).sort();
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
      { numRuns: 10 },
    );
  });
});

describe('Property 9: Preservation — editing a record shows its stored maturity (Req 3.9)', () => {
  it('shows a non-zero stored maturity score in the edit modal input', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (score) => {
        const modal = await openEditModalForItem(score);
        const numberInput = modal.querySelector('input[type="number"]') as HTMLInputElement | null;
        if (!numberInput) throw new Error('maturity number input not found in edit modal');
        // A non-zero stored value is displayed as its decimal string.
        expect(numberInput.value).toBe(String(score));
      }),
      { numRuns: 8 },
    );
  });

  it('OBSERVE: a stored maturity of 0 renders as an empty input (the `|| ""` falsy quirk)', async () => {
    const modal = await openEditModalForItem(0);
    const numberInput = modal.querySelector('input[type="number"]') as HTMLInputElement | null;
    if (!numberInput) throw new Error('maturity number input not found in edit modal');
    // eslint-disable-next-line no-console
    console.log('[Property 9 observe] edit display for stored maturity=0 -> input.value =', JSON.stringify(numberInput.value));
    // Baseline (observed): 0 is falsy, so `value={formData.maturity_score || ''}`
    // renders an empty string. This is the current behavior to preserve.
    expect(numberInput.value).toBe('');
  });
});
