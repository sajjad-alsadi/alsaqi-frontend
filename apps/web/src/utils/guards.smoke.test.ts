// @vitest-environment jsdom
//
// Smoke test: ObjectGuard and DOMGuard must not interfere with the global
// runtime (code-review remediation, Req 11). Both modules are now no-op shims:
//
//   - ObjectGuard must NOT permanently override/freeze `Object.defineProperty`
//     process-wide (Req 11.1), and a third-party-style `Object.defineProperty`
//     call must still succeed after init (Req 11.4).
//   - DOMGuard must NOT register a document-wide MutationObserver (Req 11.2).
//
// The Backend remains the authoritative enforcement boundary (Req 11.3).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initObjectGuard, ObjectGuard } from './ObjectGuard';
import { initDOMGuard, DOMGuard } from './DOMGuard';

describe('Guards smoke: ObjectGuard leaves Object.defineProperty native (Req 11.1, 11.4)', () => {
  // Capture the genuine reference before any guard init runs.
  const baselineDefineProperty = Object.defineProperty;

  it('does not replace Object.defineProperty when initObjectGuard runs', () => {
    const defineBeforeInit = Object.defineProperty;

    initObjectGuard();
    // Also exercise direct construction of the retained class.
    new ObjectGuard();

    // Req 11.1: the global must be the exact same reference, never swapped for
    // an instrumented/freezing wrapper.
    expect(Object.defineProperty).toBe(defineBeforeInit);
    expect(Object.defineProperty).toBe(baselineDefineProperty);
    expect(vi.isMockFunction(Object.defineProperty)).toBe(false);
  });

  it('keeps Object.defineProperty writable and configurable on the Object constructor', () => {
    initObjectGuard();

    const descriptor = Object.getOwnPropertyDescriptor(Object, 'defineProperty');
    expect(descriptor).toBeDefined();
    expect(descriptor?.writable).toBe(true);
    expect(descriptor?.configurable).toBe(true);
  });

  it('allows a third-party-style Object.defineProperty call to succeed after init (Req 11.4)', () => {
    initObjectGuard();

    // Simulate a third-party library defining a property on its own object.
    const thirdPartyTarget: Record<string, unknown> = {};

    expect(() =>
      Object.defineProperty(thirdPartyTarget, 'feature', {
        value: 42,
        writable: true,
        configurable: true,
        enumerable: true,
      }),
    ).not.toThrow();

    expect(thirdPartyTarget.feature).toBe(42);

    // And the property remains redefinable (not frozen by the guard).
    expect(() =>
      Object.defineProperty(thirdPartyTarget, 'feature', {
        value: 99,
        writable: true,
        configurable: true,
        enumerable: true,
      }),
    ).not.toThrow();

    expect(thirdPartyTarget.feature).toBe(99);
  });
});

describe('Guards smoke: DOMGuard registers no document-wide observer (Req 11.2)', () => {
  let observeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls MutationObserver.observe when initDOMGuard runs', () => {
    initDOMGuard();
    initDOMGuard({
      sensitiveSelectors: ['input[type="password"]'],
      blockedAttributes: ['onerror', 'onload'],
    });
    // Direct construction must also register nothing.
    new DOMGuard();

    expect(observeSpy).not.toHaveBeenCalled();
  });

  it('exposes its configuration without activating any monitoring', () => {
    const guard = initDOMGuard({
      sensitiveSelectors: ['input[type="password"]'],
      blockedAttributes: ['onerror'],
    });

    expect(guard.getSensitiveSelectors()).toEqual(['input[type="password"]']);
    expect(guard.getBlockedAttributes()).toEqual(['onerror']);

    // Teardown is a safe no-op and registers nothing.
    expect(() => guard.destroy()).not.toThrow();
    expect(observeSpy).not.toHaveBeenCalled();
  });
});
