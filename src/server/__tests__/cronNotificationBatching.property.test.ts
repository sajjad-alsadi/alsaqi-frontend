// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property Test: Cron Notification Batching (Property 16)
 *
 * Feature: api-audit-improvements
 * Property 16: Cron Notification Batching
 *
 * **Validates: Requirements 9.2**
 *
 * For any set of overdue recommendations involving N distinct users, the
 * Cron_Scheduler SHALL produce exactly N notifications (one per user), each
 * containing the correct count of that user's overdue items.
 *
 * We test the core batching logic extracted from the cron job:
 * 1. Given overdue records with resolved user_ids, group by user
 * 2. Verify exactly N notifications are produced (one per distinct user)
 * 3. Verify each notification contains the correct count for that user
 * 4. Records where user_id is null (unresolved responsible) are skipped
 */

// ─── Extract the batching logic under test ───────────────────────────────────

interface OverdueRecord {
  id: string;
  responsible: string;
  finding_id: string;
  user_id: string | null;
}

interface NotificationCall {
  userId: string;
  type: string;
  message: string;
  module: string;
  link: string;
}

/**
 * Replicates the cron job's notification batching logic:
 * Groups overdue records by user_id, skips null user_ids,
 * and produces one notification per user with their overdue count.
 */
function batchNotifications(overdueWithUsers: OverdueRecord[]): NotificationCall[] {
  const userNotifications = new Map<string, number>();
  for (const rec of overdueWithUsers) {
    if (rec.user_id) {
      userNotifications.set(
        rec.user_id,
        (userNotifications.get(rec.user_id) || 0) + 1
      );
    }
  }

  const notifications: NotificationCall[] = [];
  for (const [userId, count] of userNotifications) {
    notifications.push({
      userId,
      type: 'recommendation_overdue',
      message: JSON.stringify({ key: 'notifications.recommendationsOverdue', params: { count } }),
      module: 'warning',
      link: '/recommendations',
    });
  }

  return notifications;
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a valid UUID-like user ID */
const userIdArb = fc.uuid();

/** Generates a valid record ID */
const recordIdArb = fc.uuid();

/** Generates a responsible name string */
const responsibleArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/**
 * Generates a single overdue record with a resolved user_id.
 * The user_id is picked from a provided set of user IDs to control
 * the number of distinct users.
 */
function overdueRecordWithUserArb(userIds: string[]): fc.Arbitrary<OverdueRecord> {
  return fc.record({
    id: recordIdArb,
    responsible: responsibleArb,
    finding_id: recordIdArb,
    user_id: fc.constantFrom(...userIds),
  });
}

/**
 * Generates an overdue record with null user_id (unresolved responsible).
 */
const unresolvedRecordArb: fc.Arbitrary<OverdueRecord> = fc.record({
  id: recordIdArb,
  responsible: responsibleArb,
  finding_id: recordIdArb,
  user_id: fc.constant(null),
});

/**
 * Generates a set of N distinct user IDs and a list of overdue records
 * distributed among those users (with optional unresolved records).
 */
const overdueScenarioArb = fc
  .integer({ min: 1, max: 20 })
  .chain((numUsers) =>
    fc.tuple(
      // Generate N distinct user IDs
      fc.uniqueArray(userIdArb, { minLength: numUsers, maxLength: numUsers }),
      fc.constant(numUsers)
    )
  )
  .chain(([userIds, numUsers]) =>
    fc.tuple(
      fc.constant(userIds),
      fc.constant(numUsers),
      // Generate 1-50 resolved records distributed among the users
      fc.array(overdueRecordWithUserArb(userIds), { minLength: numUsers, maxLength: 50 }),
      // Generate 0-10 unresolved records
      fc.array(unresolvedRecordArb, { minLength: 0, maxLength: 10 })
    )
  );

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 16: Cron Notification Batching', () => {
  describe('batchNotifications produces exactly N notifications for N distinct users', () => {
    it('produces exactly one notification per distinct user with resolved user_id', () => {
      fc.assert(
        fc.property(overdueScenarioArb, ([userIds, _numUsers, resolvedRecords, unresolvedRecords]) => {
          const allRecords = [...resolvedRecords, ...unresolvedRecords];
          const notifications = batchNotifications(allRecords);

          // Count distinct user_ids that are non-null in the input
          const distinctUsersInInput = new Set(
            allRecords.filter(r => r.user_id !== null).map(r => r.user_id!)
          );

          // Exactly N notifications for N distinct users
          expect(notifications.length).toBe(distinctUsersInInput.size);

          // Each notification targets a unique user
          const notifiedUsers = new Set(notifications.map(n => n.userId));
          expect(notifiedUsers.size).toBe(notifications.length);

          // All notified users are from the input set
          for (const userId of notifiedUsers) {
            expect(distinctUsersInInput.has(userId)).toBe(true);
          }
        }),
        { numRuns: 300 }
      );
    });

    it('each notification contains the correct overdue count for that user', () => {
      fc.assert(
        fc.property(overdueScenarioArb, ([userIds, _numUsers, resolvedRecords, unresolvedRecords]) => {
          const allRecords = [...resolvedRecords, ...unresolvedRecords];
          const notifications = batchNotifications(allRecords);

          // Compute expected counts manually
          const expectedCounts = new Map<string, number>();
          for (const rec of allRecords) {
            if (rec.user_id) {
              expectedCounts.set(rec.user_id, (expectedCounts.get(rec.user_id) || 0) + 1);
            }
          }

          // Verify each notification has the correct count
          for (const notification of notifications) {
            const parsed = JSON.parse(notification.message);
            const actualCount = parsed.params.count;
            const expectedCount = expectedCounts.get(notification.userId);

            expect(actualCount).toBe(expectedCount);
          }
        }),
        { numRuns: 300 }
      );
    });

    it('records with null user_id produce no notifications', () => {
      fc.assert(
        fc.property(
          fc.array(unresolvedRecordArb, { minLength: 1, maxLength: 20 }),
          (unresolvedRecords) => {
            const notifications = batchNotifications(unresolvedRecords);

            // No notifications should be produced for unresolved records
            expect(notifications.length).toBe(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('notification type is always recommendation_overdue', () => {
      fc.assert(
        fc.property(overdueScenarioArb, ([_userIds, _numUsers, resolvedRecords, unresolvedRecords]) => {
          const allRecords = [...resolvedRecords, ...unresolvedRecords];
          const notifications = batchNotifications(allRecords);

          for (const notification of notifications) {
            expect(notification.type).toBe('recommendation_overdue');
            expect(notification.module).toBe('warning');
            expect(notification.link).toBe('/recommendations');
          }
        }),
        { numRuns: 200 }
      );
    });

    it('total count across all notifications equals total resolved records', () => {
      fc.assert(
        fc.property(overdueScenarioArb, ([_userIds, _numUsers, resolvedRecords, unresolvedRecords]) => {
          const allRecords = [...resolvedRecords, ...unresolvedRecords];
          const notifications = batchNotifications(allRecords);

          // Sum of all notification counts should equal total resolved records
          const totalNotifiedCount = notifications.reduce((sum, n) => {
            const parsed = JSON.parse(n.message);
            return sum + parsed.params.count;
          }, 0);

          const totalResolvedRecords = allRecords.filter(r => r.user_id !== null).length;
          expect(totalNotifiedCount).toBe(totalResolvedRecords);
        }),
        { numRuns: 300 }
      );
    });
  });
});
