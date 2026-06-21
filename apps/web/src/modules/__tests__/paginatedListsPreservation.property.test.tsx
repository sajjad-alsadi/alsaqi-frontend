// @vitest-environment jsdom
/**
 * Property 4: Preservation - Paginated Non-Enveloped Baseline Unchanged
 *
 * **Validates: Requirements 3.5, 3.6, 3.7**
 *
 * PRESERVATION TEST (bugfix workflow).
 *
 * The four paginated screens
 *   - OutgoingRegister.tsx        (`/correspondence/outgoing`)
 *   - IncomingRegister.tsx        (`/correspondence/incoming`)
 *   - CorrespondenceArchive.tsx   (`/correspondence/archive`)
 *   - SystemErrorLogs/index.tsx   (`/system-errors`)
 * currently consume the NON-enveloped `{ data: [...], pagination: { total, totalPages } }`
 * shape (`NOT isBugCondition`). This behavior MUST be preserved by the fix:
 *
 *   3.5/3.7  For any `{ data, pagination }` response the screen sets exactly the
 *            same items and the same `total` / `totalPages` as before — including
 *            the edge cases of zero items, missing `totalPages` (falls back to 1),
 *            and large totals. This is the baseline encoded by
 *            `paginationPreservation.property.test.ts`, extended here through the
 *            real components.
 *   3.6      A genuine request error (rejected promise) still surfaces each
 *            screen's existing error state.
 *
 * These tests are written observation-first against the UNFIXED code and MUST
 * PASS on it; the fix (`toList` + `toPagination`) returns identical values for
 * the non-enveloped baseline, so they MUST continue to pass afterwards.
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: these tests PASS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import React from 'react';

// ─── Shared mocks (mirror the exploration test setup) ───────────────────────────

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

// The Pagination mock exposes total / totalPages as queryable text.
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
import toast from 'react-hot-toast';

// ─── Item generator (subject === message so every screen renders the same text) ──

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

type Item = ReturnType<typeof makeItem>;

/**
 * Arbitrary NON-enveloped baseline response `{ data, pagination }`.
 * Covers: zero items, small/large `total`, and a present-or-absent `totalPages`.
 */
const arbBaselineResponse = fc
  .record({
    seeds: fc.array(fc.integer({ min: 1, max: 1_000_000 }), {
      minLength: 0,
      maxLength: 5,
    }),
    total: fc.integer({ min: 0, max: 5_000_000 }),
    // `undefined` exercises the missing-totalPages fallback (→ 1).
    totalPages: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  })
  .map(({ seeds, total, totalPages }) => {
    const data = seeds.map((s, i) => makeItem(s, i));
    const pagination: { total: number; totalPages?: number } = { total };
    if (totalPages !== undefined) pagination.totalPages = totalPages;
    return { data, pagination };
  });

/** The exact baseline values the UNFIXED code derives (and the fix must preserve). */
function expectedPagination(resp: {
  data: Item[];
  pagination: { total: number; totalPages?: number };
}): { total: number; totalPages: number } {
  return {
    // total: pagination.total ?? data.length — total is always present here.
    total: resp.pagination.total ?? resp.data.length,
    // totalPages: pagination.totalPages ?? 1 — fallback when absent.
    totalPages: resp.pagination.totalPages ?? 1,
  };
}

// ─── Baseline runner ──────────────────────────────────────────────────────────

async function runBaselineScreen(opts: {
  element: React.ReactElement;
  resp: { data: Item[]; pagination: { total: number; totalPages?: number } };
  emptyKey: string;
}) {
  cleanup();
  const { element, resp, emptyKey } = opts;
  const { total, totalPages } = expectedPagination(resp);

  render(element);

  await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

  // List is populated from `response.data.data`.
  if (resp.data.length === 0) {
    await waitFor(() => expect(screen.getByText(emptyKey)).toBeInTheDocument());
  } else {
    await waitFor(() =>
      expect(screen.getByText(resp.data[0]!.subject)).toBeInTheDocument()
    );
  }

  // total / totalPages match the baseline exactly (preservation).
  await waitFor(() => {
    expect(screen.getByTestId('pg-total').textContent).toBe(String(total));
    expect(screen.getByTestId('pg-totalpages').textContent).toBe(String(totalPages));
  });
}

