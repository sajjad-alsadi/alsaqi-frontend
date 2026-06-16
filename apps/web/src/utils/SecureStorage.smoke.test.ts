/**
 * Smoke test: SecureStorage must NOT override Storage.prototype primitives.
 *
 * Requirement 3.1 — THE Secure_Storage_Module SHALL NOT override
 *   `Storage.prototype.getItem`, `Storage.prototype.setItem`, or
 *   `Storage.prototype.removeItem`.
 * Requirement 3.2 — secure read/write behavior is exposed through instance
 *   methods only.
 *
 * Strategy: capture the genuine `Storage.prototype` method references BEFORE the
 * module is evaluated (via a dynamic `import()`, so the baseline is recorded
 * first), then import the module — which constructs the `secureStore` singleton
 * at module scope and would run any prototype-patching init — and construct
 * additional instances. After all of that, the prototype methods must be the
 * exact same references (===): the module must never have swapped them for an
 * instrumented wrapper.
 */
import { describe, it, expect, vi } from 'vitest';

// Baseline references captured at module-load time of THIS test file, before
// SecureStorage is dynamically imported below. The setup file mocks the
// `localStorage` object but leaves `Storage.prototype` untouched, so these are
// the genuine jsdom Storage methods.
const baselineGetItem = Storage.prototype.getItem;
const baselineSetItem = Storage.prototype.setItem;
const baselineRemoveItem = Storage.prototype.removeItem;

describe('SecureStorage smoke: Storage.prototype is not overridden (Req 3.1, 3.2)', () => {
  it('leaves Storage.prototype methods unchanged after import + construction', async () => {
    // Sanity: the baseline references are real functions and not test mocks.
    expect(typeof baselineGetItem).toBe('function');
    expect(typeof baselineSetItem).toBe('function');
    expect(typeof baselineRemoveItem).toBe('function');
    expect(vi.isMockFunction(baselineGetItem)).toBe(false);
    expect(vi.isMockFunction(baselineSetItem)).toBe(false);
    expect(vi.isMockFunction(baselineRemoveItem)).toBe(false);

    // Importing the module runs `export const secureStore = new SecureStorage(...)`,
    // so any prototype-patching init would have already executed here.
    const { SecureStorage, secureStore } = await import('./SecureStorage');
    expect(secureStore).toBeInstanceOf(SecureStorage);

    // Construct further instances — the constructor must not patch the prototype.
    const a = new SecureStorage('smokeA');
    const b = new SecureStorage('smokeB');
    expect(a).toBeInstanceOf(SecureStorage);
    expect(b).toBeInstanceOf(SecureStorage);

    // The prototype methods must be the exact same references as the baseline
    // (===) — never replaced by an override.
    expect(Storage.prototype.getItem).toBe(baselineGetItem);
    expect(Storage.prototype.setItem).toBe(baselineSetItem);
    expect(Storage.prototype.removeItem).toBe(baselineRemoveItem);

    // They must also still not be instrumented/mocked wrappers.
    expect(vi.isMockFunction(Storage.prototype.getItem)).toBe(false);
    expect(vi.isMockFunction(Storage.prototype.setItem)).toBe(false);
    expect(vi.isMockFunction(Storage.prototype.removeItem)).toBe(false);
  });
});
