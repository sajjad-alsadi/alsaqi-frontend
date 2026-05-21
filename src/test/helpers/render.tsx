// @vitest-environment jsdom
/**
 * Client Test Helpers
 *
 * Shared utilities for client-side testing including provider wrappers,
 * mock router, mock API, and async helpers.
 */
import React from 'react';
import { render, RenderOptions, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { UserProvider } from '../../context/UserContext';
import { AuthProvider } from '../../context/AuthContext';
import { PreferencesProvider } from '../../context/PreferencesContext';
import { AppProvider } from '../../context/AppContext';
import { NotificationProvider } from '../../context/NotificationContext';
import type { User } from '../../types';

// ─── Mock Router ─────────────────────────────────────────────────────────────

export interface MockRouterOptions {
  pathname?: string;
  search?: string;
  hash?: string;
  params?: Record<string, string>;
}

export interface MockRouter {
  navigate: ReturnType<typeof vi.fn>;
  location: { pathname: string; search: string; hash: string; state: null };
  params: Record<string, string>;
}

/**
 * Creates mock implementations for react-router-dom hooks.
 * Call this before rendering components that use useNavigate, useLocation, or useParams.
 *
 * Usage:
 * ```ts
 * const router = createMockRouter({ pathname: '/audit-plans', params: { id: '123' } });
 * // router.navigate is a vi.fn() you can assert on
 * ```
 */
export function createMockRouter(options?: MockRouterOptions): MockRouter {
  const location = {
    pathname: options?.pathname || '/',
    search: options?.search || '',
    hash: options?.hash || '',
    state: null,
  };

  const navigate = vi.fn();
  const params = options?.params || {};

  vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
      ...actual,
      useNavigate: () => navigate,
      useLocation: () => location,
      useParams: () => params,
      useSearchParams: () => [new URLSearchParams(location.search), vi.fn()],
    };
  });

  return { navigate, location, params };
}

// ─── Mock API ────────────────────────────────────────────────────────────────

export interface MockApiInstance {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  /** Set a response for GET requests matching the given URL */
  onGet: (url: string, response: any, status?: number) => void;
  /** Set a response for POST requests matching the given URL */
  onPost: (url: string, response: any, status?: number) => void;
  /** Set a response for PUT requests matching the given URL */
  onPut: (url: string, response: any, status?: number) => void;
  /** Set a response for DELETE requests matching the given URL */
  onDelete: (url: string, response: any, status?: number) => void;
  /** Queue multiple responses for sequential GET calls to the same URL */
  onGetSequence: (url: string, responses: any[]) => void;
  /** Reset all mock implementations */
  reset: () => void;
}

/**
 * Sets up API mocking for tests by mocking `src/services/api.ts`.
 * Returns a mock axios-like instance with helpers for setting up responses.
 *
 * Usage:
 * ```ts
 * const api = mockApi();
 * api.onGet('/audit-plans', { data: [...] });
 * api.onPost('/audit-plans', { data: { id: '1' } });
 * ```
 */
