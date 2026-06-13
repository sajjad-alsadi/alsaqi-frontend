// @vitest-environment jsdom
/**
 * Phase 1 — Exploratory Bug Condition Test for Defect 4.
 *
 * Property 4: Bug Condition — User-fetch errors are logged
 *
 * For any user-list request in `fetchUsers` that rejects, the FIXED code SHALL
 * log the error via `logger.error('Operation failed', e)`, consistent with the
 * other fetchers in the file (`fetchItems`, `fetchSummary`, `handleSave`, etc.).
 *
 * **Validates: Requirements 1.9**
 *
 * --------------------------------------------------------------------------
 * WHY THIS TEST IS EXPECTED TO FAIL ON THE UNFIXED CODE
 * --------------------------------------------------------------------------
 * `fetchUsers` ends with an EMPTY catch block:
 *
 *     const fetchUsers = async () => {
 *       try {
 *         ... api.get('/users/summary') ... api.get('/users') ...
 *       } catch (e) {}          // <-- swallows every error silently
 *     };
 *
 * Every other fetcher in the file logs via `logger.error('Operation failed', e)`.
 * Because this one does not, a rejected user request produces NO diagnostic —
 * DevTools stays clean and the responsible-person dropdown is silently empty.
 *
 * This bug-condition test encodes the EXPECTED (fixed) behavior — `logger.error`
 * IS invoked when the user fetch rejects — so it FAILS on the unfixed code
 * (where the empty `catch` swallows the error and `logger.error` is never
 * called). The failure CONFIRMS the bug (matching the convention used by the
 * sibling `ComplianceMatrixPage.colorClass.property.test.tsx`).
 *
 * The `/compliance` and `/compliance/summary` requests are mocked to SUCCEED in
 * every case, so the ONLY rejecting request is the user fetch. Therefore any
 * `logger.error` invocation is unambiguously attributable to the user fetch.
 *
 * DO NOT "fix" this test or the production code here — failure is the success
 * condition for this exploratory task.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import fc from 'fast-check';

// --- Test harness mocks (mirror the sibling colorClass property test) ---
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

// logger.error is the spy under test (Property 4).
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
import logger from '../../utils/logger';

function createMockItems(count = 4) {
  const statuses = ['compliant', 'partial', 'non_compliant', 'under_review'] as const;
  const sources = ['cbi_instruction', 'law', 'internal_policy', 'admin_decision'] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `cm-${i + 1}`,
    ref_number: `REF-${String(i + 1).padStart(3, '0')}`,
    title: `Compliance Item ${i + 1}`,
    source_type: sources[i % sources.length]!,
    compliance_status: statuses[i % statuses.length]!,
    responsible_person_name: `Person ${i + 1}`,
  }));
}

/**
 * Install API mocks where /compliance + /compliance/summary always succeed and
 * EVERY /users request rejects with the supplied error. This isolates the user
 * fetch as the sole source of any error, so a `logger.error` call is
 * unambiguously the user-fetch error being logged (the fixed behavior).
 */
function installMocks(userFetchError: unknown) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: 4 } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: { success: true, data: createMockItems() } });
    }
    if (url.includes('/users')) {
      return Promise.reject(userFetchError);
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

/** Flush pending microtasks/timers so the fire-and-forget fetchUsers settles. */
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

/**
 * Generator for realistic rejection shapes a rejected `api.get('/users...')`
 * could throw: plain Errors, axios-style errors with an HTTP status, and
 * non-Error rejection values.
 */
const userFetchErrorArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 40 }).map((m) => new Error(m)),
  fc
    .integer({ min: 400, max: 599 })
    .map((status) => Object.assign(new Error(`Request failed with status code ${status}`), {
      response: { status, data: { detail: 'error' } },
      isAxiosError: true,
    })),
  fc.constantFrom('network error', 'timeout', null, undefined).map((v) => v as unknown),
);

describe('Property 4: Bug Condition — User-fetch errors are logged (Requirement 1.9)', () => {
  it('logs via logger.error when the user fetch rejects (FAILS on unfixed code: empty catch swallows the error)', async () => {
    await fc.assert(
      fc.asyncProperty(userFetchErrorArb, async (userFetchError) => {
        // Start each iteration from a clean DOM + clean mock-call history so a
        // prior render never leaks into this one.
        cleanup();
        vi.clearAllMocks();
        installMocks(userFetchError);

        render(<ComplianceMatrix />);

        // Wait until the component has mounted and attempted the user fetch.
        // (`/compliance` resolves, so the component reaches its data-loading
        // effects.) Use the API-call itself as the signal to avoid any
        // DOM-query ambiguity. The Defect-5 fix requests the canonical
        // `/users/list` endpoint first (no longer `/users/summary`).
        await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/users/list'));

        // Let the rejected user-fetch promise settle through its catch block.
        await flushAsync();

        // EXPECTED (fixed) BEHAVIOR: the rejected user fetch is logged.
        // On the UNFIXED code the empty `catch (e) {}` swallows it, so
        // logger.error is NEVER called and this assertion FAILS — confirming
        // the bug (Requirement 1.9 / Defect 4).
        expect(
          (logger.error as ReturnType<typeof vi.fn>).mock.calls.length,
          'fetchUsers rejected but logger.error was never called — the empty catch block ' +
            'silently swallows the error (Defect 4). The fixed code must call ' +
            "logger.error('Operation failed', e), matching the other fetchers.",
        ).toBeGreaterThan(0);

        cleanup();
      }),
      { numRuns: 12 },
    );
  });
});
