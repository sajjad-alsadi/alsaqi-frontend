// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit Tests: Enhanced Notification Cron Job for Deadlines
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7**
 *
 * Tests the checkUpcomingDeadlines() function which:
 * 1. Task due date notifications: 1 day before → notify all assigned users (via task_assignments)
 * 2. Plan date notifications: 3 days before start/end → notify Manager/Admin + lead auditor
 * 3. Year-end reminder: December 15 → notify Manager/Admin if unarchived plan exists
 * 4. Runs once per calendar day only
 * 5. Handles missing lead auditor gracefully
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Query-based mock responses
let queryResponses: { pattern: RegExp; result: any; type: 'all' | 'get' | 'run' }[] = [];

function setupQueryResponse(pattern: RegExp, result: any, type: 'all' | 'get' | 'run' = 'all') {
  queryResponses.push({ pattern, result, type });
}

function findResponse(query: string, type: 'all' | 'get' | 'run'): any {
  // Normalize query whitespace for matching
  const normalizedQuery = query.replace(/\s+/g, ' ');
  for (let i = 0; i < queryResponses.length; i++) {
    if (queryResponses[i].pattern.test(normalizedQuery) && queryResponses[i].type === type) {
      const resp = queryResponses[i];
      queryResponses.splice(i, 1); // consume it (first match)
      return resp.result;
    }
  }
  return type === 'all' ? [] : null;
}

let lastQuery = '';

vi.mock('../../server/db/index', () => ({
  db: {
    prepare: (query: string) => {
      lastQuery = query;
      return {
        all: (..._args: any[]) => {
          return Promise.resolve(findResponse(query, 'all'));
        },
        get: (..._args: any[]) => {
          return Promise.resolve(findResponse(query, 'get'));
        },
        run: (..._args: any[]) => {
          return Promise.resolve(findResponse(query, 'run'));
        },
      };
    },
  },
}));

const mockNotificationCreate = vi.fn().mockResolvedValue(true);
vi.mock('../../server/services/NotificationService', () => ({
  NotificationService: {
    create: (...args: any[]) => mockNotificationCreate(...args),
    getAdminIds: vi.fn(),
  },
}));

