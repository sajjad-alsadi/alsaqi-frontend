// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Phase 1 — Exploratory Bug Condition Test for Defect 1.
 *
 * Property 1: Bug Condition — Color classes survive production purging
 *
 * For any render in the matrix tab, dashboard tab, or registry status-change
 * dropdown where a color is selected from `statusConfig`, `sourceColors`, or
 * `stats[].color`, the FIXED code SHALL resolve the color token to complete,
 * statically-analyzable Tailwind class strings (via a lookup map of full class
 * names) so the background, text, border, shadow, and gradient colors render
 * correctly in a production build.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 *
 * --------------------------------------------------------------------------
 * WHY THIS TEST IS EXPECTED TO FAIL ON THE UNFIXED CODE
 * --------------------------------------------------------------------------
 * Tailwind's content scanner only matches *complete, literal* class strings in
 * source. `apps/web` has no `tailwind.config` and no `safelist`. The matrix tab,
 * dashboard tab, and registry status dropdown build their color utilities by
 * INTERPOLATING a runtime token, e.g.:
 *
 *     `bg-${config.color}-50`            (matrix status header)
 *     `bg-${config.color}-400/50`        (matrix item-card accent bar)
 *     `border-b-${stat.color}-500`       (dashboard stat card)
 *     `from-${color}-500 to-${color}-600`(dashboard source distribution bar)
 *     `text-${v.color}-500`              (registry status-change dropdown icon)
 *
 * At runtime these resolve to e.g. `bg-emerald-50`, so a jsdom render still shows
 * the resolved class — the purge only manifests in a production CSS build. The
 * deterministic proxy for "will Tailwind's scanner see it?" is therefore a STATIC
 * SOURCE scan that mirrors the content scanner: the complete literal class must
 * appear verbatim in the component source.
 *
 * On the UNFIXED code these literals are absent (they are interpolated), so the
 * assertions below FAIL — which CONFIRMS the bug. After Defect 1 is fixed (static
 * lookup maps of full class names), the same assertions PASS.
 *
 * DO NOT "fix" this test or the production code here — failure is the success
 * condition for this exploratory task.
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

beforeEach(() => {
  vi.clearAllMocks();
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
});

/**
 * Concrete color tokens actually used by the three color sources (scoped PBT —
 * deterministic per render path).
 */
const STATUS_TOKENS = ['emerald', 'amber', 'rose', 'slate']; // statusConfig[*].color
const STAT_TOKENS = ['primary', 'emerald', 'rose', 'amber', 'slate']; // stats[].color
const SOURCE_TOKENS = ['primary', 'purple', 'emerald', 'orange']; // sourceColors[*]

/**
 * The complete, statically-analyzable literal classes that the FIXED code must
 * emit so Tailwind's content scanner can preserve them. Each is UNIQUE to the
 * interpolated render paths (never produced by an existing static ternary), so a
 * source scan has no false positives. On the UNFIXED code these are interpolated
 * and therefore ABSENT from source.
 */
const EXPECTED_LITERAL_CLASSES: { req: string; path: string; cls: string }[] = [
  // 1.1 — matrix status column header (border accent)
  ...STATUS_TOKENS.map((c) => ({ req: '1.1', path: 'matrix status header', cls: `border-${c}-500/30` })),
  // 1.3 — matrix item-card accent bar
  ...STATUS_TOKENS.map((c) => ({ req: '1.3', path: 'matrix accent bar', cls: `bg-${c}-400/50` })),
  ...STATUS_TOKENS.map((c) => ({ req: '1.3', path: 'matrix accent bar hover', cls: `group-hover:bg-${c}-500` })),
  // 1.4 — dashboard stat card
  ...STAT_TOKENS.map((c) => ({ req: '1.4', path: 'dashboard stat border', cls: `border-b-${c}-500` })),
  ...STAT_TOKENS.map((c) => ({ req: '1.4', path: 'dashboard stat shadow', cls: `shadow-${c}-500/5` })),
  ...STAT_TOKENS.map((c) => ({ req: '1.4', path: 'dashboard stat hover shadow', cls: `hover:shadow-${c}-500/10` })),
  ...STAT_TOKENS.map((c) => ({ req: '1.4', path: 'dashboard stat hover text', cls: `group-hover:text-${c}-600` })),
  // 1.5 — dashboard source distribution gradient bar
  ...SOURCE_TOKENS.map((c) => ({ req: '1.5', path: 'source distribution gradient from', cls: `from-${c}-500` })),
  ...SOURCE_TOKENS.map((c) => ({ req: '1.5', path: 'source distribution gradient to', cls: `to-${c}-600` })),
];

