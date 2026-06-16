// @vitest-environment jsdom
// Feature: code-review-remediation, Property 11: Concurrently-arriving notifications are retained
//
// Property 11: Concurrently-arriving notifications are retained
//   - For any notification list and any notification that arrives (via the
//     WebSocket onNotification callback) DURING an awaited `markAsRead` or
//     `deleteNotification` operation, the arriving notification is present in
//     the resulting notification state. This holds because both operations
//     commit their change with a FUNCTIONAL updater (`setNotifications(prev =>
//     …)`) that reads the latest previous state rather than a stale snapshot
//     captured before the await.
//   **Validates: Requirements 13.1, 13.2, 13.3**
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import React, { ReactNode } from 'react';
import fc from 'fast-check';
import type { User, Notification } from '../types';

// ─── Hoisted mock state (shared between vi.mock factories and the test body) ──
const hoisted = vi.hoisted(() => {
  /** Captured config of every WebSocket client created, in creation order. */
  const clients: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    config: any;
  }> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createWebSocketClient = vi.fn((config: any) => {
    const client = { connect: vi.fn(), disconnect: vi.fn(), config };
    clients.push(client);
    return client;
  });

  return {
    clients,
    createWebSocketClient,
    userRef: { current: null as User | null },
    sessionRef: { current: false },
    playNotificationSound: vi.fn(),
    apiGet: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    // The list the mocked GET /notifications endpoint returns for the next render.
    listRef: { current: [] as Notification[] },
  };
});

vi.mock('../api/ws/websocket-client', () => ({
  createWebSocketClient: hoisted.createWebSocketClient,
}));

vi.mock('../utils/notificationSound', () => ({
  playNotificationSound: hoisted.playNotificationSound,
}));

vi.mock('../utils/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../api/httpClient', () => ({
  default: {
    get: hoisted.apiGet,
    put: hoisted.apiPut,
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: hoisted.apiDelete,
  },
}));