vi.mock('../../server/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
  checkUpcomingDeadlines,
  getTasksDueTomorrow,
  getPlansDueIn3Days,
  getUnarchivedPlansForYear,
  getManagerAdminIds,
  resolveLeadAuditorId,
  resetDeadlineCheckDate,
  getLastDeadlineCheckDate,
} from '../cron/index';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('checkUpcomingDeadlines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDeadlineCheckDate();
    queryResponses = [];
  });

  describe('Once-per-day guard (Requirement 10.6)', () => {
    it('should run on first call for a given date', async () => {
      await checkUpcomingDeadlines('2025-06-15');
      expect(getLastDeadlineCheckDate()).toBe('2025-06-15');
    });

    it('should skip execution if already ran for the same date', async () => {
      // First run
      await checkUpcomingDeadlines('2025-06-15');

      // Second run same date - should skip
      mockNotificationCreate.mockClear();
      await checkUpcomingDeadlines('2025-06-15');

      // No notifications should be sent on second run
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it('should run again for a different date', async () => {
      await checkUpcomingDeadlines('2025-06-15');
      await checkUpcomingDeadlines('2025-06-16');
      expect(getLastDeadlineCheckDate()).toBe('2025-06-16');
    });
  });

  describe('Task due date notifications (Requirement 10.3)', () => {
    it('should notify assigned users for tasks due tomorrow', async () => {
      // Tasks due tomorrow (2025-06-16)
      setupQueryResponse(/FROM audit_tasks/, [
        { id: 'task-1', title: 'Review Controls', due_date: '2025-06-16' },
      ]);
      // Task assignments for task-1
      setupQueryResponse(/FROM task_assignments/, [
        { user_id: 'user-a' },
        { user_id: 'user-b' },
      ]);

      await checkUpcomingDeadlines('2025-06-15');

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        ['user-a', 'user-b'],
        'task_status_changed',
        expect.stringContaining('taskDueTomorrow'),
        'AuditTasks',
        '/tasks',
        expect.objectContaining({ entityId: 'task-1', entityType: 'audit_task' })
      );
    });

    it('should not notify if task has no assignments', async () => {
      setupQueryResponse(/FROM audit_tasks/, [
        { id: 'task-1', title: 'Review Controls', due_date: '2025-06-16' },
      ]);
      setupQueryResponse(/FROM task_assignments/, []);

      await checkUpcomingDeadlines('2025-06-15');

      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it('should not notify for completed or approved tasks', async () => {
      // SQL filters out completed/approved, so empty result
      setupQueryResponse(/FROM audit_tasks/, []);

      await checkUpcomingDeadlines('2025-06-15');

      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });
  });

  describe('Plan date notifications (Requirement 10.4)', () => {
    it('should notify Manager/Admin + lead auditor for plan starting in 3 days', async () => {
      // No tasks due
      setupQueryResponse(/FROM audit_tasks/, []);
      // Plan with start date in 3 days
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-1', title: 'Annual Audit 2025', planned_start_date: '2025-06-18', planned_end_date: '2025-12-31', lead_auditor: 'John Doe' },
      ]);
      // Manager/Admin users
      setupQueryResponse(/FROM users WHERE role IN/, [
        { id: 'admin-1' }, { id: 'manager-1' },
      ]);
      // Resolve lead auditor
      setupQueryResponse(/FROM users WHERE.*name =/, { id: 'auditor-1' }, 'get');

      await checkUpcomingDeadlines('2025-06-15');

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        ['admin-1', 'manager-1', 'auditor-1'],
        'plan_status_changed',
        expect.stringContaining('planStartingSoon'),
        'AuditPlans',
        '/plan',
        expect.objectContaining({ entityId: 'plan-1', entityType: 'audit_plan' })
      );
    });

    it('should notify Manager/Admin + lead auditor for plan ending in 3 days', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-2', title: 'Q1 Audit', planned_start_date: '2025-01-01', planned_end_date: '2025-06-18', lead_auditor: 'Jane Smith' },
      ]);
      setupQueryResponse(/FROM users WHERE role IN/, [{ id: 'admin-1' }]);
      setupQueryResponse(/FROM users WHERE.*name =/, { id: 'auditor-2' }, 'get');

      await checkUpcomingDeadlines('2025-06-15');

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        ['admin-1', 'auditor-2'],
        'plan_status_changed',
        expect.stringContaining('planEndingSoon'),
        'AuditPlans',
        '/plan',
        expect.objectContaining({ entityId: 'plan-2', entityType: 'audit_plan' })
      );
    });

    it('should handle missing lead auditor gracefully (Requirement 10.7) - null lead_auditor', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-3', title: 'IT Audit', planned_start_date: '2025-06-18', planned_end_date: '2025-12-31', lead_auditor: null },
      ]);
      setupQueryResponse(/FROM users WHERE role IN/, [
        { id: 'admin-1' }, { id: 'manager-1' },
      ]);

      await checkUpcomingDeadlines('2025-06-15');

      // Should still notify Manager/Admin with missingLeadAuditor indicator
      expect(mockNotificationCreate).toHaveBeenCalledWith(
        ['admin-1', 'manager-1'],
        'plan_status_changed',
        expect.stringContaining('"missingLeadAuditor":true'),
        'AuditPlans',
        '/plan',
        expect.objectContaining({ entityId: 'plan-3' })
      );
    });

    it('should handle lead auditor that cannot be resolved to a user', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-4', title: 'Compliance Audit', planned_start_date: '2025-06-18', planned_end_date: '2025-12-31', lead_auditor: 'Unknown Person' },
      ]);
      setupQueryResponse(/FROM users WHERE role IN/, [{ id: 'admin-1' }]);
      // Lead auditor not found
      setupQueryResponse(/FROM users WHERE.*name =/, null, 'get');

      await checkUpcomingDeadlines('2025-06-15');

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        ['admin-1'],
        'plan_status_changed',
        expect.stringContaining('"missingLeadAuditor":true'),
        'AuditPlans',
        '/plan',
        expect.objectContaining({ entityId: 'plan-4' })
      );
    });

    it('should not duplicate lead auditor if already in Manager/Admin list', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-5', title: 'Financial Audit', planned_start_date: '2025-06-18', planned_end_date: '2025-12-31', lead_auditor: 'Admin User' },
      ]);
      setupQueryResponse(/FROM users WHERE role IN/, [
        { id: 'admin-1' }, { id: 'manager-1' },
      ]);
      // Lead auditor resolves to admin-1 (already in the list)
      setupQueryResponse(/FROM users WHERE.*name =/, { id: 'admin-1' }, 'get');

      await checkUpcomingDeadlines('2025-06-15');

      // Should not have admin-1 duplicated
      expect(mockNotificationCreate).toHaveBeenCalledWith(
        ['admin-1', 'manager-1'],
        'plan_status_changed',
        expect.any(String),
        'AuditPlans',
        '/plan',
        expect.any(Object)
      );
    });
  });

  describe('Year-end reminder on December 15 (Requirement 10.5)', () => {
    it('should notify Manager/Admin if unarchived plan exists on Dec 15', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, []);
      // Unarchived plans for current year
      setupQueryResponse(/FROM audit_plans WHERE year/, [
        { id: 'plan-year', title: 'Annual Plan 2025' },
      ]);
      // Manager/Admin users for year-end reminder
      setupQueryResponse(/FROM users WHERE role IN/, [
        { id: 'admin-1' }, { id: 'manager-1' },
      ]);

      await checkUpcomingDeadlines('2025-12-15');

      expect(mockNotificationCreate).toHaveBeenCalledWith(
        ['admin-1', 'manager-1'],
        'plan_status_changed',
        expect.stringContaining('yearEndArchiveReminder'),
        'AuditPlans',
        '/plan'
      );
    });

    it('should not send year-end reminder if no unarchived plans exist', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, []);
      // No unarchived plans
      setupQueryResponse(/FROM audit_plans WHERE year/, []);

      await checkUpcomingDeadlines('2025-12-15');

      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it('should not send year-end reminder on dates other than Dec 15', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, []);

      await checkUpcomingDeadlines('2025-12-14');

      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it('should not send year-end reminder in non-December months', async () => {
      setupQueryResponse(/FROM audit_tasks/, []);
      setupQueryResponse(/FROM audit_plans.*is_archived/, []);

      await checkUpcomingDeadlines('2025-11-15');

      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });
  });

  describe('getManagerAdminIds helper', () => {
    it('should return IDs of active Manager and Admin users', async () => {
      setupQueryResponse(/FROM users WHERE role IN/, [
        { id: 'admin-1' },
        { id: 'manager-1' },
        { id: 'manager-2' },
      ]);

      const ids = await getManagerAdminIds();

      expect(ids).toEqual(['admin-1', 'manager-1', 'manager-2']);
    });

    it('should return empty array when no Manager/Admin users exist', async () => {
      setupQueryResponse(/FROM users WHERE role IN/, []);

      const ids = await getManagerAdminIds();

      expect(ids).toEqual([]);
    });
  });

  describe('resolveLeadAuditorId helper', () => {
    it('should return user ID when lead auditor is found', async () => {
      setupQueryResponse(/FROM users WHERE.*name =/, { id: 'user-123' }, 'get');

      const id = await resolveLeadAuditorId('John Doe');

      expect(id).toBe('user-123');
    });

    it('should return null when lead auditor is null', async () => {
      const id = await resolveLeadAuditorId(null);
      expect(id).toBeNull();
    });

    it('should return null when lead auditor name is not found in users', async () => {
      setupQueryResponse(/FROM users WHERE.*name =/, null, 'get');

      const id = await resolveLeadAuditorId('Unknown Person');

      expect(id).toBeNull();
    });
  });

  describe('getTasksDueTomorrow helper', () => {
    it('should return tasks with their assigned user IDs', async () => {
      setupQueryResponse(/FROM audit_tasks/, [
        { id: 'task-1', title: 'Task A', due_date: '2025-06-16' },
        { id: 'task-2', title: 'Task B', due_date: '2025-06-16' },
      ]);
      setupQueryResponse(/FROM task_assignments/, [{ user_id: 'user-1' }]);
      setupQueryResponse(/FROM task_assignments/, [{ user_id: 'user-2' }, { user_id: 'user-3' }]);

      const result = await getTasksDueTomorrow('2025-06-15');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        taskId: 'task-1',
        title: 'Task A',
        dueDate: '2025-06-16',
        assignedUserIds: ['user-1'],
      });
      expect(result[1]).toEqual({
        taskId: 'task-2',
        title: 'Task B',
        dueDate: '2025-06-16',
        assignedUserIds: ['user-2', 'user-3'],
      });
    });

    it('should skip tasks with no assignments', async () => {
      setupQueryResponse(/FROM audit_tasks/, [
        { id: 'task-1', title: 'Task A', due_date: '2025-06-16' },
      ]);
      setupQueryResponse(/FROM task_assignments/, []);

      const result = await getTasksDueTomorrow('2025-06-15');

      expect(result).toHaveLength(0);
    });
  });

  describe('getPlansDueIn3Days helper', () => {
    it('should return plans with start date in 3 days', async () => {
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-1', title: 'Plan A', planned_start_date: '2025-06-18', planned_end_date: '2025-12-31', lead_auditor: 'John' },
      ]);

      const result = await getPlansDueIn3Days('2025-06-15');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        planId: 'plan-1',
        title: 'Plan A',
        dateType: 'start',
        date: '2025-06-18',
        leadAuditor: 'John',
      });
    });

    it('should return plans with end date in 3 days', async () => {
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-2', title: 'Plan B', planned_start_date: '2025-01-01', planned_end_date: '2025-06-18', lead_auditor: null },
      ]);

      const result = await getPlansDueIn3Days('2025-06-15');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        planId: 'plan-2',
        title: 'Plan B',
        dateType: 'end',
        date: '2025-06-18',
        leadAuditor: null,
      });
    });

    it('should return both start and end entries if both match', async () => {
      setupQueryResponse(/FROM audit_plans.*is_archived/, [
        { id: 'plan-3', title: 'Plan C', planned_start_date: '2025-06-18', planned_end_date: '2025-06-18', lead_auditor: 'Jane' },
      ]);

      const result = await getPlansDueIn3Days('2025-06-15');

      expect(result).toHaveLength(2);
      expect(result[0].dateType).toBe('start');
      expect(result[1].dateType).toBe('end');
    });
  });

  describe('getUnarchivedPlansForYear helper', () => {
    it('should return unarchived plans for the given year', async () => {
      setupQueryResponse(/FROM audit_plans WHERE year/, [
        { id: 'plan-1', title: 'Annual Plan 2025' },
      ]);

      const result = await getUnarchivedPlansForYear(2025);

      expect(result).toEqual([{ id: 'plan-1', title: 'Annual Plan 2025' }]);
    });

    it('should return empty array when no unarchived plans exist', async () => {
      setupQueryResponse(/FROM audit_plans WHERE year/, []);

      const result = await getUnarchivedPlansForYear(2025);

      expect(result).toEqual([]);
    });
  });

  describe('Error handling', () => {
    it('should still mark date as completed even if errors occur', async () => {
      // All queries will return default (empty) since no responses are set up
      await checkUpcomingDeadlines('2025-06-15');

      expect(getLastDeadlineCheckDate()).toBe('2025-06-15');
    });
  });
});