/**
 * The dynamic color-class interpolation fragments currently present in source.
 * Their presence IS the bug (Tailwind cannot match an interpolated token). The
 * FIXED code removes all of these in favor of literal lookups. Covers
 * Requirements 1.1–1.6 directly.
 */
const INTERPOLATION_FRAGMENTS: { req: string; fragment: string }[] = [
  // 1.1 matrix status header
  { req: '1.1', fragment: 'border-${config.color}-500/30' },
  { req: '1.1', fragment: 'bg-${config.color}-50' },
  { req: '1.1', fragment: 'text-${config.color}-600' },
  { req: '1.1', fragment: 'border-${config.color}-100' },
  // 1.2 matrix status count badge
  { req: '1.2', fragment: 'bg-${config.color}-100' },
  { req: '1.2', fragment: 'text-${config.color}-700' },
  { req: '1.2', fragment: 'border-${config.color}-200' },
  // 1.3 matrix item-card accent bar
  { req: '1.3', fragment: 'bg-${config.color}-400/50' },
  { req: '1.3', fragment: 'group-hover:bg-${config.color}-500' },
  // 1.4 dashboard stat card
  { req: '1.4', fragment: 'border-b-${stat.color}-500' },
  { req: '1.4', fragment: 'shadow-${stat.color}-500/5' },
  { req: '1.4', fragment: 'hover:shadow-${stat.color}-500/10' },
  { req: '1.4', fragment: 'bg-${stat.color}-50' },
  { req: '1.4', fragment: 'text-${stat.color}-600' },
  { req: '1.4', fragment: 'group-hover:text-${stat.color}-600' },
  // 1.5 dashboard source distribution bar
  { req: '1.5', fragment: 'text-${color}-600' },
  { req: '1.5', fragment: 'from-${color}-500' },
  { req: '1.5', fragment: 'to-${color}-600' },
  // 1.6 registry status-change dropdown icon
  { req: '1.6', fragment: 'text-${v.color}-500' },
];

describe('Property 1: Bug Condition — Color classes survive production purging (Requirements 1.1–1.6)', () => {
  it('demonstrates the matrix and dashboard tabs render the dynamic color render-paths (token-resolved)', async () => {
    const { container } = render(<ComplianceMatrix />);
    await waitFor(() => expect(screen.getByText('complianceMatrix.generalRegistry')).toBeInTheDocument());

    // Switch to the matrix tab — exercises status header / count badge / accent bar.
    fireEvent.click(screen.getByText('complianceMatrix.gapMatrixTab'));
    await waitFor(() => expect(screen.getByText('complianceMatrix.compliant')).toBeInTheDocument());
    const matrixHtml = container.innerHTML;
    // At runtime the interpolation resolves, so the token IS visible in the DOM
    // (this is exactly why the defect is invisible in dev/jsdom and only bites in
    // a production build where the un-scanned class is purged).
    expect(matrixHtml).toContain('emerald'); // statusConfig.compliant.color resolves

    // Switch to the dashboard tab — exercises stat cards + source distribution bars.
    fireEvent.click(screen.getByText('complianceMatrix.dashboard'));
    await waitFor(() => expect(screen.getByText('complianceMatrix.totalRecords')).toBeInTheDocument());
    expect(container.innerHTML).toContain('primary'); // stats[0].color / sourceColors resolve
  });

  it('emits every dynamic color utility as a COMPLETE LITERAL class present in source (fails on unfixed/interpolated code)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...EXPECTED_LITERAL_CLASSES), (entry) => {
        // Mirror of Tailwind's content scanner: the complete class must appear
        // verbatim in source to survive production purging.
        expect(
          COMPONENT_SOURCE.includes(entry.cls),
          `[Req ${entry.req}] ${entry.path}: expected complete literal class "${entry.cls}" to be present in source ` +
            `so Tailwind can preserve it, but it is built via token interpolation and absent (PURGED in production).`,
        ).toBe(true);
      }),
      { numRuns: EXPECTED_LITERAL_CLASSES.length },
    );
  });

  it('contains NO dynamic color-class interpolation fragments in source (fails on unfixed code)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...INTERPOLATION_FRAGMENTS), (entry) => {
        expect(
          COMPONENT_SOURCE.includes(entry.fragment),
          `[Req ${entry.req}] dynamic color interpolation "${entry.fragment}" must be replaced by a complete ` +
            `literal class so it survives Tailwind production purging, but it is still interpolated in source.`,
        ).toBe(false);
      }),
      { numRuns: INTERPOLATION_FRAGMENTS.length },
    );
  });
});
