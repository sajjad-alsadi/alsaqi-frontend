// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Phase 2 — Preservation Test for Property 10.
 *
 * Property 10: Preservation — Successful user load and modal flows unchanged
 *
 * This test pins the BASELINE behavior that the six fixes must NOT change:
 *
 *   1. Display-name resolution in the responsible-person ("الشخص المسؤول")
 *      select renders each user as `name || full_name || username`.
 *   2. The selected `responsible_person_id` is submitted unchanged in the
 *      multipart payload.
 *   3. The create (POST /compliance) flow serializes all twelve modal fields
 *      (ref number, title, source, issuing authority, responsible person,
 *      department, status, maturity score, gap notes, effective date, review
 *      date, PDF attachment) into the saved payload.
 *   4. The update (PUT /compliance/:id), delete (DELETE /compliance/:id), and
 *      status-update (PATCH /compliance/:id/status) flows hit the same
 *      endpoints with the same payloads as before.
 *   5. Opening, editing, and cancelling the modal performs no create/update —
 *      any optional Cancel/`file`-reset cleanup must not alter submitted data.
 *
 * **Validates: Requirements 3.11, 3.12, 3.13, 3.14, 3.15**
 *
 * --------------------------------------------------------------------------
 * OBSERVATION-FIRST METHODOLOGY
 * --------------------------------------------------------------------------
 * These assertions describe behavior the UNFIXED code already exhibits, so the
 * whole suite is EXPECTED TO PASS on the current (unfixed) code — it captures
 * the baseline to preserve. (`NOT isBugCondition`: successful user load and
 * modal flows.)
 *
 * Parity reference for the successful user-load path: on the unfixed code
 * `fetchUsers` requests `/users/summary` FIRST and, when that resolves with a
 * user-list array, `toList(...)` yields the users and the dropdown populates.
 * (The Defect-5 fix swaps the endpoint to the canonical `/users` list but keeps
 * this exact success behavior — display-name resolution and id submission — so
 * we observe it here via the `/users/summary`-returns-a-list success path, which
 * the fix preserves.)
 *
 * DO NOT modify production code for this task. If an assertion does not hold on
 * the unfixed code, the test must be adjusted to faithfully capture the actual
 * current behavior — never the production code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// --- Test harness mocks (mirror the sibling *.property.test.tsx files) ---
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

// Resolve validation to the supplied files so a chosen attachment reaches `setFile`.
vi.mock('../../hooks/useFileUploadValidation', () => ({
  useFileUploadValidation: () => ({
    validateAndFilter: (files: File[]) => Promise.resolve(files),
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

// --- Shared types & helpers ---------------------------------------------------

type UserRec = { id: string; name?: string; full_name?: string; username?: string };

/** Pure reference for the display-name resolution the production select uses. */
function expectedDisplayName(u: UserRec): string {
  return (u.name || u.full_name || u.username) as string;
}

/**
 * Build a mockApiGet where the SUCCESSFUL user-load path is exercised:
 * `/users/summary` resolves with a user-list array (so `toList` yields users),
 * matching the success behavior the Defect-5 fix preserves.
 */
function makeApi(opts: { users?: UserRec[]; items?: any[]; total?: number }) {
  const users = opts.users ?? [];
  const items = opts.items ?? [];
  const total = opts.total ?? items.length;
  return (url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: { success: true, data: items } });
    }
    // Successful user load: summary endpoint returns a real user-list array.
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: users } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  };
}

async function openAddRecordModal() {
  await waitFor(() => expect(screen.getByText('complianceMatrix.addRecord')).toBeInTheDocument());
  fireEvent.click(screen.getByText('complianceMatrix.addRecord'));
  await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());
}

/**
 * Within the open modal the inputs render in a stable DOM order. These helpers
 * resolve each control by type+index so we can drive all twelve fields.
 */
function modalControls(container: HTMLElement) {
  const form = container.querySelector('form') as HTMLFormElement;
  const texts = Array.from(form.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
  const selects = Array.from(form.querySelectorAll('select')) as HTMLSelectElement[];
  const dates = Array.from(form.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
  return {
    form,
    refNumber: texts[0]!,
    title: texts[1]!,
    issuingAuthority: texts[2]!,
    sourceType: selects[0]!,
    responsiblePerson: selects[1]!,
    department: selects[2]!,
    complianceStatus: selects[3]!,
    maturity: form.querySelector('input[type="number"]') as HTMLInputElement,
    gapNotes: form.querySelector('textarea') as HTMLTextAreaElement,
    effectiveDate: dates[0]!,
    reviewDate: dates[1]!,
    fileInput: form.querySelector('input[type="file"]') as HTMLInputElement,
  };
}

const ISO = (d: Date) => d.toISOString().slice(0, 10);

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockImplementation(makeApi({ users: [], items: [] }));
  mockApiPost.mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } });
  mockApiPut.mockResolvedValue({ data: { success: true, data: { id: 'edit-1' } } });
  mockApiDelete.mockResolvedValue({ data: { success: true, data: {} } });
  mockApiPatch.mockResolvedValue({ data: { success: true, data: {} } });
});

