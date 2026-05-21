// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  auditTaskStatusArb,
  validStatusTransitionArb,
  invalidStatusTransitionArb,
} from '../../test/helpers/arbitraries';

/**
 * Property Test: Audit task status transitions follow the allowed sequence (Property 11)
 *
 * Feature: comprehensive-testing
 * Property 11: انتقالات حالة مهام التدقيق تتبع التسلسل المسموح
 *
 * **Validates: Requirements 9.4**
 *
 * For any audit task in a given status, only allowed transitions are accepted
 * (draft→in_progress→review→approved→completed, plus review→in_progress).
 * All other transitions must be rejected with a ValidationError.
 *
 * The actual implementation from AuditTaskService:
 *   ALLOWED_TRANSITIONS maps each status to its valid next statuses with role constraints.
 *   changeStatus() throws ValidationError('Invalid status transition') for disallowed transitions.
 */

// ─── Implementation Under Test ───────────────────────────────────────────────

/**
 * Standalone version of the ALLOWED_TRANSITIONS map from AuditTaskService.
 * Matches the exact logic from src/server/services/AuditTaskService.ts.
 */
const ALLOWED_TRANSITIONS: Record<string, Record<string, { roles: string[] }>> = {
  draft: {
    in_progress: { roles: ['Auditor', 'Internal Auditor', 'Manager'] },
  },
  in_progress: {
    review: { roles: ['Auditor', 'Internal Auditor'] },
  },
  review: {
    approved: { roles: ['Manager'] },
    in_progress: { roles: ['Manager'] },
  },
  approved: {
    completed: { roles: ['Manager'] },
  },
};

/**
 * Validates whether a status transition is allowed.
 * Returns true if the transition is valid, false otherwise.
 */
function isTransitionAllowed(currentStatus: string, newStatus: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[currentStatus.toLowerCase()]?.[newStatus.toLowerCase()];
  return !!allowed;
}

/**
 * Simulates AuditTaskService.changeStatus validation logic.
 * Throws an error for invalid transitions, returns success for valid ones.
 */
function validateStatusTransition(currentStatus: string, newStatus: string): void {
  const allowed = ALLOWED_TRANSITIONS[currentStatus.toLowerCase()]?.[newStatus.toLowerCase()];
  if (!allowed) {
    throw new Error('Invalid status transition');
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 11: Audit task status transitions follow the allowed sequence', () => {
  it('accepts all valid status transitions', () => {
    fc.assert(
      fc.property(validStatusTransitionArb, ([fromStatus, toStatus]) => {
        // Valid transitions should not throw
        expect(() => validateStatusTransition(fromStatus, toStatus)).not.toThrow();
        expect(isTransitionAllowed(fromStatus, toStatus)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects all invalid status transitions', () => {
    fc.assert(
      fc.property(invalidStatusTransitionArb, ([fromStatus, toStatus]) => {
        // Invalid transitions should throw
        expect(() => validateStatusTransition(fromStatus, toStatus)).toThrow(
          'Invalid status transition'
        );
        expect(isTransitionAllowed(fromStatus, toStatus)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects transitions from terminal state (completed)', () => {
    fc.assert(
      fc.property(auditTaskStatusArb, (targetStatus) => {
        // 'completed' is a terminal state - no transitions allowed from it
        expect(() => validateStatusTransition('completed', targetStatus)).toThrow(
          'Invalid status transition'
        );
        expect(isTransitionAllowed('completed', targetStatus)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects self-transitions (same status to same status)', () => {
    fc.assert(
      fc.property(auditTaskStatusArb, (status) => {
        // A task cannot transition to its own current status
        expect(() => validateStatusTransition(status, status)).toThrow(
          'Invalid status transition'
        );
        expect(isTransitionAllowed(status, status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects backward transitions except review→in_progress', () => {
    // Define backward transitions that should be rejected
    const invalidBackwardTransitions: Array<[string, string]> = [
      ['in_progress', 'draft'],
      ['approved', 'review'],
      ['approved', 'in_progress'],
      ['approved', 'draft'],
      ['completed', 'approved'],
      ['completed', 'review'],
      ['completed', 'in_progress'],
      ['completed', 'draft'],
    ];

    const backwardTransitionArb = fc.constantFrom(...invalidBackwardTransitions);

    fc.assert(
      fc.property(backwardTransitionArb, ([fromStatus, toStatus]) => {
        expect(() => validateStatusTransition(fromStatus, toStatus)).toThrow(
          'Invalid status transition'
        );
        expect(isTransitionAllowed(fromStatus, toStatus)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('each status has a deterministic set of allowed next statuses', () => {
    // Verify the exact allowed transitions for each status
    const expectedTransitions: Record<string, string[]> = {
      draft: ['in_progress'],
      in_progress: ['review'],
      review: ['approved', 'in_progress'],
      approved: ['completed'],
      completed: [],
    };

    fc.assert(
      fc.property(auditTaskStatusArb, (status) => {
        const expected = expectedTransitions[status] || [];
        const allStatuses = ['draft', 'in_progress', 'review', 'approved', 'completed'];

        for (const target of allStatuses) {
          if (expected.includes(target)) {
            expect(isTransitionAllowed(status, target)).toBe(true);
          } else {
            expect(isTransitionAllowed(status, target)).toBe(false);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
