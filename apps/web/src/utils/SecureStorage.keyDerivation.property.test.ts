// @vitest-environment jsdom
/**
 * Property-based test for user-agent-independent secure-storage key derivation.
 *
 * Feature: code-review-remediation, Property 3: Secure storage key derivation
 * is independent of the user agent.
 *
 * For any two `navigator.userAgent` values, the storage encryption/HMAC key base
 * derived by Secure_Storage_Module is identical; consequently, a value written
 * under one user agent is read back unchanged after the user agent changes.
 *
 * **Validates: Requirements 3.4, 3.5**
 *
 * Strategy: install a real in-memory `localStorage` (the global test setup stubs
 * it with no-ops), then for randomly generated (userAgentA, userAgentB, key,
 * value) tuples: write the value through a SecureStorage instance created while
 * `navigator.userAgent` is userAgentA, switch `navigator.userAgent` to
 * userAgentB, create a fresh SecureStorage instance, and assert the value reads
 * back unchanged. A fresh instance re-derives its keys from scratch, so a
 * successful decrypt + HMAC-verify under the new user agent proves the key base
 * does not depend on `navigator.userAgent`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { SecureStorage } from './SecureStorage';

/** Install a working in-memory localStorage that replaces the global no-op stub. */
function installInMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(global, 'localStorage', { value: mock, configurable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: mock, configurable: true });
  }
  return store;
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

describe('Feature: code-review-remediation, Property 3: key derivation independent of user agent', () => {
  let originalUserAgent: string;

  beforeEach(() => {
    originalUserAgent = navigator.userAgent;
    installInMemoryLocalStorage();
  });

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  it('reads a value back unchanged after the user agent changes (Requirements 3.4, 3.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 200 }), // userAgent A (write time)
        fc.string({ minLength: 0, maxLength: 200 }), // userAgent B (read time)
        fc.string({ minLength: 1, maxLength: 30 }), // storage key
        // JSON-serializable values; compared after canonical JSON normalization.
        fc.jsonValue(),
        async (uaA, uaB, key, value) => {
          installInMemoryLocalStorage();
          const expected = JSON.parse(JSON.stringify(value));

          // Write under user agent A.
          setUserAgent(uaA);
          const writer = new SecureStorage('uaTest');
          await writer.set(key, value);

          // Browser "updates": the user agent changes. A brand-new instance must
          // still derive the same key base and read the value back.
          setUserAgent(uaB);
          const reader = new SecureStorage('uaTest');
          const readBack = await reader.get(key);

          expect(readBack).toStrictEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  it('reads back unchanged for realistic browser-update user-agent pairs', async () => {
    // A concrete example illustrating the browser-update scenario (Req 3.5).
    installInMemoryLocalStorage();
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    const writer = new SecureStorage('uaTest');
    await writer.set('session', { token: 'abc123', userId: 42 });

    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    const reader = new SecureStorage('uaTest');
    const readBack = await reader.get('session');

    expect(readBack).toStrictEqual({ token: 'abc123', userId: 42 });
  });
});
