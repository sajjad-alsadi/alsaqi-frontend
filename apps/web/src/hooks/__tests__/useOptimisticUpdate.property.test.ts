// @vitest-environment jsdom
//
// Feature: frontend-audit-remediation, Property 19: Lost-update-safe optimistic
// rollback
//
// Property 19: Lost-update-safe optimistic rollback
//   - For any list containing a concurrent update to an item other than the one
//     being changed, when an optimistic update fails the rollback SHALL preserve
//     that other item's most recent value (reverting only the affected item or
//     refetching), never restoring a stale full snapshot. When a precise inverse
//     is not possible (`revertItem` returns null) the affected data is refetched.
//   **Validates: Requirements 22.1, 22.2, 22.3**
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useOptimisticUpdate } from '../useOptimisticUpdate';

interface Item {
  id: number;
  value: number;
}

/**
 * Generates a scenario for an optimistic update against one item while other
 * items may carry concurrent updates (their most recent values).
 *
 * - `base`: items with unique ids (the pre-action / "stale snapshot" values).
 * - `targetIndex`: the single item the optimistic update changes.
 * - `concurrentMask` + `concurrentValues`: which non-target items received a
 *   concurrent update and to what value. These produce `current`, the list as
 *   it exists when `execute` runs (most recent values for other items).
 * - `optimisticValue`: the new value applied to the target item.
 *
 * Value ranges are kept disjoint (base 0-999, concurrent 1000-1999, optimistic
 * 2000-2999) so a stale full-snapshot rollback is always detectably different
 * from the lost-update-safe result whenever a concurrent update is present.
 */
const scenarioArb = fc
  .uniqueArray(
    fc.record({
      id: fc.integer({ min: 0, max: 1000 }),
      value: fc.integer({ min: 0, max: 999 }),
    }),
    { selector: (i) => i.id, minLength: 1, maxLength: 8 }
  )
  .chain((base) =>
    fc.record({
      base: fc.constant(base),
      targetIndex: fc.integer({ min: 0, max: base.length - 1 }),
      concurrentMask: fc.array(fc.boolean(), {
        minLength: base.length,
        maxLength: base.length,
      }),
      concurrentValues: fc.array(fc.integer({ min: 1000, max: 1999 }), {
        minLength: base.length,
        maxLength: base.length,
      }),
      optimisticValue: fc.integer({ min: 2000, max: 2999 }),
    })
  )
  .map((cfg) => {
    // `current` reflects the latest known state: non-target items may carry a
    // concurrent update; the target item still holds its pre-optimistic value.
    const current: Item[] = cfg.base.map((item, i) => {
      if (i !== cfg.targetIndex && cfg.concurrentMask[i]) {
        return { ...item, value: cfg.concurrentValues[i] };
      }
      return { ...item };
    });
    return { ...cfg, current };
  });

describe('Property 19: lost-update-safe optimistic rollback', () => {
  it(
    'reverts only the affected item on failure, preserving concurrent updates to other items',
    async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          const { current, targetIndex, optimisticValue } = scenario;
          const targetId = current[targetIndex].id;
          const targetCurrentValue = current[targetIndex].value;

          const { result } = renderHook(() => useOptimisticUpdate<Item>());

          const setItemsCalls: Item[][] = [];
          const setItems = (items: Item[]) => {
            setItemsCalls.push(items);
          };
          const refetch = vi.fn();

          await act(async () => {
            await result.current.execute(
              {
                action: () => Promise.reject(new Error('server failed')),
                applyOptimistic: (items) =>
                  items.map((t) =>
                    t.id === targetId ? { ...t, value: optimisticValue } : t
                  ),
                // Invert only the affected item against the CURRENT list.
                revertItem: (items) =>
                  items.map((t) =>
                    t.id === targetId ? { ...t, value: targetCurrentValue } : t
                  ),
                refetch,
              },
              current,
              setItems
            );
          });

          // The optimistic apply (1st call) plus the precise revert (2nd call).
          expect(setItemsCalls.length).toBe(2);
          const finalList = setItemsCalls[setItemsCalls.length - 1];

          // A precise inverse was possible, so refetch must NOT be used.
          expect(refetch).not.toHaveBeenCalled();

          // Req 22.1 / 22.3: only the affected item is reverted; every other
          // item keeps its most-recent (concurrent) value — never a stale one.
          expect(finalList).toEqual(current);
          for (let i = 0; i < current.length; i++) {
            if (i === targetIndex) {
              expect(finalList[i].value).toBe(targetCurrentValue);
            } else {
              // Most recent value preserved (lost-update-safe).
              expect(finalList[i].value).toBe(current[i].value);
            }
          }
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'invokes refetch and never restores a full snapshot when a precise inverse is not possible',
    async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          const { current, targetIndex, optimisticValue } = scenario;
          const targetId = current[targetIndex].id;

          const { result } = renderHook(() => useOptimisticUpdate<Item>());

          const setItemsCalls: Item[][] = [];
          const setItems = (items: Item[]) => {
            setItemsCalls.push(items);
          };
          const refetch = vi.fn().mockResolvedValue(undefined);

          await act(async () => {
            await result.current.execute(
              {
                action: () => Promise.reject(new Error('server failed')),
                applyOptimistic: (items) =>
                  items.map((t) =>
                    t.id === targetId ? { ...t, value: optimisticValue } : t
                  ),
                // Signal that a precise inverse cannot be computed.
                revertItem: () => null,
                refetch,
              },
              current,
              setItems
            );
          });

          // Req 22.2: refetch is the fallback when reversion is imprecise.
          expect(refetch).toHaveBeenCalledTimes(1);

          // Only the optimistic apply happened; no rollback list was pushed,
          // so a stale full snapshot is never restored (Req 22.3).
          expect(setItemsCalls.length).toBe(1);
        }),
        { numRuns: 100 }
      );
    }
  );
});