// ─── 3.5 / 3.7 Non-enveloped baseline preserved (PBT) ───────────────────────────

describe('Property 4: Preservation - non-enveloped { data, pagination } baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3.5 OutgoingRegister: items + total/totalPages preserved for { data, pagination } (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbBaselineResponse, async (resp) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/correspondence/outgoing')) {
            return Promise.resolve({ data: resp });
          }
          return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 0 } } });
        });

        await runBaselineScreen({
          element: <OutgoingRegister language="en" onViewDetails={() => {}} />,
          resp,
          emptyKey: 'correspondence.noOutgoingYet',
        });
      }),
      { numRuns: 15 }
    );
  });

  it('3.5 IncomingRegister: items + total/totalPages preserved for { data, pagination } (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbBaselineResponse, async (resp) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/correspondence/incoming')) {
            return Promise.resolve({ data: resp });
          }
          return Promise.resolve({ data: [] });
        });

        await runBaselineScreen({
          element: <IncomingRegister language="en" onViewDetails={() => {}} />,
          resp,
          emptyKey: 'correspondence.noIncomingYet',
        });
      }),
      { numRuns: 15 }
    );
  });

  it('3.5 CorrespondenceArchive: items + total/totalPages preserved for { data, pagination } (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbBaselineResponse, async (resp) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/correspondence/archive')) {
            return Promise.resolve({ data: resp });
          }
          return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 0 } } });
        });

        await runBaselineScreen({
          element: <CorrespondenceArchive language="en" onViewDetails={() => {}} />,
          resp,
          emptyKey: 'correspondence.archiveEmpty',
        });
      }),
      { numRuns: 15 }
    );
  });

  it('3.5 SystemErrorLogs: logs + total/totalPages preserved for { data, pagination } (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(arbBaselineResponse, async (resp) => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/system-errors/analytics')) {
            return Promise.resolve({ data: [] });
          }
          if (url.includes('/auth/ws-token')) {
            return Promise.resolve({ data: { token: 'test-token' } });
          }
          if (url.includes('/system-errors')) {
            return Promise.resolve({ data: resp });
          }
          return Promise.resolve({ data: [] });
        });

        await runBaselineScreen({
          element: <SystemErrorLogs />,
          resp,
          emptyKey: 'systemErrorLogs.noErrorsLogged',
        });
      }),
      { numRuns: 15 }
    );
  });
});

// ─── 3.6 Genuine error preservation ──────────────────────────────────────────────

describe('Property 4: Preservation - genuine request error surfaces existing error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3.6 OutgoingRegister: a rejected /correspondence/outgoing still toasts errorOccurred', async () => {
    cleanup();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/correspondence/outgoing')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 0 } } });
    });

    render(<OutgoingRegister language="en" onViewDetails={() => {}} />);

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('errorOccurred');
    });
  });

  it('3.6 CorrespondenceArchive: a rejected /correspondence/archive still toasts errorOccurred', async () => {
    cleanup();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/correspondence/archive')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ data: { data: [], pagination: { total: 0, totalPages: 0 } } });
    });

    render(<CorrespondenceArchive language="en" onViewDetails={() => {}} />);

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('errorOccurred');
    });
  });

  it('3.6 IncomingRegister: a rejected /correspondence/incoming still renders the empty state without crashing', async () => {
    cleanup();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/correspondence/incoming')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ data: [] });
    });

    render(<IncomingRegister language="en" onViewDetails={() => {}} />);

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    await waitFor(() => {
      expect(
        screen.getByText('correspondence.failedToLoad')
      ).toBeInTheDocument();
    });
    // No crash — the pagination control is still mounted.
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('3.6 SystemErrorLogs: a rejected /system-errors still surfaces the error panel', async () => {
    cleanup();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/system-errors/analytics')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/auth/ws-token')) {
        return Promise.resolve({ data: { token: 'test-token' } });
      }
      if (url.includes('/system-errors')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ data: [] });
    });

    render(<SystemErrorLogs />);

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('common.error');
  });
});
