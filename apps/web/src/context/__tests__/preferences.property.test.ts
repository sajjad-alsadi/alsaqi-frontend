// @vitest-environment jsdom
//
// Feature: frontend-audit-remediation, Property 17: Preferences preserve
// notifications_enabled
//
// Property 17: Preferences preserve notifications_enabled
//   - For any stored `notifications_enabled` value and any sequence of
//     theme/language/layout changes, every `/preferences` PUT payload carries
//     the stored `notifications_enabled` value rather than a hardcoded one.
//   **Validates: Requirements 19.1, 19.2, 19.3**
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { PreferencesProvider, usePreferences } from '../PreferencesContext';
import { Language } from '../../constants';

// Mock the raw HTTP client (default export) so PUT payloads can be captured.
vi.mock('../../api/httpClient', () => ({
  default: {
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock logger to keep test output clean.
vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Provide a self-contained react-i18next stub so `i18n.changeLanguage` is a
// no-op function during language changes.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// Typed access to the mocked PUT for inspecting captured payloads.
async function getPutMock() {
  const api = (await import('../../api/httpClient')).default as unknown as {
    put: ReturnType<typeof vi.fn>;
  };
  return api.put;
}

/**
 * The raw `audit_notifications` localStorage value the provider reads at mount.
 * Includes the canonical 'true'/'false', the unset case (null), and arbitrary
 * strings to exercise the provider's coercion across the full input space.
 */
const storedNotificationsArb = fc.oneof(
  fc.constantFrom<string | null>('true', 'false', null),
  fc.string()
);

/**
 * Mirrors the provider's seeding logic: an unset value (null) defaults to
 * `true`; otherwise only the exact string 'true' is truthy.
 */
function expectedNotificationsEnabled(raw: string | null): boolean {
  return raw === null ? true : raw === 'true';
}

/** A single preference change that does NOT concern notification settings. */
type PrefAction =
  | { kind: 'theme'; value: 'light' | 'dark' }
  | { kind: 'language'; value: Language }
  | { kind: 'layout'; value: 'standard' | 'compact' | 'detailed' };

const actionArb: fc.Arbitrary<PrefAction> = fc.oneof(
  fc
    .constantFrom<'light' | 'dark'>('light', 'dark')
    .map((value) => ({ kind: 'theme', value } as PrefAction)),
  fc
    .constantFrom<Language>(Language.AR, Language.EN)
    .map((value) => ({ kind: 'language', value } as PrefAction)),
  fc
    .constantFrom<'standard' | 'compact' | 'detailed'>('standard', 'compact', 'detailed')
    .map((value) => ({ kind: 'layout', value } as PrefAction))
);

/** A non-empty sequence of theme/language/layout changes. */
const actionsArb = fc.array(actionArb, { minLength: 1, maxLength: 8 });

// The raw `audit_notifications` value the installed localStorage mock returns.
// Mutated per property run via `seedLocalStorage`; all other keys read as null
// so the provider's initial theme/language/layout stay at their defaults.
let storedNotifications: string | null = null;

/**
 * Sets the `audit_notifications` value the provider will read at mount.
 */
function seedLocalStorage(raw: string | null): void {
  storedNotifications = raw;
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(PreferencesProvider, null, children);

describe('Property 17: Preferences preserve notifications_enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedNotifications = null;
    // Install a self-contained localStorage mock so seeding is deterministic
    // regardless of the shared test-setup stub's state.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) =>
          key === 'audit_notifications' ? storedNotifications : null
        ),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      },
    });
  });

  it('sends the stored notifications_enabled value on every theme/language/layout PUT', async () => {
    const put = await getPutMock();

    await fc.assert(
      fc.asyncProperty(storedNotificationsArb, actionsArb, async (rawNotif, actions) => {
        put.mockClear();
        seedLocalStorage(rawNotif);

        const expected = expectedNotificationsEnabled(rawNotif);

        const { result, unmount } = renderHook(() => usePreferences(), { wrapper });

        try {
          for (const action of actions) {
            // eslint-disable-next-line no-await-in-loop
            await act(async () => {
              switch (action.kind) {
                case 'theme':
                  await result.current.setTheme(action.value);
                  break;
                case 'language':
                  await result.current.setLanguage(action.value);
                  break;
                case 'layout':
                  await result.current.setDashboardLayout(action.value);
                  break;
              }
            });
          }

          // Every captured PUT must carry the stored notifications_enabled
          // value — never a hardcoded one.
          expect(put.mock.calls.length).toBe(actions.length);
          for (const call of put.mock.calls) {
            expect(call[0]).toBe('/preferences');
            const payload = call[1] as { notifications_enabled?: unknown };
            expect(payload.notifications_enabled).toBe(expected);
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 }
    );
  });
});
