// @vitest-environment jsdom
//
// Feature: frontend-audit-remediation, Property 11: Logout clears all
// application-prefixed storage
//
// Property 11: Logout clears all application-prefixed storage
//   - For any initial contents of localStorage and sessionStorage, after
//     clearAppStorage no remaining key in either store begins with any
//     application prefix (`user_permissions_`, `filters_`, `draft_`, `scroll_`,
//     `audit_`, `alsaqi_`).
//   **Validates: Requirements 10.2, 10.3, 10.4, 10.5**
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { clearAppStorage, APP_PREFIXES } from '../../utils/clearAppStorage';

/** True when `key` begins with any application-owned prefix. */
function isAppPrefixedKey(key: string): boolean {
  return APP_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Generates a storage key that DEFINITELY starts with an application prefix by
 * concatenating one of the known prefixes with an arbitrary suffix. These keys
 * must always be removed by clearAppStorage.
 */
const appPrefixedKeyArb = fc
  .tuple(fc.constantFrom(...APP_PREFIXES), fc.string())
  .map(([prefix, suffix]) => `${prefix}${suffix}`);

/**
 * Generates an arbitrary key that may or may not be application-prefixed. Some
 * random strings could coincidentally start with a prefix, so membership is
 * always decided via isAppPrefixedKey rather than assumed.
 */
const anyKeyArb = fc.oneof(appPrefixedKeyArb, fc.string({ minLength: 1 }));

/** A single (key, value) entry to seed into a store. */
const entryArb = fc.tuple(anyKeyArb, fc.string());

/** A list of entries representing arbitrary initial store contents. */
const entriesArb = fc.array(entryArb, { maxLength: 30 });

function seed(storage: Storage, entries: readonly [string, string][]): void {
  for (const [key, value] of entries) {
    storage.setItem(key, value);
  }
}

function remainingKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

describe('Property 11: logout clears all application-prefixed storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('leaves no application-prefixed key in localStorage or sessionStorage after clearAppStorage', () => {
    fc.assert(
      fc.property(entriesArb, entriesArb, (localEntries, sessionEntries) => {
        localStorage.clear();
        sessionStorage.clear();

        seed(localStorage, localEntries);
        seed(sessionStorage, sessionEntries);

        clearAppStorage();

        for (const key of remainingKeys(localStorage)) {
          expect(isAppPrefixedKey(key)).toBe(false);
        }
        for (const key of remainingKeys(sessionStorage)) {
          expect(isAppPrefixedKey(key)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('preserves non-application-prefixed keys (only app-prefixed entries are removed)', () => {
    fc.assert(
      fc.property(entriesArb, entriesArb, (localEntries, sessionEntries) => {
        localStorage.clear();
        sessionStorage.clear();

        seed(localStorage, localEntries);
        seed(sessionStorage, sessionEntries);

        // Capture the keys that should survive: any non-app-prefixed key.
        const expectedLocalSurvivors = remainingKeys(localStorage).filter(
          (k) => !isAppPrefixedKey(k)
        );
        const expectedSessionSurvivors = remainingKeys(sessionStorage).filter(
          (k) => !isAppPrefixedKey(k)
        );

        clearAppStorage();

        const remainingLocal = new Set(remainingKeys(localStorage));
        const remainingSession = new Set(remainingKeys(sessionStorage));

        for (const key of expectedLocalSurvivors) {
          expect(remainingLocal.has(key)).toBe(true);
        }
        for (const key of expectedSessionSurvivors) {
          expect(remainingSession.has(key)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
