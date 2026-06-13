// @vitest-environment jsdom
/**
 * Phase 2 — Preservation Test for Defect 1 (Property 7).
 *
 * Property 7: Preservation — Static and CSS-variable colors unchanged
 *
 * For any element whose color comes from an existing STATIC ternary class string
 * (registry tab) or from a fixed value / CSS variable (`[var(--color-primary)]`,
 * the View-modal `amber-500`/`emerald-500`/`slate-500` ternary accents), the
 * FIXED code SHALL produce exactly the same class strings as the original,
 * preserving all currently-correct color rendering and the overall tab structure,
 * content, counts, labels, icons, and text.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
 *
 * --------------------------------------------------------------------------
 * OBSERVATION-FIRST METHODOLOGY
 * --------------------------------------------------------------------------
 * These render paths are `NOT isBugCondition`: their classes are ALREADY complete
 * literals (or CSS-variable references), so Tailwind's content scanner already
 * sees them and they are unaffected by the Defect 1 fix (which only converts the
 * INTERPOLATED matrix/dashboard/status-dropdown tokens into static lookups).
 *
 * This test pins the CURRENT (unfixed) behavior so the later fix can prove it did
 * not disturb these paths:
 *   1. Source-scan property — the exact static / CSS-variable literal class
 *      strings appear verbatim in the component source (mirrors Tailwind's
 *      content scanner; the colorClass exploration test uses the same technique).
 *   2. DOM-render property — the registry status badges, source badges, and
 *      review-date highlights produce exactly those literal class strings at
 *      runtime, and the View modal renders its fixed/CSS-variable accent literals.
 *   3. Structure/content — tab structure, content, counts, labels, icons, and
 *      text render unchanged across the registry, matrix, and dashboard tabs.
 *
 * EXPECTED OUTCOME: ALL assertions PASS on the UNFIXED code (this is the baseline
 * to preserve). DO NOT modify production code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// --- Read the component source so we can mirror Tailwind's content scanner ---
const __dirnameLocal = dirname(fileURLToPath(import.meta.url));
const COMPONENT_SOURCE = readFileSync(
  resolve(__dirnameLocal, './ComplianceMatrixPage.tsx'),
  'utf8',
);

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

/**
 * Hand-crafted items giving full coverage of the static color render paths:
 * - one item per compliance_status (compliant/partial/non_compliant/under_review),
 * - one item per source_type (cbi_instruction→primary, law→purple,
 *   internal_policy→emerald, admin_decision→orange),
 * - mixed review_date so we exercise the overdue (text-rose-500) and
 *   non-overdue (text-[var(--color-text-muted)]) review-date highlights.
 */
function makeBaselineItem(overrides: Partial<any>) {
  return {
    id: 'cm-x',
    ref_number: 'REF-000',
    title: 'Baseline Item',
    source_type: 'cbi_instruction',
    issuing_authority: 'Central Bank',
    category: 'Banking',
    issue_date: '2025-01-01',
    effective_date: '2025-02-01',
    review_date: null,
    compliance_status: 'under_review',
    maturity_score: 50,
    gap_notes: null,
    responsible_person_id: '1',
    responsible_person_name: 'Person X',
    department_id: '1',
    department_name: 'Finance',
    description: 'Some description',
    keywords: 'k',
    version: '1.0',
    attachment_path: null,
    open_findings_count: 0,
    ...overrides,
  };
}

const BASELINE_ITEMS = [
  makeBaselineItem({
    id: 'cm-1', ref_number: 'REF-001', title: 'Compliant Primary',
    compliance_status: 'compliant', source_type: 'cbi_instruction', review_date: '2020-01-01', // overdue
  }),
  makeBaselineItem({
    id: 'cm-2', ref_number: 'REF-002', title: 'Partial Purple',
    compliance_status: 'partial', source_type: 'law', review_date: '2999-12-31', // not overdue
  }),
  makeBaselineItem({
    id: 'cm-3', ref_number: 'REF-003', title: 'NonCompliant Emerald',
    compliance_status: 'non_compliant', source_type: 'internal_policy', review_date: '2020-06-01', // overdue
  }),
  makeBaselineItem({
    id: 'cm-4', ref_number: 'REF-004', title: 'UnderReview Orange',
    compliance_status: 'under_review', source_type: 'admin_decision', review_date: null,
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: 4 } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: { success: true, data: BASELINE_ITEMS } });
    }
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: [{ id: '1', name: 'User 1' }] } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
});

/**
 * The complete, statically-analyzable literal class strings that the EXISTING
 * code already emits and that the Defect 1 fix MUST leave byte-identical. Each is
 * a `NOT isBugCondition` path (already literal / CSS-variable, never interpolated).
 */