// =============================================================================
// 10.1 Display-name resolution (name || full_name || username) is preserved.
// =============================================================================
describe('Property 10: Preservation — responsible-person display-name resolution (Requirement 3.13)', () => {
  it('renders each user as `name || full_name || username` for any user list', async () => {
    // Each user sets exactly one of the three name fields (embedding its unique
    // id) so the resolved display name is deterministic and unique per user and
    // each branch of the `||` chain is exercised.
    const userListArb = fc
      .uniqueArray(fc.integer({ min: 1, max: 9999 }), { minLength: 1, maxLength: 4 })
      .chain((ids) =>
        fc.tuple(
          ...ids.map((id) =>
            fc.constantFrom<'name' | 'full_name' | 'username'>('name', 'full_name', 'username').map(
              (kind) => {
                const u: UserRec = { id: `user-${id}` };
                if (kind === 'name') u.name = `Name-${id}`;
                else if (kind === 'full_name') u.full_name = `Full-${id}`;
                else u.username = `Uname-${id}`;
                return u;
              },
            ),
          ),
        ),
      );

    await fc.assert(
      fc.asyncProperty(userListArb, async (users) => {
        cleanup();
        vi.clearAllMocks();
        mockApiGet.mockImplementation(makeApi({ users }));

        render(<ComplianceMatrix />);
        await openAddRecordModal();

        await waitFor(() => {
          for (const u of users) {
            expect(screen.getByRole('option', { name: expectedDisplayName(u) })).toBeInTheDocument();
          }
        });
      }),
      { numRuns: 8 },
    );
  });
});

// =============================================================================
// 10.2 The selected responsible_person_id is submitted unchanged.
// =============================================================================
describe('Property 10: Preservation — selected responsible_person_id is submitted unchanged (Requirement 3.13)', () => {
  it('serializes the chosen responsible_person_id into the saved payload', async () => {
    const users: UserRec[] = [
      { id: 'u-1', name: 'Alice' },
      { id: 'u-2', full_name: 'Bob B' },
      { id: 'u-3', username: 'carol' },
    ];

    await fc.assert(
      fc.asyncProperty(fc.constantFrom('u-1', 'u-2', 'u-3'), async (chosenId) => {
        cleanup();
        vi.clearAllMocks();
        mockApiGet.mockImplementation(makeApi({ users }));
        mockApiPost.mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } });

        const { container } = render(<ComplianceMatrix />);
        await openAddRecordModal();
        // Wait for the user options to be available before selecting.
        await waitFor(() => expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument());

        const c = modalControls(container);
        fireEvent.change(c.refNumber, { target: { value: 'REF-1' } });
        fireEvent.change(c.title, { target: { value: 'Title 1' } });
        fireEvent.change(c.sourceType, { target: { value: 'law' } });
        fireEvent.change(c.responsiblePerson, { target: { value: chosenId } });

        fireEvent.submit(c.form);
        await waitFor(() => expect(mockApiPost).toHaveBeenCalled());

        const payload = mockApiPost.mock.calls[0]![1] as FormData;
        expect(payload.get('responsible_person_id')).toBe(chosenId);
      }),
      { numRuns: 6 },
    );
  });
});

