// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Property 2: Bug Condition - Paginated Lists Envelope-Agnostic Consumption
 *                             with Pagination Fallback
 *
 * **Validates: Requirements 1.5, 1.6, 1.7, 1.8**
 *
 * EXPLORATORY BUG-CONDITION TEST (bugfix workflow).
 *
 * The four paginated screens
 *   - OutgoingRegister.tsx        (`/correspondence/outgoing`)
 *   - IncomingRegister.tsx        (`/correspondence/incoming`)
 *   - CorrespondenceArchive.tsx   (`/correspondence/archive`)
 *   - SystemErrorLogs/index.tsx   (`/system-errors`)
 * all read `response.data.data` and `response.data.pagination` directly:
 *
 *   if (response.data.data) {
 *     setItems(response.data.data);
 *     setPagination(prev => ({ ...prev,
 *       total: response.data.pagination?.total ?? response.data.data.length,
 *       totalPages: response.data.pagination?.totalPages ?? 1 }));
 *   } else {
 *     setItems(response.data);          // (Archive has NO else branch at all)
 *   }
 *
 * If any of these endpoints ever adopts the `{ success: true, data, pagination }`
 * envelope, the real interceptor in `apps/web/src/api/client.ts` unwraps
 * `response.data` to the INNER ARRAY. Then:
 *   - `response.data.data` is `undefined`  → the `if` branch is skipped,
 *   - the `pagination` sibling is DISCARDED → `total` / `totalPages` are lost.
 *
 * Here we mock `api.get` to resolve to the UNWRAPPED ARRAY shape the interceptor
 * actually produces (a bare array, with no `data` / `pagination` siblings) for
 * each screen's endpoint.
 *
 * Bug condition (from design `isBugCondition`, paginated branch):
 *   X is null OR X has no field named "data" OR X has no field named "pagination".
 *
 * Expected behavior the fix must satisfy (asserted below): for all such inputs the
 * screen does NOT crash, populates the list from the unwrapped array, and falls
 * back to a sensible pagination value (`total` ← loaded item count, `totalPages` ← 1).
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: this test FAILS (proving the fragile path is
 * broken when the payload is unwrapped). DO NOT "fix" the test when it fails —
 * the failure is the signal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import React from 'react';

// ─── Shared mocks ───────────────────────────────────────────────────────────────

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

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: string) => d || '',
    formatNumber: (n: any) => String(n),
    formatDateTime: (d: string) => d,
  }),
}));

// Pass-through debounce so the initial fetch fires synchronously.
vi.mock('../../hooks/useDebounce', () => ({
  useDebounce: (value: any) => value,
}));

// The Pagination mock exposes the component's pagination state (total / totalPages)
// as queryable text so the test can assert the fallback values directly.
vi.mock('../../components/Pagination', () => ({
  default: ({ totalItems, totalPages }: any) => {
    const R = require('react');
    return R.createElement(
      'div',
      { 'data-testid': 'pagination' },
      R.createElement('span', { 'data-testid': 'pg-total' }, String(totalItems)),
      R.createElement('span', { 'data-testid': 'pg-totalpages' }, String(totalPages))
    );
  },
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, children }: any) => {
    const R = require('react');
    return isOpen ? R.createElement('div', { 'data-testid': 'modal' }, children) : null;
  },
}));

vi.mock('../../components/Portal', () => ({
  default: ({ children }: any) => children,
}));

vi.mock('../../components/PdfViewer', () => ({
  default: () => null,
}));

vi.mock('../../components/SkeletonLoader', () => ({
  TableSkeleton: () => {
    const R = require('react');
    return R.createElement('div', { 'data-testid': 'skeleton' });
  },
  SkeletonLoader: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, asChild, ...props }: any) => {
    const R = require('react');
    return R.createElement('button', { onClick, ...props }, children);
  },
}));

// Sub-forms / analytics are irrelevant to the data-load path.
vi.mock('../Correspondence/OutgoingForm', () => ({ default: () => null }));
vi.mock('../Correspondence/IncomingForm', () => ({ default: () => null }));
vi.mock('../SystemErrorLogs/SystemErrorAnalytics', () => ({ default: () => null }));

vi.mock('lucide-react', () => {
  const R = require('react');
  const icon = R.forwardRef((props: any, ref: any) =>
    R.createElement('svg', { ...props, ref })
  );
  return {
    Search: icon, Plus: icon, Eye: icon, Download: icon, MoreVertical: icon,
    Calendar: icon, Building: icon, Tag: icon, FileText: icon, X: icon,
    Send: icon, Trash2: icon, Edit2: icon, Filter: icon, User: icon,
    AlertCircle: icon, CheckCircle: icon, Clock: icon, Mail: icon,
    Archive: icon, RefreshCw: icon, ChevronDown: icon, ChevronUp: icon,
    ShieldAlert: icon,
  };
});

vi.mock('motion/react', () => {
  const R = require('react');
  const make = (tag: string) =>
    R.forwardRef(
      (
        { children, initial, animate, exit, transition, whileHover, whileTap, layout, ...props }: any,
        ref: any
      ) => R.createElement(tag, { ...props, ref }, children)
    );
  return {
    motion: new Proxy({}, { get: (_t: any, prop: string) => make(prop) }),
    AnimatePresence: ({ children }: any) => children,
  };
});

import OutgoingRegister from '../Correspondence/OutgoingRegister';
import IncomingRegister from '../Correspondence/IncomingRegister';
import CorrespondenceArchive from '../Correspondence/CorrespondenceArchive';
import SystemErrorLogs from '../SystemErrorLogs/index';

