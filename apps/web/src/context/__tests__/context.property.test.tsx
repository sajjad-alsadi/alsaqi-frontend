// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider } from '../UserContext';
import { AuthProvider, useAuth } from '../AuthContext';
import { PreferencesProvider, usePreferences } from '../PreferencesContext';
import { AppProvider } from '../AppContext';
import { Language } from '../../constants';

/**
 * Property 12: Context cross-domain render isolation
 *
 * **Validates: Requirements 9.4, 9.5**
 *
 * For any preference state change (language, theme, layout), components consuming
 * only authentication state must not re-render; and for any authentication state
 * change, components consuming only preference state must not re-render.
 */

// Mock the API module to prevent real HTTP calls
vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn().mockRejectedValue(new Error('mock')),
    put: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock the i18n module used by AppContext
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

// --- Test components with render counters ---

/**
 * Component that consumes ONLY auth state and tracks render count.
 */
function AuthOnlyConsumer({ renderCountRef }: { renderCountRef: React.MutableRefObject<number> }) {
  const { token, isCheckingSession } = useAuth();
  renderCountRef.current += 1;
  return <div data-testid="auth-consumer">{token ?? 'no-token'}-{String(isCheckingSession)}</div>;
}

/**
 * Component that consumes ONLY preferences state and tracks render count.
 */
function PreferencesOnlyConsumer({ renderCountRef }: { renderCountRef: React.MutableRefObject<number> }) {
  const { language, theme, dashboardLayout } = usePreferences();
  renderCountRef.current += 1;
  return <div data-testid="prefs-consumer">{language}-{theme}-{dashboardLayout}</div>;
}

/**
 * Module-level variables to capture setters from controller components.
 */
let prefSetters: {
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setDashboardLayout: (layout: 'standard' | 'compact' | 'detailed') => void;
} | null = null;

let authSetters: {
  setToken: (token: string | null) => void;
} | null = null;

function PreferencesController() {
  const { setLanguage, setTheme, setDashboardLayout } = usePreferences();
  prefSetters = { setLanguage, setTheme, setDashboardLayout };
  return null;
}

function AuthController() {
  const { setToken } = useAuth();
  authSetters = { setToken };
  return null;
}

/**
 * Full provider tree matching the app's nesting order:
 * QueryClientProvider > UserProvider > AuthProvider > PreferencesProvider > AppProvider
 *
 * AuthProvider calls `useQueryClient()` (to clear the cache on logout), so a
 * QueryClientProvider must enclose the tree.
 */
function TestProviderTree({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AuthProvider>
          <PreferencesProvider>
            <AppProvider>
              {children}
            </AppProvider>
          </PreferencesProvider>
        </AuthProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}

describe('Property 12: Context cross-domain render isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prefSetters = null;
    authSetters = null;
  });

  it('preference state changes do NOT re-render auth-only consumers (100+ iterations)', async () => {
    /**
     * **Validates: Requirements 9.4**
     *
     * Strategy: Generate preference state changes (language, theme, layout) and verify
     * that components consuming only authentication state do not re-render.
     */
    const preferenceChangeArb = fc.oneof(
      fc.record({
        type: fc.constant('language' as const),
        value: fc.constantFrom(Language.EN, Language.AR),
      }),
      fc.record({
        type: fc.constant('theme' as const),
        value: fc.constantFrom('light' as const, 'dark' as const),
      }),
      fc.record({
        type: fc.constant('layout' as const),
        value: fc.constantFrom('standard' as const, 'compact' as const, 'detailed' as const),
      })
    );

    // Generate sequences of preference changes
    const preferenceChangesArb = fc.array(preferenceChangeArb, { minLength: 1, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(preferenceChangesArb, async (changes) => {
        const authRenderCount = { current: 0 };

        const { unmount } = render(
          <TestProviderTree>
            <AuthOnlyConsumer renderCountRef={authRenderCount} />
            <PreferencesController />
          </TestProviderTree>
        );

        // Wait for initial effects (AuthProvider session check) to settle
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });

        // Record the auth render count after initial stabilization
        const authRendersAfterInit = authRenderCount.current;

        // Apply each preference change sequentially
        for (const change of changes) {
          await act(async () => {
            if (change.type === 'language') {
              prefSetters!.setLanguage(change.value as Language);
            } else if (change.type === 'theme') {
              prefSetters!.setTheme(change.value as 'light' | 'dark');
            } else {
              prefSetters!.setDashboardLayout(change.value as 'standard' | 'compact' | 'detailed');
            }
          });
        }

        // Auth-only consumer should NOT have re-rendered due to preference changes
        const authRendersAfterChanges = authRenderCount.current;
        expect(authRendersAfterChanges).toBe(authRendersAfterInit);

        unmount();
      }),
      { numRuns: 100 }
    );
  }, 60000);

  it('auth state changes do NOT re-render preferences-only consumers (100+ iterations)', async () => {
    /**
     * **Validates: Requirements 9.5**
     *
     * Strategy: Generate authentication state changes (token changes) and verify
     * that components consuming only preference state do not re-render.
     */
    const authChangeArb = fc.oneof(
      fc.constant(null as string | null),
      fc.constant('authenticated' as string | null),
      fc.string({ minLength: 10, maxLength: 30 }).map((s): string | null => `token-${s}`)
    );

    const authChangesArb = fc.array(authChangeArb, { minLength: 1, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(authChangesArb, async (tokenValues) => {
        const prefsRenderCount = { current: 0 };

        const { unmount } = render(
          <TestProviderTree>
            <PreferencesOnlyConsumer renderCountRef={prefsRenderCount} />
            <AuthController />
          </TestProviderTree>
        );

        // Wait for initial effects to settle
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });

        // Record the preferences render count after initial stabilization
        const prefsRendersAfterInit = prefsRenderCount.current;

        // Apply each auth state change sequentially
        for (const tokenValue of tokenValues) {
          await act(async () => {
            authSetters!.setToken(tokenValue);
          });
        }

        // Preferences-only consumer should NOT have re-rendered due to auth changes
        const prefsRendersAfterChanges = prefsRenderCount.current;
        expect(prefsRendersAfterChanges).toBe(prefsRendersAfterInit);

        unmount();
      }),
      { numRuns: 100 }
    );
  }, 60000);
});