// =============================================================================
// 10.3 Create flow (POST /compliance) serializes all twelve modal fields.
// =============================================================================
describe('Property 10: Preservation — create flow saves all twelve modal fields (Requirements 3.10, 3.14)', () => {
  it('POSTs /compliance with every modal field present in the payload', async () => {
    const users: UserRec[] = [
      { id: 'u-1', name: 'Alice' },
      { id: 'u-2', name: 'Bob' },
    ];
    const fieldsArb = fc.record({
      ref_number: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `R${s.replace(/\s/g, '')}` ),
      title: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `T${s.replace(/\s/g, '')}`),
      issuing_authority: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `A${s.replace(/\s/g, '')}`),
      gap_notes: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `G${s.replace(/\s/g, '')}`),
      source_type: fc.constantFrom('cbi_instruction', 'law', 'internal_policy', 'admin_decision'),
      compliance_status: fc.constantFrom('compliant', 'partial', 'non_compliant', 'under_review'),
      responsible_person_id: fc.constantFrom('u-1', 'u-2'),
      department_id: fc.constantFrom('1', '2'),
      maturity_score: fc.integer({ min: 1, max: 100 }),
      effective_date: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }).map(ISO),
      review_date: fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }).map(ISO),
    });

    await fc.assert(
      fc.asyncProperty(fieldsArb, async (f) => {
        cleanup();
        vi.clearAllMocks();
        mockApiGet.mockImplementation(makeApi({ users }));
        mockApiPost.mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } });

        const { container } = render(<ComplianceMatrix />);
        await openAddRecordModal();
        await waitFor(() => expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument());

        const c = modalControls(container);
        fireEvent.change(c.refNumber, { target: { value: f.ref_number } });
        fireEvent.change(c.title, { target: { value: f.title } });
        fireEvent.change(c.issuingAuthority, { target: { value: f.issuing_authority } });
        fireEvent.change(c.sourceType, { target: { value: f.source_type } });
        fireEvent.change(c.responsiblePerson, { target: { value: f.responsible_person_id } });
        fireEvent.change(c.department, { target: { value: f.department_id } });
        fireEvent.change(c.complianceStatus, { target: { value: f.compliance_status } });
        fireEvent.change(c.maturity, { target: { value: String(f.maturity_score) } });
        fireEvent.change(c.gapNotes, { target: { value: f.gap_notes } });
        fireEvent.change(c.effectiveDate, { target: { value: f.effective_date } });
        fireEvent.change(c.reviewDate, { target: { value: f.review_date } });

        // Attachment (twelfth field): selecting a PDF reaches setFile and shows its name.
        const pdf = new File(['%PDF-1.4'], 'record.pdf', { type: 'application/pdf' });
        fireEvent.change(c.fileInput, { target: { files: [pdf] } });
        await waitFor(() => expect(screen.getByText('record.pdf')).toBeInTheDocument());

        fireEvent.submit(c.form);
        await waitFor(() => expect(mockApiPost).toHaveBeenCalled());

        const [url, payload] = mockApiPost.mock.calls[0]! as [string, FormData];
        expect(url).toBe('/compliance');
        expect(payload.get('ref_number')).toBe(f.ref_number);
        expect(payload.get('title')).toBe(f.title);
        expect(payload.get('source_type')).toBe(f.source_type);
        expect(payload.get('issuing_authority')).toBe(f.issuing_authority);
        expect(payload.get('responsible_person_id')).toBe(f.responsible_person_id);
        expect(payload.get('department_id')).toBe(f.department_id);
        expect(payload.get('compliance_status')).toBe(f.compliance_status);
        expect(payload.get('maturity_score')).toBe(String(f.maturity_score));
        expect(payload.get('gap_notes')).toBe(f.gap_notes);
        expect(payload.get('effective_date')).toBe(f.effective_date);
        expect(payload.get('review_date')).toBe(f.review_date);
        const attachment = payload.get('attachment');
        expect(attachment).toBeInstanceOf(File);
        expect((attachment as File).name).toBe('record.pdf');
      }),
      { numRuns: 6 },
    );
  });
});

// =============================================================================
// 10.4 Update flow (PUT /compliance/:id) preserves endpoint + field payload.
// =============================================================================
describe('Property 10: Preservation — update flow PUTs to /compliance/:id unchanged (Requirements 3.14, 3.15)', () => {
  it('opens the edit modal for an existing record and PUTs the same fields', async () => {
    const itemArb = fc.record({
      id: fc.integer({ min: 1, max: 9999 }).map((n) => `item-${n}`),
      ref_number: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `R${s.replace(/\s/g, '')}`),
      title: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `T${s.replace(/\s/g, '')}`),
      source_type: fc.constantFrom('cbi_instruction', 'law', 'internal_policy', 'admin_decision'),
      compliance_status: fc.constantFrom('compliant', 'partial', 'non_compliant', 'under_review'),
      maturity_score: fc.integer({ min: 1, max: 100 }),
    });

    await fc.assert(
      fc.asyncProperty(itemArb, async (item) => {
        cleanup();
        vi.clearAllMocks();
        mockApiGet.mockImplementation(makeApi({ users: [], items: [item] }));
        mockApiPut.mockResolvedValue({ data: { success: true, data: { id: item.id } } });

        const { container } = render(<ComplianceMatrix />);
        // The registry tab is default; wait for the row's edit affordance.
        await waitFor(() => expect(screen.getByTitle('common.edit')).toBeInTheDocument());
        fireEvent.click(screen.getByTitle('common.edit'));
        await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

        const form = container.querySelector('form') as HTMLFormElement;
        fireEvent.submit(form);
        await waitFor(() => expect(mockApiPut).toHaveBeenCalled());

        const [url, payload] = mockApiPut.mock.calls[0]! as [string, FormData];
        expect(url).toBe('/compliance/' + item.id);
        expect(payload.get('ref_number')).toBe(item.ref_number);
        expect(payload.get('title')).toBe(item.title);
        expect(payload.get('source_type')).toBe(item.source_type);
        expect(payload.get('compliance_status')).toBe(item.compliance_status);
        expect(payload.get('maturity_score')).toBe(String(item.maturity_score));
      }),
      { numRuns: 6 },
    );
  });
});

