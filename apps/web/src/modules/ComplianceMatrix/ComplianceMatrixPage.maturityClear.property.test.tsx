// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Phase 1 — Exploratory Bug Condition Test for Defect 3.
 *
 * Property 3: Bug Condition — Cleared maturity score is omitted, not "NaN"
 *
 * For any save where the maturity-score input has been cleared, the FIXED code
 * SHALL set `formData.maturity_score` to `null`/`undefined` (never `NaN`) and
 * SHALL omit the field from the multipart payload rather than serializing the
 * literal string `"NaN"`.
 *
 * **Validates: Requirements 1.8**
 *
 * --------------------------------------------------------------------------
 * WHY THIS TEST IS EXPECTED TO FAIL ON THE UNFIXED CODE
 * --------------------------------------------------------------------------
 * The maturity number input's `onChange` runs:
 *
 *     onChange={e => setFormData({ ...formData, maturity_score: parseInt(e.target.value) })}
 *
 * Clearing the field gives `e.target.value === ''`, and `parseInt('') === NaN`.
 * `handleSave` then serializes every entry that is `!== undefined && !== null`:
 *
 *     Object.entries(formData).forEach(([key, value]) => {
 *       if (value !== undefined && value !== null) data.append(key, value.toString());
 *     });
 *
 * `NaN` passes that guard (it is neither `undefined` nor `null`), so the
 * multipart body ends up with `maturity_score="NaN"` (because `NaN.toString()`
 * is the literal string `"NaN"`).
 *
 * This test asserts the CORRECT (fixed) behavior — that a cleared maturity field
 * is OMITTED from the payload and never serialized as `"NaN"`. On the UNFIXED
 * code the payload contains `maturity_score="NaN"`, so the assertions below FAIL,
 * which CONFIRMS the bug. After Defect 3 is fixed (sanitize cleared/invalid input
 * to `null`), the same assertions PASS — which is why task 11.7 re-runs this very
 * test as the fix check.
 *
 * DO NOT "fix" this test or the production code here — failure (payload contains
 * the literal "NaN") is the success condition for this exploratory task.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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
  mockApiPost.mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } });
  mockApiPut.mockResolvedValue({ data: { success: true, data: { id: 'edit-1' } } });
});

/**
 * Open the Add Record modal, set the maturity-score input to `initialValue`,
 * clear it (rawValue === ''), submit the form, and return the captured multipart
 * FormData that `handleSave` passed to `api.post('/compliance', ...)`.
 */
async function captureClearedMaturityPayload(initialValue: number): Promise<FormData> {
  cleanup();
  mockApiPost.mockClear();

  const { container } = render(<ComplianceMatrix />);
  await waitFor(() => expect(screen.getByText('complianceMatrix.addRecord')).toBeInTheDocument());

  // Open the Add Record modal.
  fireEvent.click(screen.getByText('complianceMatrix.addRecord'));
  await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());

  // The maturity-score input is the only number input in the modal.
  const maturityInput = container.querySelector('input[type="number"]') as HTMLInputElement | null;
  if (!maturityInput) throw new Error('maturity-score number input not found in Add Record modal');

  // 1) Set a maturity value, then 2) clear it (this is the bug condition).
  fireEvent.change(maturityInput, { target: { value: String(initialValue) } });
  fireEvent.change(maturityInput, { target: { value: '' } });

  // Submit the modal form.
  const form = container.querySelector('form') as HTMLFormElement | null;
  if (!form) throw new Error('modal form not found');
  fireEvent.submit(form);

  await waitFor(() => expect(mockApiPost).toHaveBeenCalled());

  const [, payload] = mockApiPost.mock.calls[0]!;
  return payload as FormData;
}

describe('Property 3: Bug Condition — Cleared maturity score is omitted, not "NaN" (Requirement 1.8)', () => {
  it('demonstrates clearing the maturity input drives formData.maturity_score to NaN at runtime', async () => {
    const data = await captureClearedMaturityPayload(80);
    // Document the runtime artifact: the cleared field is serialized at all.
    // (On unfixed code its value is the literal "NaN".)
    const serialized = data.get('maturity_score');
    // eslint-disable-next-line no-console
    console.log('[Defect 3] captured maturity_score payload value =', JSON.stringify(serialized));
    // compliance_status is always present from the initial form state; this just
    // confirms the harness captured a real submit.
    expect(data.get('compliance_status')).toBe('under_review');
  });

  it('omits maturity_score from the payload when cleared (fails on unfixed code: payload contains "NaN")', async () => {
    await fc.assert(
      // Use a non-zero initial value: the cleared-field bug serializes "NaN".
      // (The maturity===0 case is a distinct controlled-input quirk covered by
      // the Property 9 valid-maturity preservation tests, not this NaN defect.)
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (initialValue) => {
        const data = await captureClearedMaturityPayload(initialValue);
        const serialized = data.get('maturity_score');

        // The cleared maturity field must NEVER serialize as the literal "NaN".
        expect(
          serialized,
          `cleared maturity (was ${initialValue}) serialized as ${JSON.stringify(serialized)} — ` +
            `expected the field to be omitted from the multipart payload, not the literal string "NaN".`,
        ).not.toBe('NaN');

        // It must be omitted entirely (no key at all).
        expect(
          data.has('maturity_score'),
          `cleared maturity (was ${initialValue}) left maturity_score present in the payload ` +
            `(value=${JSON.stringify(serialized)}); a cleared optional numeric field must be omitted.`,
        ).toBe(false);
      }),
      { numRuns: 10 },
    );
  });
});
