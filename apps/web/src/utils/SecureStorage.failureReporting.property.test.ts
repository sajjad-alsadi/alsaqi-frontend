// @vitest-environment jsdom
/**
 * Property-based test for SecureStorage failure reporting.
 *
 * Feature: code-review-remediation, Property 4: Decryption/HMAC failure is
 * reported without clearing the session.
 *
 * **Validates: Requirements 3.3**
 *
 * For any stored ciphertext that fails HMAC verification or decryption,
 * `SecureStorage.get` reports the failure to the caller by returning `null`
 * AND never invokes `clearSession()`. A failed integrity/decrypt check must
 * not log the user out or wipe their data.
 *
 * Strategy: drive the REAL `SecureStorage` instance. The global test setup
 * mocks `localStorage` with non-functional stubs, so we back those mocks with
 * an in-memory store. We then write corrupted entries directly to localStorage
 * (random ciphertext + a non-matching but valid-base64 hash to force an HMAC
 * mismatch, or random ciphertext with no hash to force a decryption failure)
 * and assert `get` returns null while a spy on the instance's `clearSession`
 * records zero calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { SecureStorage } from './SecureStorage';

// Prevent real network calls from the best-effort security alert.
global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

/** Encode a byte array as a guaranteed-valid base64 string. */
function toBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Arbitrary that yields a non-empty, valid base64 string (1–40 bytes). */
const base64Arb = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 40 })
  .map(toBase64);

/** Arbitrary key name restricted to safe identifier characters. */
const keyArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => /^[a-zA-Z0-9_]+$/.test(s));

describe('SecureStorage - Property 4: failure is reported without clearing the session', () => {
  const PREFIX = 'failTest';
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    // Back the global localStorage mock with a real in-memory store so the
    // real SecureStorage.get can read what we deliberately corrupt.
    vi.mocked(localStorage.getItem).mockImplementation((k: string) => store[k] ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((k: string, v: string) => {
      store[k] = String(v);
    });
    vi.mocked(localStorage.removeItem).mockImplementation((k: string) => {
      delete store[k];
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 3.3**
   * HMAC mismatch: a stored hash that does not match the stored ciphertext.
   */
  it('returns null and never calls clearSession on HMAC verification failure', async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, base64Arb, base64Arb, async (key, ciphertext, bogusHash) => {
        const storage = new SecureStorage(PREFIX);
        const clearSpy = vi.spyOn(storage, 'clearSession');

        const fullKey = `${PREFIX}_${key}`;
        // Store ciphertext alongside a valid-base64 but non-matching hash so the
        // HMAC verification path runs and fails.
        store[fullKey] = ciphertext;
        store[`${fullKey}_hash`] = bogusHash;

        const result = await storage.get(key);

        expect(result).toBeNull();
        expect(clearSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.3**
   * Decryption failure: ciphertext with no stored hash that cannot be decrypted.
   */
  it('returns null and never calls clearSession on decryption failure', async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, base64Arb, async (key, ciphertext) => {
        const storage = new SecureStorage(PREFIX);
        const clearSpy = vi.spyOn(storage, 'clearSession');

        const fullKey = `${PREFIX}_${key}`;
        // No hash entry: get() skips HMAC verification and proceeds to decrypt,
        // which fails for arbitrary non-ciphertext input.
        store[fullKey] = ciphertext;

        const result = await storage.get(key);

        expect(result).toBeNull();
        expect(clearSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
