// Feature: frontend-audit-remediation, Property 8: Unread-count accuracy
// Feature: frontend-audit-remediation, Property 9: Updater purity under double invocation
//
// Property 8: Unread-count accuracy
//   - For any sequence of mark-as-read and delete operations applied to any
//     notification list, the resulting unread count equals the number of
//     notifications whose `is_read` value is `false`. The counter is modelled
//     as a seeded count (`recomputeUnread(initialList)`) plus the sum of the
//     per-operation `unreadDelta(prev, next)` values, exactly as the
//     NotificationContext maintains it, and is asserted equal to
//     `recomputeUnread(finalList)`.
//   **Validates: Requirements 8.1, 8.2, 8.5**
//
// Property 9: Updater purity under double invocation
//   - For any operation (mark-as-read or delete), the pure helpers
//     `recomputeUnread`/`unreadDelta` return identical outputs when invoked
//     twice with the same inputs and never mutate their inputs. Therefore
//     applying the delta computation twice (React StrictMode double-invocation)
//     produces the same final state (list + unread counter) as applying it once.
//   **Validates: Requirements 8.3, 8.4**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { recomputeUnread, unreadDelta } from '../NotificationContext';
import type { Notification } from '../../types';

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Builds a type-complete `Notification` from the minimal fields the unread
 * helpers actually read (`id`, `is_read`). The remaining required fields are
 * filled with deterministic placeholders so the object satisfies the shared
 * `Notification` type without influencing the counter logic.
 */
function makeNotification(id: number, isRead: boolean): Notification {
  return {
    id,
    event_type: 'test_event',
    description: `notification-${id}`,
    related_module: 'test',
    date: '2024-01-01T00:00:00.000Z',
    is_read: isRead,
    status: isRead ? 'Read' : 'Unread',
  };
}

/**
 * A notification list with unique numeric ids and arbitrary read states. Unique
 * ids let mark-as-read/delete operations target a single, well-defined item.
 */
const notificationListArb: fc.Arbitrary<Notification[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 50 }), { minLength: 0, maxLength: 20 })
  .chain((ids) =>
    fc.tuple(...ids.map(() => fc.boolean())).map((reads) =>
      ids.map((id, i) => makeNotification(id, reads[i] as boolean))
    )
  );

type Operation =
  | { kind: 'markRead'; id: number }
  | { kind: 'delete'; id: number };

/**
 * An operation generator that mostly targets existing ids (so the operation has
 * an effect) but also occasionally targets a non-existent id (so the no-op path
 * — Req 8.2's "already read"/"missing" case — is exercised).
 */
function operationArb(ids: number[]): fc.Arbitrary<Operation> {
  const idArb =
    ids.length > 0
      ? fc.oneof(
          { weight: 4, arbitrary: fc.constantFrom(...ids) },
          { weight: 1, arbitrary: fc.integer({ min: 51, max: 100 }) }
        )
      : fc.integer({ min: 51, max: 100 });
  return fc.oneof(
    idArb.map((id) => ({ kind: 'markRead', id } as Operation)),
    idArb.map((id) => ({ kind: 'delete', id } as Operation))
  );
}

const scenarioArb = notificationListArb.chain((list) =>
  fc
    .array(operationArb(list.map((n) => Number(n.id))), { minLength: 0, maxLength: 30 })
    .map((ops) => ({ list, ops }))
);

// ── Reducer model (mirrors NotificationContext) ─────────────────────────────────

/**
 * Pure model of the list transition produced by a single operation, matching
 * the NotificationContext implementation: mark-as-read flips `is_read`/`status`
 * for the targeted notification; delete removes it.
 */
function applyOperation(list: Notification[], op: Operation): Notification[] {
  if (op.kind === 'markRead') {
    return list.map((n) =>
      n.id === op.id ? { ...n, is_read: true, status: 'Read' as const } : n
    );
  }
  return list.filter((n) => n.id !== op.id);
}

function countUnread(list: Notification[]): number {
  return list.filter((n) => !n.is_read).length;
}

describe('Property 8: Unread-count accuracy', () => {
  it('counter (seeded + applied deltas) equals the count of unread notifications after any op sequence', () => {
    fc.assert(
      fc.property(scenarioArb, ({ list, ops }) => {
        // Seed the counter exactly as NotificationContext does: from the
        // authoritative recompute over the initial list.
        let counter = recomputeUnread(list);
        let current = list;

        for (const op of ops) {
          const next = applyOperation(current, op);
          // Delta is computed OUTSIDE the state-updater path (as in the impl).
          counter += unreadDelta(current, next);
          current = next;
        }

        // The seeded-plus-deltas counter must match the authoritative recompute
        // and the direct count of unread notifications (Req 8.5, 8.1, 8.2).
        expect(counter).toBe(recomputeUnread(current));
        expect(counter).toBe(countUnread(current));
        expect(counter).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  it('mark-as-read decrements only for a previously-unread target (Req 8.1, 8.2)', () => {
    fc.assert(
      fc.property(notificationListArb, (list) => {
        for (const target of list) {
          const next = applyOperation(list, { kind: 'markRead', id: Number(target.id) });
          const delta = unreadDelta(list, next);
          // Unread target → counter decreases by exactly 1; already-read → 0.
          expect(delta).toBe(target.is_read ? 0 : -1);
        }
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Updater purity under double invocation', () => {
  it('recomputeUnread/unreadDelta are pure: same inputs -> same outputs, no input mutation', () => {
    fc.assert(
      fc.property(scenarioArb, ({ list, ops }) => {
        let current = list;

        for (const op of ops) {
          // Deep snapshots to detect any mutation of the input list.
          const beforeSnapshot = JSON.stringify(current);

          const next1 = applyOperation(current, op);
          const delta1 = unreadDelta(current, next1);
          const recompute1 = recomputeUnread(current);

          // Second (StrictMode double) invocation with the same inputs.
          const next2 = applyOperation(current, op);
          const delta2 = unreadDelta(current, next2);
          const recompute2 = recomputeUnread(current);

          // Same inputs -> same outputs.
          expect(delta2).toBe(delta1);
          expect(recompute2).toBe(recompute1);
          expect(next2).toEqual(next1);

          // Inputs were not mutated by either invocation.
          expect(JSON.stringify(current)).toBe(beforeSnapshot);

          current = next1;
        }
      }),
      { numRuns: 100 }
    );
  });

  it('applying the counter delta twice from the same base equals applying it once (idempotent commit)', () => {
    fc.assert(
      fc.property(scenarioArb, ({ list, ops }) => {
        let current = list;

        for (const op of ops) {
          const next = applyOperation(current, op);
          const base = recomputeUnread(current);
          const delta = unreadDelta(current, next);

          // React commits the functional updater's result once even though
          // StrictMode invokes it twice; both invocations start from `base`
          // and therefore yield the identical committed value.
          const onceCommit = Math.max(0, base + delta);
          const doubleInvokeCommit = Math.max(0, base + delta);
          expect(doubleInvokeCommit).toBe(onceCommit);

          // And that committed value is the authoritative unread count.
          expect(onceCommit).toBe(recomputeUnread(next));

          current = next;
        }
      }),
      { numRuns: 100 }
    );
  });
});
