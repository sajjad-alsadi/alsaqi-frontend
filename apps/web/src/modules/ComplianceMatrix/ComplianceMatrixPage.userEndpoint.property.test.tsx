// @vitest-environment jsdom
/**
 * Phase 1 — Exploratory Bug Condition Test for Defect 5.
 *
 * Property 5: Bug Condition — Responsible-person dropdown loads from the correct endpoint
 *
 * For any invocation of `fetchUsers`, the FIXED code SHALL request the canonical
 * user-list endpoint (`/users/list`, or `/users`) — NOT `/users/summary` — parse
 * the result envelope-agnostically via `toList`, and ensure that a failed request
 * does not silently prevent the dropdown from loading (the error is logged and any
 * fallback remains reachable), so the responsible-person ("الشخص المسؤول") select
 * is populated with selectable users.
 *
 * **Validates: Requirements 1.10, 1.11**
 *
 * --------------------------------------------------------------------------
 * WHY THIS TEST IS EXPECTED TO FAIL ON THE UNFIXED CODE
 * --------------------------------------------------------------------------
 * The unfixed `fetchUsers` is:
 *
 *     const fetchUsers = async () => {
 *       try {
 *         const uRes = await api.get('/users/summary');        // <-- WRONG endpoint
 *         const summaryUsers = toList<UserOption>(uRes.data);  // stats object -> []
 *         if (summaryUsers.length > 0) {
 *           setUsers(summaryUsers);
 *         } else {
 *           const uResFallback = await api.get('/users');      // fallback INSIDE try
 *           setUsers(toList<UserOption>(uResFallback.data));
 *         }
 *       } catch (e) {}                                          // <-- swallows reject
 *     };
 *
 * `/users/summary` is a statistics summary endpoint (typed client validates it as
 * `UserSummarySchema = z.record(z.string(), z.unknown())` — a generic stats object,
 * NOT a user array). In production it does not return a user list, and when it
 * REJECTS (404 / validation failure) the `/users` fallback — placed after the
 * summary call inside the SAME `try` — never runs, because the empty `catch`
 * (Defect 4) swallows the rejection. The responsible-person select then shows only
 * its placeholder.
 *
 * This test pins the EXPECTED (fixed) behavior: a failed primary user request must
 * not prevent the dropdown from loading — the canonical list endpoint / fallback
 * must remain reachable and populate the select. On the UNFIXED code the swallowed
 * rejection leaves `users == []`, so the assertions below FAIL — which CONFIRMS
 * the bug. After Defect 5 (+ Defect 4) is fixed, the same assertions PASS
 * (re-run by task 11.7).
 *
 * DO NOT "fix" this test or the production code here — failure is the success
 * condition for this exploratory task.
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

/**
 * A statistics summary object as returned by `/users/summary`
 * (`UserSummarySchema = z.record(z.string(), z.unknown())` — NOT a user array).
 * `toList<UserOption>(...)` over this object yields `[]`.
 */
const STATS_SUMMARY_OBJECT = { total: 42, active: 30, inactive: 12, by_role: { admin: 2 } };

/** Which user-related GET endpoints were requested (in call order). */
function requestedUserEndpoints(): string[] {
  return mockApiGet.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes('/users'));
}

/** Open the Add Record modal that contains the responsible-person select. */
async function openAddRecordModal() {
  await waitFor(() => expect(screen.getByText('complianceMatrix.addRecord')).toBeInTheDocument());
  fireEvent.click(screen.getByText('complianceMatrix.addRecord'));
  await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument());
}

/**
 * Build a mockApiGet implementation where:
 *  - `/compliance/summary` and `/compliance` resolve normally,
 *  - `/users/summary` behaves as configured (reject, or resolve with a stats object),
 *  - `/users` (and `/users/list`) resolve with the supplied user list.
 */