export function mockApi(): MockApiInstance {
  const getMock = vi.fn();
  const postMock = vi.fn();
  const putMock = vi.fn();
  const patchMock = vi.fn();
  const deleteMock = vi.fn();

  vi.mock('../../services/api', () => ({
    default: {
      get: getMock,
      post: postMock,
      put: putMock,
      patch: patchMock,
      delete: deleteMock,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  }));

  const responseQueues = new Map<string, any[]>();

  function createResponse(data: any, status = 200) {
    return { data, status, headers: {} };
  }

  function onGet(url: string, response: any, status = 200) {
    getMock.mockImplementation((requestUrl: string) => {
      if (requestUrl === url || requestUrl.startsWith(url)) {
        return Promise.resolve(createResponse(response, status));
      }
      return Promise.resolve(createResponse(null));
    });
  }

  function onPost(url: string, response: any, status = 200) {
    postMock.mockImplementation((requestUrl: string) => {
      if (requestUrl === url || requestUrl.startsWith(url)) {
        return Promise.resolve(createResponse(response, status));
      }
      return Promise.resolve(createResponse(null));
    });
  }

  function onPut(url: string, response: any, status = 200) {
    putMock.mockImplementation((requestUrl: string) => {
      if (requestUrl === url || requestUrl.startsWith(url)) {
        return Promise.resolve(createResponse(response, status));
      }
      return Promise.resolve(createResponse(null));
    });
  }

  function onDelete(url: string, response: any, status = 200) {
    deleteMock.mockImplementation((requestUrl: string) => {
      if (requestUrl === url || requestUrl.startsWith(url)) {
        return Promise.resolve(createResponse(response, status));
      }
      return Promise.resolve(createResponse(null));
    });
  }

  function onGetSequence(url: string, responses: any[]) {
    responseQueues.set(url, [...responses]);
    getMock.mockImplementation((requestUrl: string) => {
      if (requestUrl === url || requestUrl.startsWith(url)) {
        const queue = responseQueues.get(url);
        if (queue && queue.length > 0) {
          const next = queue.shift()!;
          return Promise.resolve(createResponse(next));
        }
        return Promise.resolve(createResponse(null));
      }
      return Promise.resolve(createResponse(null));
    });
  }

  function reset() {
    getMock.mockReset();
    postMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    responseQueues.clear();
  }

  return {
    get: getMock,
    post: postMock,
    put: putMock,
    patch: patchMock,
    delete: deleteMock,
    onGet,
    onPost,
    onPut,
    onDelete,
    onGetSequence,
    reset,
  };
}

// ─── Query Client ────────────────────────────────────────────────────────────

/**
 * Creates a TanStack Query client configured for testing:
 * - No retries (fail immediately)
 * - No cache (staleTime: 0)
 * - No garbage collection delay
 */
export function createMockQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// ─── Render With Providers ───────────────────────────────────────────────────

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial user state for UserProvider */
  user?: User | null;
  /** Initial language preference */
  language?: 'ar' | 'en';
  /** Initial theme preference */
  theme?: 'light' | 'dark';
  /** Custom QueryClient (defaults to test-configured client) */
  queryClient?: QueryClient;
}

/**
 * Renders a React component wrapped with all application context providers.
 * Provider nesting order matches the actual App:
 * QueryClientProvider > UserProvider > AuthProvider > PreferencesProvider > AppProvider > NotificationProvider
 *
 * Usage:
 * ```tsx
 * const { getByText } = renderWithProviders(<MyComponent />, {
 *   user: createUser({ role: 'Admin' }),
 *   language: 'ar',
 *   theme: 'dark',
 * });
 * ```
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderWithProvidersOptions
) {
  const {
    user = null,
    language = 'en',
    theme = 'light',
    queryClient = createMockQueryClient(),
    ...renderOptions
  } = options || {};

  // Set localStorage values before rendering so providers pick them up
  if (typeof localStorage !== 'undefined') {
    localStorage.getItem = vi.fn((key: string) => {
      if (key === 'audit_lang') return language;
      if (key === 'i18nextLng') return language;
      if (key === 'audit_theme') return theme;
      if (key === 'audit_layout') return 'standard';
      return null;
    });
  }

  function AllProviders({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <AuthProvider>
            <PreferencesProvider>
              <AppProvider>
                <NotificationProvider>
                  {children}
                </NotificationProvider>
              </AppProvider>
            </PreferencesProvider>
          </AuthProvider>
        </UserProvider>
      </QueryClientProvider>
    );
  }

  const result = render(ui, { wrapper: AllProviders, ...renderOptions });

  return {
    ...result,
    queryClient,
  };
}

// ─── Async Helpers ───────────────────────────────────────────────────────────

/**
 * Waits for loading states to complete by checking that no loading indicators
 * are present in the DOM. Useful for async components that show spinners or
 * skeleton screens while fetching data.
 *
 * Checks for common loading patterns:
 * - Elements with role="progressbar"
 * - Elements with aria-busy="true"
 * - Elements with data-testid="loading"
 * - Elements with common loading class names
 */
export async function waitForLoadingToFinish(): Promise<void> {
  await waitFor(
    () => {
      const progressBars = screen.queryAllByRole('progressbar');
      const busyElements = document.querySelectorAll('[aria-busy="true"]');
      const loadingTestIds = document.querySelectorAll('[data-testid="loading"]');
      const loadingSpinners = document.querySelectorAll('.animate-spin, .loading, .skeleton');

      if (
        progressBars.length > 0 ||
        busyElements.length > 0 ||
        loadingTestIds.length > 0 ||
        loadingSpinners.length > 0
      ) {
        throw new Error('Still loading');
      }
    },
    { timeout: 5000, interval: 50 }
  );
}