const STATIC_LITERAL_CLASSES: { req: string; path: string; cls: string }[] = [
  // 3.1 — registry status badge (getStatusBadge) static ternary literals
  { req: '3.1', path: 'status badge compliant', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { req: '3.1', path: 'status badge non_compliant', cls: 'bg-rose-50 text-rose-700 border-rose-100' },
  { req: '3.1', path: 'status badge partial', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  // 3.2 — registry status badge under_review default (CSS-variable literal)
  { req: '3.2', path: 'status badge under_review (css-var)', cls: 'bg-[var(--color-bg-soft)] text-[var(--color-text-main)] border-[var(--color-border-soft)]' },
  // 3.1 — registry source badge (getSourceBadge) static ternary literals
  { req: '3.1', path: 'source badge purple', cls: 'bg-purple-50 text-purple-600 border-purple-100' },
  { req: '3.1', path: 'source badge emerald', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { req: '3.1', path: 'source badge orange (default)', cls: 'bg-orange-50 text-orange-600 border-orange-100' },
  // 3.2 — registry source badge primary (CSS-variable literal)
  { req: '3.2', path: 'source badge primary (css-var)', cls: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20' },
  // 3.1 — registry review-date overdue highlight (static literals)
  { req: '3.1', path: 'review-date overdue', cls: 'text-rose-500' },
  { req: '3.1', path: 'review-date overdue label', cls: 'text-rose-400' },
];

/**
 * The View modal's fixed-value / CSS-variable accent ternary. These compound
 * fragments are unique to the View modal accent expression, so a source scan has
 * no false positives. They must remain byte-identical after the fix.
 */
const VIEW_MODAL_ACCENT_FRAGMENTS: { req: string; path: string; fragment: string }[] = [
  { req: '3.2', path: 'view modal accent warning→amber-500', fragment: "info.color === 'warning' ? 'amber-500'" },
  { req: '3.2', path: 'view modal accent emerald→emerald-500 / default→slate-500', fragment: "info.color === 'emerald' ? 'emerald-500' : 'slate-500'" },
];

describe('Property 7: Preservation — static / CSS-variable color SOURCE literals (Requirements 3.1, 3.2)', () => {
  it('keeps every static / CSS-variable color class as a complete literal in source (passes on unfixed code)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STATIC_LITERAL_CLASSES), (entry) => {
        expect(
          COMPONENT_SOURCE.includes(entry.cls),
          `[Req ${entry.req}] ${entry.path}: static/CSS-variable literal class "${entry.cls}" must remain present ` +
            `verbatim in source (it is NOT a bug condition and must be preserved unchanged).`,
        ).toBe(true);
      }),
      { numRuns: STATIC_LITERAL_CLASSES.length },
    );
  });

  it('keeps the View modal fixed/CSS-variable accent ternary byte-identical in source (passes on unfixed code)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VIEW_MODAL_ACCENT_FRAGMENTS), (entry) => {
        expect(
          COMPONENT_SOURCE.includes(entry.fragment),
          `[Req ${entry.req}] ${entry.path}: View-modal accent fragment "${entry.fragment}" must remain unchanged in source.`,
        ).toBe(true);
      }),
      { numRuns: VIEW_MODAL_ACCENT_FRAGMENTS.length },
    );
  });
});