vi.mock('../context/UserContext', () => ({
  useUser: () => ({ user: hoisted.userRef.current, setUser: vi.fn(), updateUser: vi.fn() }),
  UserProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    token: null,
    setToken: vi.fn(),
    logout: vi.fn(),
    isCheckingSession: hoisted.sessionRef.current,
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// Import after mocks are registered.
import { NotificationProvider, useNotificationContext } from './NotificationContext';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const testUser: User = {
  id: 'user-a',
  username: 'alice',
  name: 'Alice',
  email: 'alice@example.com',
  department: 'Internal Audit',
  role: 'Internal Auditor',
  status: 'Active',
};

/** Build a type-complete Notification from the fields the context actually reads. */
function makeNotification(id: number, isRead: boolean): Notification {
  return {
    id,
    event_type: 'test_event',
    description: `notification-${id}`,
    related_module: 'test',
    date: '2024-01-01T00:00:00.000Z',
    is_read: isRead,
    status: isRead ? 'Read' : 'Unread',
  };
}

/** The mocked GET handler: ws-token, unread-count, and the per-run notification list. */
function installApiGet() {
  hoisted.apiGet.mockImplementation((url: string) => {
    if (url === '/auth/ws-token') return Promise.resolve({ data: { token: 'ws-token' } });
    if (url.startsWith('/notifications/unread-count')) return Promise.resolve({ data: { count: 0 } });
    if (url.startsWith('/notifications')) return Promise.resolve({ data: { data: hoisted.listRef.current } });
    return Promise.resolve({ data: {} });
  });
}

/** A promise whose resolution the test controls (models the in-flight API call). */
function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

// Capture the live context value via a ref so the test can drive operations.
type Ctx = ReturnType<typeof useNotificationContext>;
const Capture: React.FC<{ ctxRef: { current: Ctx | null } }> = ({ ctxRef }) => {
  ctxRef.current = useNotificationContext();
  return null;
};

// ─── Generators ─────────────────────────────────────────────────────────────────
const baseListArb: fc.Arbitrary<Notification[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 50 }), { minLength: 1, maxLength: 10 })
  .chain((ids) =>
    fc.tuple(...ids.map(() => fc.boolean())).map((reads) =>
      ids.map((id, i) => makeNotification(id, reads[i] as boolean))
    )
  );

interface Scenario {
  list: Notification[];
  targetId: number;
  arrivingId: number;
  op: 'markRead' | 'delete';
}

const scenarioArb: fc.Arbitrary<Scenario> = baseListArb.chain((list) =>
  fc.record({
    list: fc.constant(list),
    // Target an EXISTING notification so the operation has an effect.
    targetId: fc.constantFrom(...list.map((n) => Number(n.id))),
    // Arriving id is disjoint from the initial list's id range (0..50).
    arrivingId: fc.integer({ min: 1000, max: 2000 }),
    op: fc.constantFrom<'markRead' | 'delete'>('markRead', 'delete'),
  })
);

// ─── Test ─────────────────────────────────────────────────────────────────────
describe('Property 11: Concurrently-arriving notifications are retained', () => {
  beforeEach(() => {
    hoisted.clients.length = 0;
    hoisted.createWebSocketClient.mockClear();
    hoisted.playNotificationSound.mockClear();
    hoisted.apiGet.mockReset();
    hoisted.userRef.current = testUser;
    hoisted.sessionRef.current = false;
    installApiGet();
  });

  afterEach(() => {
    cleanup();
  });

  it('retains a notification arriving mid-flight during markAsRead/deleteNotification', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ list, targetId, arrivingId, op }) => {
        // Arrange: the next render's GET /notifications returns this run's list.
        hoisted.listRef.current = list;
        hoisted.clients.length = 0;

        // The in-flight write (PUT for markAsRead, DELETE for deleteNotification)
        // stays pending until the test resolves it — AFTER injecting the
        // concurrently-arriving notification.
        const inflight = defer<{ data: Record<string, never> }>();
        hoisted.apiPut.mockImplementation(() => inflight.promise);
        hoisted.apiDelete.mockImplementation(() => inflight.promise);

        const ctxRef: { current: Ctx | null } = { current: null };
        render(
          <NotificationProvider>
            <Capture ctxRef={ctxRef} />
          </NotificationProvider>
        );

        // Wait until the initial fetch has populated the list and the WS client
        // (which exposes onNotification) has been created.
        await waitFor(() => {
          expect(hoisted.clients.length).toBeGreaterThan(0);
          expect(ctxRef.current?.notifications.length).toBe(list.length);
        });

        const onNotification = hoisted.clients[hoisted.clients.length - 1].config
          .onNotification as (payload: Notification) => void;

        // Act 1: start the operation — it awaits the (still pending) API call.
        let opPromise!: void | Promise<void>;
        await act(async () => {
          opPromise =
            op === 'markRead'
              ? ctxRef.current!.markAsRead(targetId)
              : ctxRef.current!.deleteNotification(targetId);
        });

        // Act 2: a WebSocket notification arrives WHILE the operation is in flight.
        const arriving = makeNotification(arrivingId, false);
        await act(async () => {
          onNotification(arriving);
        });

        // Act 3: the API call now resolves; the operation commits its functional
        // update reading the latest state (which already contains `arriving`).
        await act(async () => {
          inflight.resolve({ data: {} as Record<string, never> });
          await opPromise;
        });

        // Assert: the concurrently-arriving notification survived (Req 13.1–13.3).
        const finalList = ctxRef.current!.notifications;
        const arrivingMatches = finalList.filter((n) => Number(n.id) === arrivingId);
        expect(arrivingMatches).toHaveLength(1);

        // And the operation's own effect was applied to the target.
        if (op === 'markRead') {
          const target = finalList.find((n) => Number(n.id) === targetId);
          expect(target).toBeDefined();
          expect(target!.is_read).toBe(true);
        } else {
          expect(finalList.some((n) => Number(n.id) === targetId)).toBe(false);
        }

        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 60000);
});
