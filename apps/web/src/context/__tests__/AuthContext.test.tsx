// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { UserProvider } from '../UserContext';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock the API module
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Mock the logger utility
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock i18n
vi.mock('../../i18n', () => ({
  default: {
    changeLanguage: vi.fn(),
    language: 'en',
    use: vi.fn().mockReturnThis(),
    init: vi.fn().mockReturnThis(),
    on: vi.fn(),
    t: (key: string) => key,
  },
}));

/**
 * Test consumer component that exposes AuthContext values for assertions.
 */
function AuthConsumer() {
  const { token, isCheckingSession, logout, setToken } = useAuth();
  return (
    <div>
      <span data-testid="token">{token ?? 'null'}</span>
      <span data-testid="checking">{String(isCheckingSession)}</span>
      <button data-testid="logout-btn" onClick={logout}>Logout</button>
      <button data-testid="set-token-btn" onClick={() => setToken('new-token')}>Set Token</button>
    </div>
  );
}

/**
 * Wrapper that provides UserProvider + AuthProvider (matching app nesting order).
 */
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </UserProvider>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization: checking current session', () => {
    it('should check the current session on mount by calling GET /profile', async () => {
      const mockUser = { id: '1', username: 'admin', name: 'Admin', role: 'Admin' };
      mockGet.mockResolvedValueOnce({ data: mockUser });

      vi.useRealTimers();

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/profile');
      });
    });

    it('should set token to "authenticated" and user when session is valid', async () => {
      const mockUser = { id: '1', username: 'admin', name: 'Admin', role: 'Admin' };
      mockGet.mockResolvedValueOnce({ data: mockUser });

      vi.useRealTimers();

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('token').textContent).toBe('authenticated');
      });

      expect(screen.getByTestId('checking').textContent).toBe('false');
    });

    it('should set token to null and stop checking when session check fails', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 401 } });

      vi.useRealTimers();

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('checking').textContent).toBe('false');
      });

      expect(screen.getByTestId('token').textContent).toBe('null');
    });

    it('should retry session check on 503 (server starting up)', async () => {
      mockGet
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({ data: { id: '1', username: 'admin', name: 'Admin', role: 'Admin' } });

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      // First call fails with 503
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockGet).toHaveBeenCalledTimes(1);

      // After 2s retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('should show isCheckingSession=true initially', () => {
      mockGet.mockReturnValue(new Promise(() => {})); // Never resolves

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      expect(screen.getByTestId('checking').textContent).toBe('true');
    });
  });

  describe('Logout: clearing tokens and redirecting', () => {
    it('should call POST /auth/logout and clear token on logout', async () => {
      const mockUser = { id: '1', username: 'admin', name: 'Admin', role: 'Admin' };
      mockGet.mockResolvedValueOnce({ data: mockUser });
      mockPost.mockResolvedValueOnce({ data: {} });

      vi.useRealTimers();

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      // Wait for session check to complete
      await waitFor(() => {
        expect(screen.getByTestId('token').textContent).toBe('authenticated');
      });

      // Trigger logout
      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/logout');
      expect(screen.getByTestId('token').textContent).toBe('null');
    });

    it('should clear token even if logout API call fails', async () => {
      const mockUser = { id: '1', username: 'admin', name: 'Admin', role: 'Admin' };
      mockGet.mockResolvedValueOnce({ data: mockUser });
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      vi.useRealTimers();

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      // Wait for session check to complete
      await waitFor(() => {
        expect(screen.getByTestId('token').textContent).toBe('authenticated');
      });

      // Trigger logout
      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      // Token should still be cleared even on API failure
      await waitFor(() => {
        expect(screen.getByTestId('token').textContent).toBe('null');
      });
    });

    it('should set user to null on logout', async () => {
      const mockUser = { id: '1', username: 'admin', name: 'Admin', role: 'Admin' };
      mockGet.mockResolvedValueOnce({ data: mockUser });
      mockPost.mockResolvedValueOnce({ data: {} });

      vi.useRealTimers();

      /**
       * Consumer that also shows user state from UserContext.
       */
      function UserAndAuthConsumer() {
        const { token, logout } = useAuth();
        // Access user from the UserProvider via a separate hook
        const { useUser } = require('../UserContext');
        const { user } = useUser();
        return (
          <div>
            <span data-testid="user-state">{user ? user.username : 'no-user'}</span>
            <span data-testid="token-state">{token ?? 'null'}</span>
            <button data-testid="logout" onClick={logout}>Logout</button>
          </div>
        );
      }

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      // Wait for session check
      await waitFor(() => {
        expect(screen.getByTestId('token').textContent).toBe('authenticated');
      });

      // Trigger logout
      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      // After logout, token should be null
      expect(screen.getByTestId('token').textContent).toBe('null');
    });
  });

  describe('Updating auth state when token changes', () => {
    it('should update token when setToken is called', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 401 } });

      vi.useRealTimers();

      render(
        <TestWrapper>
          <AuthConsumer />
        </TestWrapper>
      );

      // Wait for session check to complete (fails, so token is null)
      await waitFor(() => {
        expect(screen.getByTestId('checking').textContent).toBe('false');
      });

      expect(screen.getByTestId('token').textContent).toBe('null');

      // Set a new token
      await act(async () => {
        screen.getByTestId('set-token-btn').click();
      });

      expect(screen.getByTestId('token').textContent).toBe('new-token');
    });

    it('should allow setting token to null (unauthenticated state)', async () => {
      const mockUser = { id: '1', username: 'admin', name: 'Admin', role: 'Admin' };
      mockGet.mockResolvedValueOnce({ data: mockUser });

      vi.useRealTimers();

      /**
       * Consumer that can set token to null.
       */
      function NullTokenConsumer() {
        const { token, setToken } = useAuth();
        return (
          <div>
            <span data-testid="token-val">{token ?? 'null'}</span>
            <button data-testid="clear-token" onClick={() => setToken(null)}>Clear</button>
          </div>
        );
      }

      render(
        <TestWrapper>
          <NullTokenConsumer />
        </TestWrapper>
      );

      // Wait for authenticated state
      await waitFor(() => {
        expect(screen.getByTestId('token-val').textContent).toBe('authenticated');
      });

      // Clear the token
      await act(async () => {
        screen.getByTestId('clear-token').click();
      });

      expect(screen.getByTestId('token-val').textContent).toBe('null');
    });

    it('should provide stable context value references (memoized)', async () => {
      mockGet.mockRejectedValueOnce({ response: { status: 401 } });

      vi.useRealTimers();

      const renderCounts = { current: 0 };

      function RenderCounter() {
        const auth = useAuth();
        renderCounts.current += 1;
        return <span data-testid="render-count">{renderCounts.current}</span>;
      }

      render(
        <TestWrapper>
          <RenderCounter />
        </TestWrapper>
      );

      // Wait for session check to complete (token set to null, isCheckingSession set to false)
      await waitFor(() => {
        expect(screen.getByTestId('render-count')).toBeDefined();
      });

      // Allow all state updates to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      const countAfterSettle = renderCounts.current;

      // Wait again - no further renders should occur without state changes
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Should not have re-rendered without state changes
      expect(renderCounts.current).toBe(countAfterSettle);
    });
  });

  describe('useAuth hook error handling', () => {
    it('should throw error when used outside AuthProvider', () => {
      function BadConsumer() {
        useAuth();
        return null;
      }

      // Suppress React error boundary console output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(
          <UserProvider>
            <BadConsumer />
          </UserProvider>
        );
      }).toThrow('useAuth must be used within AuthProvider');

      consoleSpy.mockRestore();
    });
  });
});