// =============================================================================
// 10.5 Delete flow (DELETE /compliance/:id) unchanged.
// =============================================================================
describe('Property 10: Preservation — delete flow DELETEs /compliance/:id (Requirement 3.15)', () => {
  it('confirming delete calls DELETE on the selected record id', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 9999 }), async (n) => {
        const item = { id: `item-${n}`, ref_number: 'R1', title: 'T1', source_type: 'law', compliance_status: 'compliant' };
        cleanup();
        vi.clearAllMocks();
        mockApiGet.mockImplementation(makeApi({ users: [], items: [item] }));
        mockApiDelete.mockResolvedValue({ data: { success: true, data: {} } });

        render(<ComplianceMatrix />);
        await waitFor(() => expect(screen.getByText('common.delete')).toBeInTheDocument());
        // Row dropdown delete button opens the confirmation modal.
        fireEvent.click(screen.getByText('common.delete'));
        await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

        // Confirm inside the modal.
        const modal = screen.getByTestId('modal');
        fireEvent.click(within(modal).getByText('common.delete'));
        await waitFor(() => expect(mockApiDelete).toHaveBeenCalled());

        expect(mockApiDelete.mock.calls[0]![0]).toBe('/compliance/' + item.id);
      }),
      { numRuns: 5 },
    );
  });
});

// =============================================================================
// 10.6 Status-update flow (PATCH /compliance/:id/status) unchanged.
// =============================================================================
describe('Property 10: Preservation — status-update PATCHes /compliance/:id/status (Requirement 3.15)', () => {
  const STATUS_LABELS: Record<string, string> = {
    compliant: 'complianceMatrix.compliant',
    partial: 'complianceMatrix.partial',
    non_compliant: 'complianceMatrix.nonCompliant',
    under_review: 'complianceMatrix.underReview',
  };

  it('clicking a status option PATCHes the new compliance_status for the record', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('compliant', 'partial', 'non_compliant', 'under_review'),
        async (targetStatus) => {
          const item = { id: `item-1`, ref_number: 'R1', title: 'T1', source_type: 'law', compliance_status: 'under_review' };
          cleanup();
          vi.clearAllMocks();
          mockApiGet.mockImplementation(makeApi({ users: [], items: [item] }));
          mockApiPatch.mockResolvedValue({ data: { success: true, data: {} } });

          render(<ComplianceMatrix />);
          await waitFor(() =>
            expect(screen.getByRole('button', { name: STATUS_LABELS[targetStatus] })).toBeInTheDocument(),
          );
          fireEvent.click(screen.getByRole('button', { name: STATUS_LABELS[targetStatus] }));
          await waitFor(() => expect(mockApiPatch).toHaveBeenCalled());

          const [url, body] = mockApiPatch.mock.calls[0]! as [string, any];
          expect(url).toBe('/compliance/' + item.id + '/status');
          expect(body).toEqual({ compliance_status: targetStatus });
        },
      ),
      { numRuns: 4 },
    );
  });
});

// =============================================================================
// 10.7 Cancelling the modal performs no create/update (submitted data unchanged).
// =============================================================================
describe('Property 10: Preservation — cancel does not create/update (Requirement 3.15)', () => {
  it('filling fields then cancelling submits no data and closes the modal', async () => {
    const users: UserRec[] = [{ id: 'u-1', name: 'Alice' }];
    mockApiGet.mockImplementation(makeApi({ users }));

    const { container } = render(<ComplianceMatrix />);
    await openAddRecordModal();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument());

    const c = modalControls(container);
    fireEvent.change(c.refNumber, { target: { value: 'REF-CANCEL' } });
    fireEvent.change(c.title, { target: { value: 'Should not persist' } });

    // Cancel button (not submit).
    fireEvent.click(screen.getByText('complianceMatrix.cancel'));

    await waitFor(() => expect(screen.queryByTestId('modal')).not.toBeInTheDocument());
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockApiPut).not.toHaveBeenCalled();
  });
});