function makeApi(opts: {
  summary: 'reject' | 'stats';
  userList: Array<{ id: string | number; name?: string; full_name?: string; username?: string }>;
}) {
  return (url: string) => {
    if (url.includes('/compliance/summary')) {
      return Promise.resolve({ data: { success: true, data: { total: 0 } } });
    }
    if (url.includes('/compliance')) {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    if (url.includes('/users/summary')) {
      return opts.summary === 'reject'
        ? Promise.reject(new Error('404 — /users/summary is a stats endpoint, not a user list'))
        : Promise.resolve({ data: STATS_SUMMARY_OBJECT });
    }
    // Canonical user-list endpoints: /users and /users/list
    if (url.includes('/users')) {
      return Promise.resolve({ data: { success: true, data: opts.userList } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Property 5: Bug Condition — Responsible-person dropdown loads from the correct endpoint (Requirements 1.10, 1.11)', () => {
  // ---------------------------------------------------------------------------
  // Corrected-endpoint assertion. The pre-fix counterexample was that the first
  // user endpoint hit was the statistics summary (`/users/summary`); the Defect-5
  // fix requests the canonical user-list endpoint first instead (Requirement 2.10).
  // ---------------------------------------------------------------------------
  it('requests the canonical user-list endpoint first, NOT the /users/summary stats endpoint', async () => {
    mockApiGet.mockImplementation(
      makeApi({ summary: 'stats', userList: [{ id: 'u-1', name: 'Alice' }] }),
    );
    render(<ComplianceMatrix />);
    await waitFor(() => expect(requestedUserEndpoints().length).toBeGreaterThan(0));

    // Fixed behavior: the first user endpoint hit is a canonical list endpoint,
    // never the statistics summary endpoint.
    expect(requestedUserEndpoints()[0]).not.toBe('/users/summary');
    expect(requestedUserEndpoints()[0]).toBe('/users/list');
  });

  // ---------------------------------------------------------------------------
  // FIXED-behavior assertions (FAIL on unfixed code — failure confirms the bug).
  // ---------------------------------------------------------------------------
  it('when the primary user request fails, the /users fallback remains REACHABLE (fails on unfixed: swallowed reject)', async () => {
    // /users/summary rejects (as the real stats endpoint does); /users returns a real list.
    mockApiGet.mockImplementation(
      makeApi({ summary: 'reject', userList: [{ id: 'u-1', name: 'Reachable Person' }] }),
    );
    render(<ComplianceMatrix />);

    // The fixed code must still reach a canonical list endpoint. On the unfixed
    // code the empty catch swallows the /users/summary rejection so /users is
    // never called -> this assertion fails (CONFIRMS the bug).
    await waitFor(
      () => {
        const listCalls = requestedUserEndpoints().filter((u) => u !== '/users/summary');
        expect(listCalls.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
  });

  it('populates the responsible-person select when the primary user request fails (fails on unfixed: empty placeholder-only select)', async () => {
    mockApiGet.mockImplementation(
      makeApi({ summary: 'reject', userList: [{ id: 'u-7', name: 'Dropdown Person' }] }),
    );
    render(<ComplianceMatrix />);
    await openAddRecordModal();

    // On the fixed code the dropdown lists the loaded user; on unfixed the reject
    // is swallowed, users == [], and only the placeholder option renders.
    await waitFor(
      () => expect(screen.getByRole('option', { name: 'Dropdown Person' })).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  // ---------------------------------------------------------------------------
  // Property-based: for ANY user list, a failed primary fetch must not leave the
  // dropdown empty. FAILS on unfixed code for every generated list.
  // ---------------------------------------------------------------------------
  it('for any user list, the responsible-person select is populated even when /users/summary rejects (fails on unfixed)', async () => {
    const usersArb = fc
      .uniqueArray(fc.integer({ min: 1, max: 9999 }), { minLength: 1, maxLength: 4 })
      .map((ids) => ids.map((id) => ({ id: `user-${id}`, name: `RespPerson${id}` })));

    await fc.assert(
      fc.asyncProperty(usersArb, async (userList) => {
        cleanup();
        vi.clearAllMocks();
        mockApiGet.mockImplementation(makeApi({ summary: 'reject', userList }));

        render(<ComplianceMatrix />);
        await openAddRecordModal();

        // Every generated user must appear as a selectable option once loaded.
        await waitFor(
          () => {
            for (const u of userList) {
              expect(screen.getByRole('option', { name: u.name })).toBeInTheDocument();
            }
          },
          { timeout: 2000 },
        );
      }),
      { numRuns: 12 },
    );
  });
});
