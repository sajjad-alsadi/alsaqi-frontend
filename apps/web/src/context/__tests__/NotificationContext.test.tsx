// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React, { ReactNode } from 'react';
import type { User, Notification } from '../../types';

/**
 * Context Tests - NotificationContext wiring (Area C)
 *
 * Covers:
 *  - A resilient `WebSocketClient` is instantiated (via `createWebSocketClient`)
 *    and `client.connect()` is invoked when an authenticated user is present.
 *  - When the authenticated user state changes (logout then a different user
 *    logs in), the previous client is torn down (`disconnect`) and a brand-new
 *    client is created and connected — re-establishing the connection.
 *  - The re-established connection uses *current* callback references (the
 *    callbacks are stored in refs and refreshed every render), so the new
 *    client's wired callbacks are live and functional rather than stale
 *    closures from a previous user session.
 *
 * _Requirements: 3.1, 3.4_
 */

// ─── Hoisted mock state (shared between vi.mock factories and the test body) ──
const hoisted = vi.hoisted(() => {
  /** Every client produced by the mocked factory, in creation order. */
  const clients: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // Mutable state driving the mocked useUser/useAuth hooks.
    userRef: { current: null as User | null },
    sessionRef: { current: false },
    // Mocked side-effect dependencies.
    playNotificationSound: vi.fn(),
    apiGet: vi.fn(),
  };
});

// Mock the resilient WebSocket client factory: return a controllable stub.
vi.mock('../../api/ws/websocket-client', () => ({
  createWebSocketClient: hoisted.createWebSocketClient,
}));

// Mock the notification sound util (used by the onNotification callback).
vi.mock('../../utils/notificationSound', () => ({
  playNotificationSound: hoisted.playNotificationSound,
}));

// Mock the structured logger to keep test output clean.
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the raw axios instance used by NotificationContext for the
// /auth/ws-token and notifications endpoints.
vi.mock('../../api/httpClient', () => ({
  default: {
    get: hoisted.apiGet,
    put: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

// Drive `useUser`/`useAuth` from the hoisted mutable refs so the test can flip
// the authenticated user between renders.
vi.mock('../UserContext', () => ({
  useUser: () => ({
    user: hoisted.userRef.current,
    setUser: vi.fn(),
    updateUser: vi.fn(),
  }),
  UserProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({
    token: null,
    setToken: vi.fn(),
    logout: vi.fn(),
    isCheckingSession: hoisted.sessionRef.current,
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// Import after mocks are registered.
import { NotificationProvider } from '../NotificationContext';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const userA: User = {
  id: 'user-a',
  username: 'alice',
  name: 'Alice',
  email: 'alice@example.com',
  department: 'Internal Audit',
  role: 'Internal Auditor',
  status: 'Active',
};

const userB: User = {
  id: 'user-b',
  username: 'bob',
  name: 'Bob',
  email: 'bob@example.com',
  department: 'Compliance',
  role: 'Compliance Officer',
  status: 'Active',
};

const sampleNotification: Notification = {
  id: 'n-1',
  event_type: 'finding.created',
  description: 'A new finding was created',
  related_module: 'findings',
  date: new Date().toISOString(),
};

/** Default api.get behaviour: resolves a ws-token and empty notification lists. */
function installDefaultApiGet() {
  hoisted.apiGet.mockImplementation((url: string) => {
    if (url === '/auth/ws-token') {
      return Promise.resolve({ data: { token: 'ws-token-123' } });
    }
    if (url.startsWith('/notifications/unread-count')) {
      return Promise.resolve({ data: { count: 0 } });
    }
    if (url.startsWith('/notifications')) {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.resolve({ data: {} });
  });
}

const Child = () => <div data-testid="child">child</div>;

describe('NotificationContext wiring', () => {
  beforeEach(() => {
    hoisted.clients.length = 0;
    hoisted.createWebSocketClient.mockClear();
    hoisted.playNotificationSound.mockClear();
    hoisted.apiGet.mockReset();
    hoisted.userRef.current = null;
    hoisted.sessionRef.current = false;
    installDefaultApiGet();
  });

  it('instantiates a WebSocketClient and connects when a user is present', async () => {
    hoisted.userRef.current = userA;

    render(
      <NotificationProvider>
        <Child />
      </NotificationProvider>
    );

    // The connect cycle resolves the ws-token before creating the client.
    await waitFor(() => {
      expect(hoisted.createWebSocketClient).toHaveBeenCalledTimes(1);
    });

    expect(hoisted.clients).toHaveLength(1);
    expect(hoisted.clients[0].connect).toHaveBeenCalledTimes(1);

    // The ws-token was fetched and exposed through the client's getToken.
    expect(hoisted.apiGet).toHaveBeenCalledWith('/auth/ws-token');
    const config = hoisted.clients[0].config;
    expect(config.getToken()).toBe('ws-token-123');

    // The notification callback is wired to the live sound util.
    expect(typeof config.onNotification).toBe('function');
    config.onNotification(sampleNotification, 1);
    expect(hoisted.playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it('does not instantiate a WebSocketClient while there is no user', async () => {
    hoisted.userRef.current = null;

    render(
      <NotificationProvider>
        <Child />
      </NotificationProvider>
    );

    // Give any pending microtasks a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(hoisted.createWebSocketClient).not.toHaveBeenCalled();
  });

  it('re-establishes the connection on user-state change using current callbacks (no stale closure)', async () => {
    // 1) Alice logs in -> first client created and connected.
    hoisted.userRef.current = userA;

    const { rerender } = render(
      <NotificationProvider>
        <Child />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(hoisted.createWebSocketClient).toHaveBeenCalledTimes(1);
    });
    const firstClient = hoisted.clients[0];
    expect(firstClient.connect).toHaveBeenCalledTimes(1);

    // 2) Alice logs out -> the effect cleanup tears down the first client.
    hoisted.userRef.current = null;
    rerender(
      <NotificationProvider>
        <Child />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(firstClient.disconnect).toHaveBeenCalled();
    });

    // 3) Bob logs in -> a brand-new client is created and connected.
    hoisted.userRef.current = userB;
    rerender(
      <NotificationProvider>
        <Child />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(hoisted.createWebSocketClient).toHaveBeenCalledTimes(2);
    });

    const secondClient = hoisted.clients[1];
    expect(secondClient).not.toBe(firstClient);
    expect(secondClient.connect).toHaveBeenCalledTimes(1);

    // The re-established connection uses current (live) callbacks: the new
    // client's wired onNotification still functions, proving the effect
    // re-ran with up-to-date references rather than a stale closure.
    expect(typeof secondClient.config.onNotification).toBe('function');
    hoisted.playNotificationSound.mockClear();
    secondClient.config.onNotification(sampleNotification, 1);
    expect(hoisted.playNotificationSound).toHaveBeenCalledTimes(1);

    // The connection was genuinely re-established (old torn down, new connected).
    expect(firstClient.disconnect).toHaveBeenCalled();
  });
});
