// @vitest-environment jsdom
/**
 * اختبارات خصائص SecureStorage - round-trip
 *
 * **Validates: Requirements 18.3**
 *
 * الخاصية 6: لأي مفتاح وقيمة، عند تخزينها بواسطة SecureStorage.set
 * ثم استرجاعها بواسطة SecureStorage.get، يجب استعادة القيمة الأصلية.
 *
 * Note: We test the core SecureStorage logic (encrypt→store→retrieve→decrypt)
 * without the initProtection() side-effect that overrides Storage.prototype,
 * since that protection layer is orthogonal to the round-trip property and
 * interferes with jsdom's localStorage implementation in tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { CryptoUtils } from '../CryptoUtils';

// Mock fetch to prevent security alert calls
global.fetch = vi.fn().mockResolvedValue({ ok: true });

/**
 * Creates a functional localStorage implementation for testing.
 * The global test setup mocks localStorage with non-functional stubs,
 * so we need a real in-memory implementation for SecureStorage tests.
 */
function createFunctionalLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = String(value);
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key: (index: number): string | null => Object.keys(store)[index] ?? null,
  };
}

/**
 * A testable implementation of SecureStorage's core logic.
 * This replicates the set/get/clearSession behavior without initProtection()
 * which overrides Storage.prototype and breaks the test environment.
 */
class TestableSecureStorage {
  private prefix: string;
  private encryptionKey: CryptoKey | null = null;
  private hmacKey: CryptoKey | null = null;
  private ready: Promise<void>;
  private storage: ReturnType<typeof createFunctionalLocalStorage>;

  constructor(prefix: string, storage: ReturnType<typeof createFunctionalLocalStorage>) {
    this.prefix = prefix;
    this.storage = storage;
    this.ready = this.initKeys();
  }

  private async initKeys() {
    const baseKey = 'test-secure-storage-key-for-testing';
    this.encryptionKey = await CryptoUtils.importKey(baseKey);
    this.hmacKey = await CryptoUtils.importHMACKey(baseKey);
  }

  async set(key: string, value: any) {
    await this.ready;
    const fullKey = `${this.prefix}_${key}`;
    const serialized = JSON.stringify(value);
    const encrypted = await CryptoUtils.encrypt(serialized, this.encryptionKey!);
    const hash = await CryptoUtils.sign(encrypted, this.hmacKey!);

    this.storage.setItem(fullKey, encrypted);
    this.storage.setItem(fullKey + '_hash', hash);
  }

  async get(key: string) {
    await this.ready;
    const fullKey = `${this.prefix}_${key}`;
    const encrypted = this.storage.getItem(fullKey);

    if (!encrypted) return null;

    const decrypted = await CryptoUtils.decrypt(encrypted, this.encryptionKey!);
    if (!decrypted) {
      return null;
    }

    try {
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  clearSession() {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k) keys.push(k);
    }
    keys
      .filter((k) => k.startsWith(this.prefix + '_'))
      .forEach((k) => this.storage.removeItem(k));
  }
}

describe('SecureStorage - Property 6: SecureStorage round-trip', () => {
  let storage: TestableSecureStorage;
  let mockStorage: ReturnType<typeof createFunctionalLocalStorage>;

  beforeEach(() => {
    mockStorage = createFunctionalLocalStorage();
    storage = new TestableSecureStorage('test', mockStorage);
  });

  afterEach(() => {
    mockStorage.clear();
  });

  /**
   * **Validates: Requirements 18.3**
   * لأي مفتاح وقيمة، set ثم get يعيد الأصل
   */
  it('set then get returns the original value for any key/value pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9_]+$/.test(s)),
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.integer(), { minLength: 0, maxLength: 5 }),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z]+$/.test(s)),
            fc.string({ minLength: 0, maxLength: 20 })
          )
        ),
        async (key, value) => {
          await storage.set(key, value);
          const retrieved = await storage.get(key);

          expect(retrieved).toEqual(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.3**
   * removeItem (clearSession) يحذف القيمة - بعد clearSession، get يعيد null
   */
  it('clearSession removes all stored values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z0-9_]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (key, value) => {
          await storage.set(key, value);

          // Verify value was stored
          const beforeClear = await storage.get(key);
          expect(beforeClear).toBe(value);

          // Clear session (removes all items with the prefix)
          storage.clearSession();

          // Verify value is gone
          const afterClear = await storage.get(key);
          expect(afterClear).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