describe('Property 7: Preservation — registry tab produces the static color literals at runtime (Requirements 3.1, 3.2)', () => {
  it('renders status badges, source badges, and overdue review-date with the exact static literal classes', async () => {
    const { container } = render(<ComplianceMatrix />);
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    const html = container.innerHTML;

    // The set of literal classes that must be PRODUCED in the rendered registry DOM.
    const PRODUCED_REGISTRY_LITERALS = [
      'bg-emerald-50 text-emerald-700 border-emerald-100', // status: compliant
      'bg-rose-50 text-rose-700 border-rose-100', // status: non_compliant
      'bg-amber-50 text-amber-700 border-amber-100', // status: partial
      'bg-[var(--color-bg-soft)] text-[var(--color-text-main)] border-[var(--color-border-soft)]', // status: under_review (css-var)
      'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20', // source: primary (css-var)
      'bg-purple-50 text-purple-600 border-purple-100', // source: purple
      'bg-emerald-50 text-emerald-600 border-emerald-100', // source: emerald
      'bg-orange-50 text-orange-600 border-orange-100', // source: orange
      'text-rose-500', // overdue review-date
      'text-rose-400', // overdue label
    ];

    fc.assert(
      fc.property(fc.constantFrom(...PRODUCED_REGISTRY_LITERALS), (cls) => {
        expect(
          html.includes(cls),
          `registry DOM must produce the static literal class "${cls}" (baseline color rendering to preserve).`,
        ).toBe(true);
      }),
      { numRuns: PRODUCED_REGISTRY_LITERALS.length },
    );
  });

  it('renders the non-overdue review-date with the muted CSS-variable color (not rose)', async () => {
    const { container } = render(<ComplianceMatrix />);
    await waitFor(() => expect(screen.getByText('REF-002')).toBeInTheDocument());

    // The future-dated item (REF-002) uses the muted CSS-variable color for its review date.
    expect(container.innerHTML).toContain('text-[var(--color-text-muted)]');
  });

  it('renders the View modal fixed/CSS-variable accent literals at runtime', async () => {
    render(<ComplianceMatrix />);
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    // Open the View modal from the first row's view action.
    const viewButtons = screen.getAllByTitle('common.view');
    fireEvent.click(viewButtons[0]!);
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

    const modalHtml = screen.getByTestId('modal').innerHTML;
    // The four info-card accents resolve to fixed-value / CSS-variable colors.
    const ACCENT_LITERALS = ['bg-[var(--color-primary)]', 'bg-amber-500', 'bg-emerald-500', 'bg-slate-500'];
    fc.assert(
      fc.property(fc.constantFrom(...ACCENT_LITERALS), (cls) => {
        expect(
          modalHtml.includes(cls),
          `View modal must produce the fixed/CSS-variable accent literal "${cls}".`,
        ).toBe(true);
      }),
      { numRuns: ACCENT_LITERALS.length },
    );
  });
});

describe('Property 7: Preservation — tab structure, content, counts, labels, icons, text (Requirement 3.3)', () => {
  it('registry tab shows the same headers, ref numbers, titles, and status/source labels', async () => {
    render(<ComplianceMatrix />);
    await waitFor(() => expect(screen.getByText('complianceMatrix.generalRegistry')).toBeInTheDocument());

    // Tab labels (structure).
    expect(screen.getByText('complianceMatrix.gapMatrixTab')).toBeInTheDocument();
    expect(screen.getByText('complianceMatrix.dashboard')).toBeInTheDocument();

    // Table column headers (content/labels).
    ['complianceMatrix.ref', 'complianceMatrix.titleData', 'complianceMatrix.source',
     'complianceMatrix.complianceStatus', 'complianceMatrix.review', 'complianceMatrix.actions']
      .forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());

    // Row content (ref numbers + titles).
    ['REF-001', 'REF-002', 'REF-003', 'REF-004'].forEach((ref) =>
      expect(screen.getByText(ref)).toBeInTheDocument());
    expect(screen.getByText('Compliant Primary')).toBeInTheDocument();
    expect(screen.getByText('UnderReview Orange')).toBeInTheDocument();
  });

  it('matrix tab shows the four status columns with their labels and per-status counts', async () => {
    render(<ComplianceMatrix />);
    await waitFor(() => expect(screen.getByText('complianceMatrix.generalRegistry')).toBeInTheDocument());

    fireEvent.click(screen.getByText('complianceMatrix.gapMatrixTab'));
    await waitFor(() => expect(screen.getByText('complianceMatrix.compliant')).toBeInTheDocument());

    // Status column labels (icons + labels) preserved.
    ['complianceMatrix.compliant', 'complianceMatrix.partial',
     'complianceMatrix.nonCompliant', 'complianceMatrix.underReview']
      .forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());

    // Each status has exactly one item in the baseline data → count badge "1".
    const countBadges = screen.getAllByText('1');
    expect(countBadges.length).toBeGreaterThanOrEqual(4);
  });

  it('dashboard tab shows the stat labels and the total record count', async () => {
    render(<ComplianceMatrix />);
    await waitFor(() => expect(screen.getByText('complianceMatrix.generalRegistry')).toBeInTheDocument());

    fireEvent.click(screen.getByText('complianceMatrix.dashboard'));
    await waitFor(() => expect(screen.getByText('complianceMatrix.totalRecords')).toBeInTheDocument());

    // Stat labels (text/labels) preserved. `overdueReviews` legitimately appears
    // twice (the stat card label and the overdue-list section heading), so assert
    // presence via getAllByText rather than a uniqueness-implying getByText.
    ['complianceMatrix.totalRecords', 'complianceMatrix.fullyCompliant',
     'complianceMatrix.nonCompliantGaps', 'complianceMatrix.overdueReviews',
     'complianceMatrix.pendingVerification']
      .forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1));

    // Source distribution labels preserved.
    ['complianceMatrix.cbiInstruction', 'complianceMatrix.law',
     'complianceMatrix.internalPolicy', 'complianceMatrix.adminDecision']
      .forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1));
  });
});
