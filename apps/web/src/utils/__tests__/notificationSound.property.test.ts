/**
 * @vitest-environment jsdom
 *
 * Property-based tests for shared AudioContext management.
 *
 * Feature: web-production-readiness-remediation, Property 2: Notification sound reuses a single AudioContext
 *
 * Property 2: Notification sound reuses a single AudioContext
 *   - For any sequence of N successive notification-sound plays without an
 *     intervening close, at most one live `AudioContext` is created (the shared
 *     instance is reused).
 *   **Validates: Requirements 3.3**
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import fc from 'fast-check';
import {
  playNotificationSound,
  getAudioContext,
  resetAudioContextForTesting,
} from '../notificationSound';

// ─── Stub Web Audio API ─────────────────────────────────────────────────────
//
// jsdom does not implement the Web Audio API. The global test setup installs a
// non-configurable `window.AudioContext` mock (a `vi.fn`), so we cannot replace
// the property directly. Instead we swap that mock's implementation to return
// our construction-counting stub, which tracks `state`, exposes
// `createOscillator`/`createGain`/`destination`/`resume`, and supports the
// per-play node graph used by `playNotificationSound`.

/** Total AudioContext constructions across the current run. Reset per-run. */
let constructionCount = 0;
/** Every constructed stub context, so we can inspect their live/closed state. */
let createdContexts: StubAudioContext[] = [];

class StubAudioParam {
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}

class StubOscillator {
  frequency = new StubAudioParam();
  connect(): void {}
  start(): void {}
  stop(): void {}
}

class StubGainNode {
  gain = new StubAudioParam();
  connect(): void {}
}

class StubAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'running';
  currentTime = 0;
  destination = {};

  constructor() {
    constructionCount += 1;
    createdContexts.push(this);
  }

  createOscillator(): StubOscillator {
    return new StubOscillator();
  }

  createGain(): StubGainNode {
    return new StubGainNode();
  }

  resume(): Promise<void> {
    if (this.state !== 'closed') {
      this.state = 'running';
    }
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

function installAudioStub(): void {
  const ctor = (window as unknown as { AudioContext: Mock }).AudioContext;
  // Must be a regular (constructable) function: `getAudioContext` calls it with
  // `new`, and an arrow function cannot be used as a constructor.
  ctor.mockImplementation(function (this: unknown) {
    return new StubAudioContext();
  });
}

function uninstallAudioStub(): void {
  const ctor = (window as unknown as { AudioContext: Mock }).AudioContext;
  ctor.mockReset();
}

describe('Property 2: Notification sound reuses a single AudioContext', () => {
  beforeEach(() => {
    installAudioStub();
  });

  afterEach(() => {
    resetAudioContextForTesting();
    uninstallAudioStub();
  });

  it('creates at most one AudioContext across N successive plays', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (n) => {
        // Fresh state for each generated input.
        resetAudioContextForTesting();
        constructionCount = 0;
        createdContexts = [];

        for (let i = 0; i < n; i += 1) {
          playNotificationSound();
        }

        // The shared context is reused: no more than one is ever constructed,
        // and exactly one once at least one play has occurred.
        expect(constructionCount).toBeLessThanOrEqual(1);
        expect(constructionCount).toBe(1);

        // The single context remains live (not closed) after the plays.
        const liveContexts = createdContexts.filter((c) => c.state !== 'closed');
        expect(liveContexts.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  it('reuses the same instance returned by getAudioContext across plays', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        resetAudioContextForTesting();
        constructionCount = 0;
        createdContexts = [];

        const first = getAudioContext();
        for (let i = 0; i < n; i += 1) {
          playNotificationSound();
        }
        const after = getAudioContext();

        // Same shared instance throughout; only one construction.
        expect(after).toBe(first);
        expect(constructionCount).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('recreates exactly one new context after the shared one is closed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (before, after) => {
          resetAudioContextForTesting();
          constructionCount = 0;
          createdContexts = [];

          for (let i = 0; i < before; i += 1) {
            playNotificationSound();
          }
          expect(constructionCount).toBe(1);

          // Simulate the browser closing the shared context.
          createdContexts[0].state = 'closed';

          for (let i = 0; i < after; i += 1) {
            playNotificationSound();
          }

          // Exactly one replacement is created; at most one live context remains.
          expect(constructionCount).toBe(2);
          const liveContexts = createdContexts.filter((c) => c.state !== 'closed');
          expect(liveContexts.length).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
