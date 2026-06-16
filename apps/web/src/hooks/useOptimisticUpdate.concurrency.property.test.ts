// @vitest-environment jsdom
//
// Feature: code-review-remediation, Property 12: Optimistic rollback preserves
// concurrent updates
//
// Property 12: Optimistic rollback preserves concurrent updates
//   - For any two optimistic updates where a second update (B) is applied before
//     the first update's (A) rollback runs, rolling back the failed update A
//     preserves update B's change. The revert is applied against the LIVE state
//     via a functional setter and never restores a pre-concurrency snapshot.
//   **Validates: Requirements 14.1, 14.2, 14.3**
//
// Unlike the synthetic-setter property test, this drives the hook against a real
// `useState`-backed list inside a harness component (renderHook), reproducing the
// genuine interleaving: start failing update A, apply concurrent update B while
// A's action is still pending, then let A reject and assert B survives.
import { describe, it, expect } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import fc from 'fast-check';
import { useOptimisticUpdate } from './useOptimisticUpdate';

interface Item {
  id: number;
  value: number;
}

/** Combines a real useState-backed list with the optimistic-update hook. */
function useHarness(initial: Item[]) {
  const [items, setItems] = useState<Item[]>(initial);
  const { execute, isLoading } = useOptimisticUpdate<Item>();
  return { items, setItems, execute, isLoading };
}

/**
 * Scenario: a base list of unique-id items, two DISTINCT target items (A fails,
 * B is the concurrent update), and disjoint value ranges so a stale-snapshot
 * rollback would be detectably different from the lost-update-safe result:
 *   - base values:        0 - 999
 *   - concurrent (B):  1000 - 1999
 *   - optimistic (A):  2000 - 2999
 */
const scenarioArb = fc
  .uniqueArray(
    fc.record({
      id: fc.integer({ min: 0, max: 1000 }),
      value: fc.integer({ min: 0, max: 999 }),
    }),
    { selector: (i) => i.id, minLength: 2, maxLength: 8 }
  )
  .chain((base) =>
    fc.record({
      base: fc.constant(base),
      indexA: fc.integer({ min: 0, max: base.length - 1 }),
      indexB: fc.integer({ min: 0, max: base.length - 1 }),
      optimisticA: fc.integer({ min: 2000, max: 2999 }),
      valueB: fc.integer({ min: 1000, max: 1999 }),
    })
  )
  // Ensure A and B target different items.
  .filter((cfg) => cfg.indexA !== cfg.indexB);

describe('Property 12: optimistic rollback preserves concurrent updates', () => {
  it(
    "rolling back a failed update A preserves a concurrent update B applied before A's rollback runs",
    async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          const { base, indexA, indexB, optimisticA, valueB } = scenario;
          const idA = base[indexA].id;
          const originalA = base[indexA].value;
          const idB = base[indexB].id;

          const { result, unmount } = renderHook(() => useHarness(base));

          try {
            // A controllable action for update A: stays pending until we reject.
            let rejectA!: () => void;
            const actionA = new Promise<unknown>((_, reject) => {
              rejectA = () => reject(new Error('server failed'));
            });

            // 1) Start failing update A. Its action stays pending, so the hook
            //    has applied A's optimistic value but not yet rolled it back.
            let execA!: Promise<void>;
            act(() => {
              execA = result.current.execute(
                {
                  action: () => actionA,
                  applyOptimistic: (items) =>
                    items.map((t) =>
                      t.id === idA ? { ...t, value: optimisticA } : t
                    ),
                  // Inverts ONLY item A back to its original value, against
                  // whatever the live list is at rollback time.
                  revertItem: (items) =>
                    items.map((t) =>
                      t.id === idA ? { ...t, value: originalA } : t
                    ),
                },
                result.current.items,
                result.current.setItems
              );
            });

            // A's optimistic value is now live.
            expect(
              result.current.items.find((t) => t.id === idA)?.value
            ).toBe(optimisticA);

            // 2) Apply a concurrent update B BEFORE A's rollback runs, using a
            //    functional setter against the live state (as a real second
            //    optimistic update would).
            const setItems: Dispatch<SetStateAction<Item[]>> =
              result.current.setItems;
            act(() => {
              setItems((prev) =>
                prev.map((t) => (t.id === idB ? { ...t, value: valueB } : t))
              );
            });

            expect(
              result.current.items.find((t) => t.id === idB)?.value
            ).toBe(valueB);

            // 3) Now let A's action reject -> rollback executes.
            await act(async () => {
              rejectA();
              await execA;
            });

            const final = result.current.items;

            // Req 14.2: B's concurrent change survives A's rollback.
            expect(final.find((t) => t.id === idB)?.value).toBe(valueB);

            // Req 14.1: A is reverted against live state to its original value.
            expect(final.find((t) => t.id === idA)?.value).toBe(originalA);

            // Req 14.3: no pre-concurrency snapshot was restored — every
            // non-A item keeps its most-recent value (B updated, others base).
            for (const item of base) {
              if (item.id === idA) continue;
              const expected = item.id === idB ? valueB : item.value;
              expect(final.find((t) => t.id === item.id)?.value).toBe(expected);
            }
          } finally {
            unmount();
            cleanup();
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
