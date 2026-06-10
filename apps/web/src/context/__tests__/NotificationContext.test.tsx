// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { createNotification } from '../../test/factories';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock the API module
const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('../../api/httpClient', () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Mock logger to suppress console output
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Track WebSocket instances for testing
let wsInstances: MockWebSocketInstance[] = [];

interface MockWebSocketInstance {
  url: string;
  readyState: number;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

class TestMockWebSocket implements MockWebSocketInstance {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    this.readyState = TestMockWebSocket.CONNECTING;
    wsInstances.push(this);
  }
}

// Override global WebSocket with our trackable version
Object.defineProperty(global, 'WebSocket', { value: TestMockWebSocket, writable: true });

// Mock UserContext
const mockUserState = { user: null as any };
vi.mock('../UserContext', () => ({
  useUser: () => mockUserState,
  UserProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock AuthContext
const mockAuthState = { isCheckingSession: false, token: 'test-token', setToken: vi.fn(), logout: vi.fn() };
vi.mock('../AuthContext', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Import after mocks are set up
import { NotificationProvider, useNotificationContext } from '../NotificationContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <NotificationProvider>{children}</NotificationProvider>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationContext', () => {
  beforeEach(() => {
    wsInstances = [];
    mockUserState.user = null;
    mockAuthState.isCheckingSession = false;
    mockGet.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();

    // Default API responses
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/notifications?')) {
        return Promise.resolve({ data: [] });
      }
      if (url === '/notifications/unread-count') {
        return Promise.resolve({ data: { count: 0 } });
      }
      if (url === '/auth/ws-token') {
        return Promise.resolve({ data: { token: 'test-ws-token' } });
      }
      return Promise.resolve({ data: null });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('تهيئة: إنشاء اتصال WebSocket', () => {
    it('should create a WebSocket connection when user is logged in', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      // Wait for effects to settle
      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      const ws = wsInstances[0];
      expect(ws.url).toContain('ws');
    });

    it('should NOT create a WebSocket connection when user is null', async () => {
      mockUserState.user = null;

      renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      // Give time for any potential effects
      await act(async () => {});

      expect(wsInstances.length).toBe(0);
    });

    it('should NOT create a WebSocket connection while session is being checked', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };
      mockAuthState.isCheckingSession = true;

      renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await act(async () => {});

      expect(wsInstances.length).toBe(0);
    });

    it('should pass token as query parameter in WebSocket URL', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      // Mock the ws-token endpoint
      mockGet.mockImplementation((url: string) => {
        if (url === '/auth/ws-token') {
          return Promise.resolve({ data: { token: 'my-ws-jwt-token' } });
        }
        if (url.startsWith('/notifications?')) {
          return Promise.resolve({ data: [] });
        }
        if (url === '/notifications/unread-count') {
          return Promise.resolve({ data: { count: 0 } });
        }
        return Promise.resolve({ data: null });
      });

      renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      // WebSocket URL should contain the token as a query parameter
      const ws = wsInstances[0];
      expect(ws.url).toContain('?token=my-ws-jwt-token');
      // Should NOT send auth message after connection
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should fetch notifications and unread count on initialization', async () => {
      const notifications = [
        createNotification({ id: '1', title: 'Notification 1' }),
        createNotification({ id: '2', title: 'Notification 2' }),
      ];

      mockGet.mockImplementation((url: string) => {
        if (url.startsWith('/notifications?')) {
          return Promise.resolve({ data: notifications });
        }
        if (url === '/notifications/unread-count') {
          return Promise.resolve({ data: { count: 5 } });
        }
        return Promise.resolve({ data: null });
      });

      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.notifications.length).toBe(2);
      });

      expect(result.current.unreadCount).toBe(5);
    });

    it('should attempt reconnection after WebSocket closes', async () => {
      vi.useFakeTimers();
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const ws = wsInstances[0];
      expect(ws).toBeDefined();

      // Simulate WebSocket close
      await act(async () => {
        ws.onclose?.({});
      });

      // Advance timer by 5 seconds (reconnect delay)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // A new WebSocket instance should be created for reconnection
      expect(wsInstances.length).toBeGreaterThan(1);
      vi.useRealTimers();
    });
  });

  describe('استلام إشعار: تحديث العداد وعرض toast', () => {
    it('should update notifications list and unread count when receiving NEW_NOTIFICATION', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      const ws = wsInstances[0];

      const newNotification = {
        id: 'new-1',
        event_type: 'record_created',
        title: 'إشعار جديد',
        description: 'تم إنشاء سجل جديد',
        related_module: 'audit',
        date: new Date().toISOString(),
      };

      // Simulate receiving a notification via WebSocket
      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({
            type: 'NEW_NOTIFICATION',
            notification: newNotification,
          }),
        });
      });

      // Notification should be prepended to the list
      expect(result.current.notifications[0]).toMatchObject({
        id: 'new-1',
        is_read: false,
        status: 'Unread',
      });

      // Unread count should increment
      expect(result.current.unreadCount).toBe(1);
    });

    it('should set latestNotification for toast display', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      const ws = wsInstances[0];

      const newNotification = {
        id: 'toast-1',
        event_type: 'status_changed',
        title: 'تغيير حالة',
        description: 'تم تغيير حالة المهمة',
        related_module: 'audit',
        date: new Date().toISOString(),
      };

      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({
            type: 'NEW_NOTIFICATION',
            notification: newNotification,
          }),
        });
      });

      // latestNotification should be set (used for toast)
      expect(result.current.latestNotification).toMatchObject({
        id: 'toast-1',
      });
    });

    it('should trigger bell shake on new notification', async () => {
      vi.useFakeTimers();
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const ws = wsInstances[0];

      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({
            type: 'NEW_NOTIFICATION',
            notification: {
              id: 'shake-1',
              event_type: 'record_created',
              title: 'Test',
              description: 'Test notification',
              related_module: 'audit',
              date: new Date().toISOString(),
            },
          }),
        });
      });

      expect(result.current.bellShake).toBe(true);

      // Bell shake should stop after 1 second
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(result.current.bellShake).toBe(false);
      vi.useRealTimers();
    });

    it('should clear latestNotification when clearLatest is called', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      const ws = wsInstances[0];

      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({
            type: 'NEW_NOTIFICATION',
            notification: {
              id: 'clear-1',
              event_type: 'record_created',
              title: 'Test',
              description: 'Test',
              related_module: 'audit',
              date: new Date().toISOString(),
            },
          }),
        });
      });

      expect(result.current.latestNotification).not.toBeNull();

      await act(async () => {
        result.current.clearLatest();
      });

      expect(result.current.latestNotification).toBeNull();
    });

    it('should ignore non-JSON WebSocket messages', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      const ws = wsInstances[0];
      const initialCount = result.current.unreadCount;

      // Send non-JSON message - should not throw or change state
      await act(async () => {
        ws.onmessage?.({ data: 'not-json-data' });
      });

      expect(result.current.unreadCount).toBe(initialCount);
    });

    it('should ignore WebSocket messages with unknown type', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      const ws = wsInstances[0];
      const initialCount = result.current.unreadCount;

      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({ type: 'UNKNOWN_TYPE', data: {} }),
        });
      });

      expect(result.current.unreadCount).toBe(initialCount);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read and decrement unread count', async () => {
      const notifications = [
        createNotification({ id: 'n1', is_read: false, status: 'Unread' }),
      ];

      mockGet.mockImplementation((url: string) => {
        if (url.startsWith('/notifications?')) {
          return Promise.resolve({ data: notifications });
        }
        if (url === '/notifications/unread-count') {
          return Promise.resolve({ data: { count: 1 } });
        }
        return Promise.resolve({ data: null });
      });
      mockPut.mockResolvedValue({ data: { success: true } });

      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.notifications.length).toBe(1);
      });

      await act(async () => {
        await result.current.markAsRead('n1');
      });

      expect(mockPut).toHaveBeenCalledWith('/notifications/n1/read');
      expect(result.current.notifications[0].is_read).toBe(true);
      expect(result.current.notifications[0].status).toBe('Read');
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read and reset unread count to 0', async () => {
      const notifications = [
        createNotification({ id: 'n1', is_read: false, status: 'Unread' }),
        createNotification({ id: 'n2', is_read: false, status: 'Unread' }),
      ];

      mockGet.mockImplementation((url: string) => {
        if (url.startsWith('/notifications?')) {
          return Promise.resolve({ data: notifications });
        }
        if (url === '/notifications/unread-count') {
          return Promise.resolve({ data: { count: 2 } });
        }
        return Promise.resolve({ data: null });
      });
      mockPut.mockResolvedValue({ data: { success: true } });

      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.notifications.length).toBe(2);
      });

      await act(async () => {
        await result.current.markAllAsRead();
      });

      expect(mockPut).toHaveBeenCalledWith('/notifications/mark-all-read');
      expect(result.current.notifications.every(n => n.is_read === true)).toBe(true);
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should remove notification from list', async () => {
      const notifications = [
        createNotification({ id: 'n1', is_read: true, status: 'Read' }),
        createNotification({ id: 'n2', is_read: false, status: 'Unread' }),
      ];

      mockGet.mockImplementation((url: string) => {
        if (url.startsWith('/notifications?')) {
          return Promise.resolve({ data: notifications });
        }
        if (url === '/notifications/unread-count') {
          return Promise.resolve({ data: { count: 1 } });
        }
        return Promise.resolve({ data: null });
      });
      mockDelete.mockResolvedValue({ data: { success: true } });

      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result } = renderHook(() => useNotificationContext(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.notifications.length).toBe(2);
      });

      await act(async () => {
        await result.current.deleteNotification('n2');
      });

      expect(mockDelete).toHaveBeenCalledWith('/notifications/n2');
      expect(result.current.notifications.length).toBe(1);
      expect(result.current.notifications[0].id).toBe('n1');
      // Unread count should decrement since deleted notification was unread
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('cleanup on unmount', () => {
    it('should close WebSocket and clear state when user logs out', async () => {
      mockUserState.user = { id: '1', name: 'Test User', role: 'Admin' };

      const { result, rerender } = renderHook(() => useNotificationContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(wsInstances.length).toBeGreaterThanOrEqual(1);
      });

      const ws = wsInstances[0];

      // Simulate user logout
      await act(async () => {
        mockUserState.user = null;
        rerender();
      });

      expect(ws.close).toHaveBeenCalled();
      expect(result.current.notifications).toEqual([]);
      expect(result.current.unreadCount).toBe(0);
    });
  });
});