// ─── Unwrapped-array payload generator ──────────────────────────────────────────

/** Build an item carrying every field the four screens read while rendering rows. */
function makeItem(seed: number, i: number) {
  const uid = `ITEM-${seed}-${i}`;
  return {
    id: seed * 100 + i,
    sequence_number: seed,
    letter_number: seed,
    letter_date: '2024-01-01',
    receipt_date: '2024-01-02',
    updated_at: '2024-01-03',
    timestamp: '2024-01-04',
    recipient_entity: 'Recipient',
    sender_entity: 'Sender',
    entity: 'Entity',
    subject: uid,
    message: uid,
    module: 'auth',
    stack: '',
    severity: 'error' as const,
    status: 'Received',
    priority: 'Normal',
    classification: 'Public',
    sending_method: 'Email',
    type: 'Incoming' as const,
  };
}

/** Arrays of varying length (including empty) — the unwrapped list shape. */
const arbUnwrappedList = fc
  .array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 0, maxLength: 5 })
  .map((seeds) => seeds.map((s, i) => makeItem(s, i)));

type Item = ReturnType<typeof makeItem>;

// ─── Assertion helpers ──────────────────────────────────────────────────────────

function assertPaginationFallback(itemCount: number) {
  // total should fall back to the loaded item count, totalPages to 1.
  expect(screen.getByTestId('pg-total').textContent).toBe(String(itemCount));
  expect(screen.getByTestId('pg-totalpages').textContent).toBe('1');
}

/**
 * Render a paginated screen against an unwrapped array, wait for the load to
 * settle, then assert (a) no crash, (b) the list is populated from the array,
 * and (c) pagination falls back sensibly.
 *
 * `settle` resolves once the async fetch has been applied to component state.
 * `emptyKey` is the screen's empty-state translation key (used to settle the
 * empty case without waiting for a row that will never appear).
 */
async function runScreen(opts: {
  element: React.ReactElement;
  list: Item[];
  settle: () => void;
  emptyKey: string;
}) {
  cleanup();
  const { element, list, settle, emptyKey } = opts;

  render(element);

  await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  // Wait until the fetch result has been committed to state.
  await waitFor(settle);

  // (a) No crash + pagination is rendered.
  expect(screen.getByTestId('pagination')).toBeInTheDocument();

  if (list.length === 0) {
    // Empty list → empty-state message, total 0, totalPages 1.
    expect(screen.getByText(emptyKey)).toBeInTheDocument();
    assertPaginationFallback(0);
  } else {
    // (b) List populated from the unwrapped array — first item must render.
    expect(screen.getByText(list[0]!.subject)).toBeInTheDocument();
    // (c) Pagination falls back to item count / 1.
    assertPaginationFallback(list.length);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────────

describe('Property 2: Bug Condition - Paginated Lists Envelope-Agnostic Consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1.5 OutgoingRegister: unwrapped array → list populated + pagination fallback (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbUnwrappedList, async (list) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/correspondence/outgoing')) {
            return Promise.resolve({ data: list }); // unwrapped array (no data/pagination)
          }
          return Promise.resolve({ data: [] });
        });

        await runScreen({
          element: <OutgoingRegister language="en" onViewDetails={() => {}} />,
          list,
          settle: () =>
            expect(screen.queryByText('common.loading')).not.toBeInTheDocument(),
          emptyKey: 'correspondence.noOutgoingYet',
        });
      }),
      { numRuns: 15 }
    );
  });

  it('1.6 IncomingRegister: unwrapped array → list populated + pagination fallback (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbUnwrappedList, async (list) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/correspondence/incoming')) {
            return Promise.resolve({ data: list });
          }
          // fetchMetadata: /org-entities and /users
          return Promise.resolve({ data: [] });
        });

        await runScreen({
          element: <IncomingRegister language="en" onViewDetails={() => {}} />,
          list,
          settle: () =>
            expect(screen.queryByText('common.loading')).not.toBeInTheDocument(),
          emptyKey: 'correspondence.noIncomingYet',
        });
      }),
      { numRuns: 15 }
    );
  });

  it('1.7 CorrespondenceArchive: unwrapped array → list populated + pagination fallback (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbUnwrappedList, async (list) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/correspondence/archive')) {
            return Promise.resolve({ data: list });
          }
          return Promise.resolve({ data: [] });
        });

        await runScreen({
          element: <CorrespondenceArchive language="en" onViewDetails={() => {}} />,
          list,
          settle: () =>
            expect(screen.queryByText('common.loading')).not.toBeInTheDocument(),
          emptyKey: 'correspondence.archiveEmpty',
        });
      }),
      { numRuns: 15 }
    );
  });

  it('1.8 SystemErrorLogs: unwrapped array → list populated + pagination fallback (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbUnwrappedList, async (list) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/system-errors/analytics')) {
            return Promise.resolve({ data: [] });
          }
          if (url.includes('/auth/ws-token')) {
            return Promise.resolve({ data: { token: 'test-token' } });
          }
          if (url.includes('/system-errors')) {
            return Promise.resolve({ data: list });
          }
          return Promise.resolve({ data: [] });
        });

        await runScreen({
          element: <SystemErrorLogs />,
          list,
          // Pagination only renders once loading is false (table branch).
          settle: () =>
            expect(screen.queryByTestId('pagination')).toBeInTheDocument(),
          emptyKey: 'systemErrorLogs.noErrorsLogged',
        });
      }),
      { numRuns: 15 }
    );
  });
});
