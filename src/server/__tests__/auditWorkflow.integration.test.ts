// @vitest-environment node
/**
 * Integration tests for end-to-end audit workflows.
 *
 * Tests:
 * 1. Full lifecycle: create plan → create tasks → assign users → create findings →
 *    auto-recommendations → change status → close plan → archive
 * 2. Permission enforcement across all roles
 * 3. Notification delivery for all event types
 *
 * **Validates: Requirements 1.1-1.11, 2.1-2.8, 4.1-4.7, 6.1-6.11, 7.1-7.7**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '../../constants';
import {
  DEFAULT_PERMISSIONS,
  MODULES,
  PERMISSIONS,
} from '../../permissions';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../db/index', () => {
  const mockPrepare = vi.fn();
  return {
    db: {
      prepare: mockPrepare,
      transaction: vi.fn((fn: Function) => {
        const wrapper: any = (...args: any[]) => fn(...args);
        const lazyPromise = () => fn();
        wrapper.then = (onFulfilled: any, onRejected: any) =>
          Promise.resolve(lazyPromise()).then(onFulfilled, onRejected);
        wrapper.catch = (onRejected: any) =>
          Promise.resolve(lazyPromise()).catch(onRejected);
        return wrapper;
      }),
      validateIdentifier: vi.fn((id: string) => id),
    },
  };
});

vi.mock('../services/NumberingService', () => ({
  NumberingService: {
    nextPlanCode: vi.fn(),
    nextTaskNumber: vi.fn(),
    nextFindingNumber: vi.fn(),
    nextRecommendationNumber: vi.fn(),
    nextEvidenceNumber: vi.fn(),
  },
}));

vi.mock('../services/NotificationService', () => ({
  NotificationService: {
    create: vi.fn().mockResolvedValue(undefined),
    getAdminIds: vi.fn().mockResolvedValue(['admin-id-1']),
  },
}));

vi.mock('../utils/n8nService', () => ({
  N8nService: {
    sendEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/AppCodeGenerator', () => ({
  AppCodeGenerator: {
    generateCode: vi.fn().mockResolvedValue(null),
    generateFindingCode: vi.fn().mockResolvedValue(null),
  },
}));

import { AuditPlanService } from '../services/AuditPlanService';
import { AuditTaskService } from '../services/AuditTaskService';
import { AuditService } from '../services/AuditService';
import { AuditProgramService } from '../services/AuditProgramService';
import { ArchiveService } from '../services/ArchiveService';
import { NumberingService } from '../services/NumberingService';
import { NotificationService } from '../services/NotificationService';
import { N8nService } from '../utils/n8nService';
import { db } from '../db/index';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../utils/errors';

// ─── Test Constants ────────────────────────────────────────────────────────

const mockDb = db as any;
const PLAN_ID = 'plan-uuid-001';
const TASK_ID = 'task-uuid-001';
const FINDING_ID = 'finding-uuid-001';
const REC_ID = 'rec-uuid-001';
const MANAGER_ID = 'manager-uuid-001';
const ADMIN_ID = 'admin-uuid-001';
const AUDITOR_ID = 'auditor-uuid-001';
const VIEWER_ID = 'viewer-uuid-001';
const USER_A_ID = 'user-a-uuid';
const USER_B_ID = 'user-b-uuid';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Audit Workflow Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks completely (clears implementations, return values, and call history)
    mockDb.prepare.mockReset();
    mockDb.transaction.mockReset();
    (NotificationService.create as any).mockReset();
    (NotificationService.getAdminIds as any).mockReset();
    (N8nService.sendEvent as any).mockReset();
    (NumberingService.nextPlanCode as any).mockReset();
    (NumberingService.nextFindingNumber as any).mockReset();
    (NumberingService.nextRecommendationNumber as any).mockReset();
    (NumberingService.nextTaskNumber as any).mockReset();
    (NumberingService.nextEvidenceNumber as any).mockReset();

    // Re-establish default implementations
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({ changes: 0 }),
    });
    mockDb.transaction.mockImplementation((fn: Function) => {
      const wrapper: any = (...args: any[]) => fn(...args);
      const lazyPromise = () => fn();
      wrapper.then = (onFulfilled: any, onRejected: any) =>
        Promise.resolve(lazyPromise()).then(onFulfilled, onRejected);
      wrapper.catch = (onRejected: any) =>
        Promise.resolve(lazyPromise()).catch(onRejected);
      return wrapper;
    });
    (NotificationService.create as any).mockResolvedValue(undefined);
    (NotificationService.getAdminIds as any).mockResolvedValue(['admin-id-1']);
    (N8nService.sendEvent as any).mockResolvedValue(undefined);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Full Lifecycle Test
  // Validates: Requirements 1.1-1.11, 2.1-2.8, 4.1-4.7, 6.1-6.11, 7.1-7.7
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Full lifecycle: plan → tasks → assign → findings → status → close → archive', () => {
    it('should create a plan with fiscal year validation', async () => {
      // canCreateNewPlan: no existing plan for same year
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([]),
      });
      // canCreateNewPlan: no unarchived previous year plan
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([]),
      });
      // INSERT plan
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ lastInsertRowid: PLAN_ID, changes: 1 }),
      });

      (NumberingService.nextPlanCode as any).mockResolvedValue('IA-PL-25-001');

      const result = await AuditPlanService.create('audit_plans', {
        year: 2025,
        title: 'خطة التدقيق 2025',
        department: 'IT',
      });

      expect(result.plan_code).toBe('IA-PL-25-001');
      expect(result.year).toBe(2025);
      expect(result.status).toBe('Planned');
      expect(result.planned_start_date).toBe('2025-01-01');
      expect(result.planned_end_date).toBe('2025-12-31');
      expect(result.is_archived).toBe(false);
      expect(result.quarter).toBe('Annual');
    });

    it('should reject plan creation when same year plan exists', async () => {
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: 'existing-plan' }]),
      });

      await expect(
        AuditPlanService.create('audit_plans', { year: 2025, title: 'Duplicate' })
      ).rejects.toThrow(ConflictError);
    });

    it('should reject plan creation when previous year is not archived', async () => {
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([]),
      });
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: 'prev-plan' }]),
      });

      await expect(
        AuditPlanService.create('audit_plans', { year: 2025, title: 'New Plan' })
      ).rejects.toThrow(ConflictError);
    });

    it('should assign multiple users to a task', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: MANAGER_ID, role: UserRole.MANAGER }),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: TASK_ID }),
      });
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: USER_A_ID }, { id: USER_B_ID }]),
      });
      // Check existing + INSERT for USER_A
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(null),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: 'assign-1', task_id: TASK_ID, user_id: USER_A_ID,
          assigned_at: '2025-01-15', assigned_by: MANAGER_ID,
        }),
      });
      // Check existing + INSERT for USER_B
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(null),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: 'assign-2', task_id: TASK_ID, user_id: USER_B_ID,
          assigned_at: '2025-01-15', assigned_by: MANAGER_ID,
        }),
      });

      const result = await AuditTaskService.assignUsers(
        TASK_ID, [USER_A_ID, USER_B_ID], MANAGER_ID
      );

      expect(result.assignments).toHaveLength(2);
      expect(result.assignments[0].user_id).toBe(USER_A_ID);
      expect(result.assignments[1].user_id).toBe(USER_B_ID);
    });

    it('should create a finding with auto-generated recommendation', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: PLAN_ID, plan_code: 'IA-PL-25-001', department: 'IT', is_archived: false,
        }),
      });

      (NumberingService.nextFindingNumber as any).mockResolvedValue('IA-PL-25-001-F01');
      (NumberingService.nextRecommendationNumber as any).mockResolvedValue('IA-PL-25-001-F01-R01');

      // INSERT finding
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: FINDING_ID }),
      });
      // INSERT recommendation
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: REC_ID }),
      });
      // Manager IDs query for notification
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: MANAGER_ID }]),
      });

      const result = await AuditService.createFinding(
        {
          audit_id: PLAN_ID,
          title: 'ملاحظة اختبارية',
          finding_type: 'control_design_deficiency',
          description: 'وصف الملاحظة',
          risk_level: 'High',
        },
        AUDITOR_ID
      );

      expect(result.findingId).toBe(FINDING_ID);
      expect(result.recommendationId).toBe(REC_ID);
      expect(NumberingService.nextFindingNumber).toHaveBeenCalledWith(PLAN_ID, 'IA-PL-25-001');
      expect(NumberingService.nextRecommendationNumber).toHaveBeenCalledWith(
        FINDING_ID, 'IA-PL-25-001-F01'
      );
    });

    it('should change finding status and sync recommendation', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: FINDING_ID, status: 'Open', title: 'ملاحظة', audit_id: PLAN_ID,
        }),
      });
      // UPDATE finding status
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // UPDATE recommendation status (sync)
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // Manager IDs for notification
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: MANAGER_ID }]),
      });

      const result = await AuditService.changeFindingStatus(
        FINDING_ID, 'In Progress', AUDITOR_ID, UserRole.INTERNAL_AUDITOR
      );

      expect(result.syncSuccess).toBe(true);
    });

    it('should close finding from Pending Approval with APPROVE permission', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: FINDING_ID, status: 'Pending Approval', title: 'ملاحظة', audit_id: PLAN_ID,
        }),
      });
      // UPDATE finding status
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // UPDATE recommendation status (sync: Closed → Implemented)
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // Manager IDs for notification
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: MANAGER_ID }]),
      });

      const result = await AuditService.changeFindingStatus(
        FINDING_ID, 'Closed', MANAGER_ID, UserRole.MANAGER
      );

      expect(result.syncSuccess).toBe(true);
    });

    it('should close plan when all recommendations are closed', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: MANAGER_ID, role: UserRole.MANAGER }),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: PLAN_ID, status: 'Reporting' }),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 0 }),
      });
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });

      const result = await AuditPlanService.closePlan(PLAN_ID, MANAGER_ID);
      expect(result).toEqual({ success: true, planId: PLAN_ID });
    });

    it('should reject plan closure when open recommendations exist', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: MANAGER_ID, role: UserRole.MANAGER }),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: PLAN_ID, status: 'Reporting' }),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 2 }),
      });

      await expect(
        AuditPlanService.closePlan(PLAN_ID, MANAGER_ID)
      ).rejects.toThrow(ValidationError);
    });

    it('should archive plan after closure with all items closed', async () => {
      const closedPlan = {
        id: PLAN_ID, plan_code: 'IA-PL-25-001', title: 'خطة 2025',
        year: 2025, status: 'Closed', is_archived: false,
      };

      // 1. Plan lookup (SELECT * FROM audit_plans WHERE id = ? AND is_archived = false)
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(closedPlan),
      });
      // 2. Open tasks count = 0
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 0 }),
      });
      // 3. Open findings count = 0
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 0 }),
      });
      // 4. Open recommendations count = 0
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 0 }),
      });
      // 5. INSERT archived_plans
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // SELECT tasks for archiving
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: TASK_ID, title: 'Task 1' }]),
      });
      // INSERT archived_tasks (1 task)
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // SELECT findings for archiving
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: FINDING_ID, title: 'Finding 1' }]),
      });
      // INSERT archived_findings (1 finding)
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // SELECT recommendations for archiving
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: REC_ID, finding_id: FINDING_ID }]),
      });
      // INSERT archived_recommendations (1 rec)
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // SELECT evidence for archiving
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([]),
      });
      // Verify archived tasks count
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 1 }),
      });
      // Verify archived findings count
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 1 }),
      });
      // Verify archived recs count
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 1 }),
      });
      // Verify archived evidence count
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 0 }),
      });
      // DELETE evidence
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 0 }),
      });
      // DELETE recommendations
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // DELETE findings
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // DELETE tasks
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // UPDATE plan is_archived = true
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });

      await expect(
        ArchiveService.archivePlan(PLAN_ID, MANAGER_ID, UserRole.MANAGER)
      ).resolves.not.toThrow();

      expect(N8nService.sendEvent).toHaveBeenCalledWith(
        'audit_plan.archived',
        expect.objectContaining({ planId: PLAN_ID })
      );
    });

    it('should reject archive when open items exist', async () => {
      const plan = {
        id: PLAN_ID, plan_code: 'IA-PL-25-001', title: 'خطة 2025',
        year: 2025, status: 'Closed', is_archived: false,
      };

      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(plan),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(plan),
      });
      // Open tasks count = 2
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ count: 2 }),
      });

      await expect(
        ArchiveService.archivePlan(PLAN_ID, MANAGER_ID, UserRole.MANAGER)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject archive of already archived plan', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(null),
      });
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue(null),
      });

      await expect(
        ArchiveService.archivePlan(PLAN_ID, MANAGER_ID, UserRole.MANAGER)
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Permission Enforcement
  // Validates: Requirements 11.1-11.11, 4.5, 5.2, 6.4, 6.7, 6.8, 7.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Permission enforcement across all roles', () => {
    describe('Plan creation - Manager/Admin only', () => {
      it('should allow Manager to create plans', async () => {
        mockDb.prepare.mockReturnValueOnce({ all: vi.fn().mockResolvedValue([]) });
        mockDb.prepare.mockReturnValueOnce({ all: vi.fn().mockResolvedValue([]) });
        mockDb.prepare.mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ lastInsertRowid: PLAN_ID, changes: 1 }),
        });
        (NumberingService.nextPlanCode as any).mockResolvedValue('IA-PL-25-001');

        const result = await AuditPlanService.create('audit_plans', {
          year: 2025, title: 'Plan', department: 'IT',
        });
        expect(result.plan_code).toBe('IA-PL-25-001');
      });
    });

    describe('Task assignment - Manager/Admin only', () => {
      it('should reject task assignment by Internal Auditor', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({ id: AUDITOR_ID, role: UserRole.INTERNAL_AUDITOR }),
        });

        await expect(
          AuditTaskService.assignUsers(TASK_ID, [USER_A_ID], AUDITOR_ID)
        ).rejects.toThrow(ForbiddenError);
      });

      it('should reject task assignment by Viewer', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({ id: VIEWER_ID, role: UserRole.VIEWER }),
        });

        await expect(
          AuditTaskService.assignUsers(TASK_ID, [USER_A_ID], VIEWER_ID)
        ).rejects.toThrow(ForbiddenError);
      });

      it('should reject task unassignment by non-Manager/Admin', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({ id: AUDITOR_ID, role: UserRole.INTERNAL_AUDITOR }),
        });

        await expect(
          AuditTaskService.unassignUser(TASK_ID, USER_A_ID, AUDITOR_ID)
        ).rejects.toThrow(ForbiddenError);
      });

      it('should allow Admin to assign users to tasks', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({ id: ADMIN_ID, role: UserRole.ADMIN }),
        });
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({ id: TASK_ID }),
        });
        mockDb.prepare.mockReturnValueOnce({
          all: vi.fn().mockResolvedValue([{ id: USER_A_ID }]),
        });
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue(null),
        });
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({
            id: 'assign-1', task_id: TASK_ID, user_id: USER_A_ID,
            assigned_at: '2025-01-15', assigned_by: ADMIN_ID,
          }),
        });

        const result = await AuditTaskService.assignUsers(TASK_ID, [USER_A_ID], ADMIN_ID);
        expect(result.assignments).toHaveLength(1);
      });
    });

    describe('Program creation - Internal Auditor only', () => {
      it('should reject program creation by Manager', async () => {
        await expect(
          AuditProgramService.createProgram(
            {
              program_code: 'PRG-001',
              program_title: 'Test Program',
              audit_area: 'IT',
              department: 'IT',
              audit_type: 'Operational',
              audit_objective: 'Test',
              audit_scope: 'Test',
              risk_ids: [],
              compliance_item_ids: [],
            },
            MANAGER_ID,
            UserRole.MANAGER
          )
        ).rejects.toThrow(ForbiddenError);
      });

      it('should reject program creation by Admin', async () => {
        await expect(
          AuditProgramService.createProgram(
            {
              program_code: 'PRG-001',
              program_title: 'Test Program',
              audit_area: 'IT',
              department: 'IT',
              audit_type: 'Operational',
              audit_objective: 'Test',
              audit_scope: 'Test',
              risk_ids: [],
              compliance_item_ids: [],
            },
            ADMIN_ID,
            UserRole.ADMIN
          )
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe('Finding edit ownership - creator only', () => {
      it('should reject edit by non-creator', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({
            id: FINDING_ID, created_by: AUDITOR_ID, status: 'Open',
          }),
        });

        await expect(
          AuditService.updateFinding(FINDING_ID, { title: 'Updated' }, MANAGER_ID)
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe('Finding status: Pending Approval → Closed requires APPROVE', () => {
      it('should reject closure by Internal Auditor (no APPROVE)', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({
            id: FINDING_ID, status: 'Pending Approval', title: 'Test',
          }),
        });

        await expect(
          AuditService.changeFindingStatus(
            FINDING_ID, 'Closed', AUDITOR_ID, UserRole.INTERNAL_AUDITOR
          )
        ).rejects.toThrow(ForbiddenError);
      });

      it('should reject closure by Viewer (no APPROVE)', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({
            id: FINDING_ID, status: 'Pending Approval', title: 'Test',
          }),
        });

        await expect(
          AuditService.changeFindingStatus(
            FINDING_ID, 'Closed', VIEWER_ID, UserRole.VIEWER
          )
        ).rejects.toThrow(ForbiddenError);
      });

      it('should allow Manager to close from Pending Approval', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({
            id: FINDING_ID, status: 'Pending Approval', title: 'Test', audit_id: PLAN_ID,
          }),
        });
        mockDb.prepare.mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ changes: 1 }),
        });
        mockDb.prepare.mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ changes: 1 }),
        });
        mockDb.prepare.mockReturnValueOnce({
          all: vi.fn().mockResolvedValue([{ id: MANAGER_ID }]),
        });

        const result = await AuditService.changeFindingStatus(
          FINDING_ID, 'Closed', MANAGER_ID, UserRole.MANAGER
        );
        expect(result.syncSuccess).toBe(true);
      });
    });

    describe('Plan closure - Manager/Admin only', () => {
      it('should reject plan closure by Internal Auditor', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({ id: AUDITOR_ID, role: UserRole.INTERNAL_AUDITOR }),
        });

        await expect(
          AuditPlanService.closePlan(PLAN_ID, AUDITOR_ID)
        ).rejects.toThrow(ForbiddenError);
      });

      it('should reject plan closure by Viewer', async () => {
        mockDb.prepare.mockReturnValueOnce({
          get: vi.fn().mockResolvedValue({ id: VIEWER_ID, role: UserRole.VIEWER }),
        });

        await expect(
          AuditPlanService.closePlan(PLAN_ID, VIEWER_ID)
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe('Archive - Manager/Admin only', () => {
      it('should reject archive by Internal Auditor', async () => {
        await expect(
          ArchiveService.archivePlan(PLAN_ID, AUDITOR_ID, UserRole.INTERNAL_AUDITOR)
        ).rejects.toThrow(ForbiddenError);
      });

      it('should reject archive by Compliance Officer', async () => {
        await expect(
          ArchiveService.archivePlan(PLAN_ID, VIEWER_ID, UserRole.COMPLIANCE_OFFICER)
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe('Manual recommendation creation - blocked for all roles', () => {
      it('should verify no role has CREATE permission on Recommendations', () => {
        const allRoles = Object.keys(DEFAULT_PERMISSIONS);
        for (const role of allRoles) {
          const recPermissions = (DEFAULT_PERMISSIONS as any)[role][MODULES.RECOMMENDATIONS] || [];
          expect(recPermissions).not.toContain(PERMISSIONS.CREATE);
        }
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Notification Delivery
  // Validates: Requirements 4.3, 5.5, 7.1, 10.1, 10.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Notification delivery for all event types', () => {
    it('should call NotificationService.create on finding creation', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: PLAN_ID, plan_code: 'IA-PL-25-001', department: 'IT', is_archived: false,
        }),
      });

      (NumberingService.nextFindingNumber as any).mockResolvedValue('IA-PL-25-001-F01');
      (NumberingService.nextRecommendationNumber as any).mockResolvedValue('IA-PL-25-001-F01-R01');

      // INSERT finding
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: FINDING_ID }),
      });
      // INSERT recommendation
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: REC_ID }),
      });
      // Manager IDs for notification
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: MANAGER_ID }]),
      });

      const result = await AuditService.createFinding(
        {
          audit_id: PLAN_ID,
          title: 'New Finding',
          finding_type: 'operational_design_deficiency',
          description: 'Desc',
          risk_level: 'Medium',
        },
        AUDITOR_ID
      );

      // Verify finding was created successfully (notification is in try/catch)
      expect(result.findingId).toBe(FINDING_ID);
      // Verify NotificationService was called
      expect(NotificationService.create).toHaveBeenCalled();
      expect(NotificationService.getAdminIds).toHaveBeenCalled();
    });

    it('should call NotificationService.create on finding status change', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: FINDING_ID, status: 'Open', title: 'Test Finding', audit_id: PLAN_ID,
        }),
      });
      // UPDATE finding status
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // UPDATE recommendation status (sync)
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      });
      // Manager IDs for notification
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: MANAGER_ID }]),
      });

      const result = await AuditService.changeFindingStatus(
        FINDING_ID, 'In Progress', AUDITOR_ID, UserRole.INTERNAL_AUDITOR
      );

      expect(result.syncSuccess).toBe(true);
      // Verify notification was sent
      expect(NotificationService.create).toHaveBeenCalled();
      expect(NotificationService.getAdminIds).toHaveBeenCalled();
    });

    it('should call NotificationService.create on program creation', async () => {
      // INSERT program
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: 'program-uuid-001' }),
      });
      // Manager/Admin IDs for notification
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([{ id: MANAGER_ID }, { id: ADMIN_ID }]),
      });

      const result = await AuditProgramService.createProgram(
        {
          program_code: 'PRG-001',
          program_title: 'Test Program',
          audit_area: 'IT',
          department: 'IT',
          audit_type: 'Operational',
          audit_objective: 'Test objective',
          audit_scope: 'Test scope',
          risk_ids: [],
          compliance_item_ids: [],
        },
        AUDITOR_ID,
        UserRole.INTERNAL_AUDITOR
      );

      expect(result.programId).toBe('program-uuid-001');
      expect(NotificationService.create).toHaveBeenCalled();
    });

    it('should send n8n automation event on finding creation', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          id: PLAN_ID, plan_code: 'IA-PL-25-001', department: 'IT', is_archived: false,
        }),
      });

      (NumberingService.nextFindingNumber as any).mockResolvedValue('IA-PL-25-001-F02');
      (NumberingService.nextRecommendationNumber as any).mockResolvedValue('IA-PL-25-001-F02-R01');

      // INSERT finding
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: 'finding-2' }),
      });
      // INSERT recommendation
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({ id: 'rec-2' }),
      });
      // Manager IDs for notification
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([]),
      });

      const result = await AuditService.createFinding(
        {
          audit_id: PLAN_ID,
          title: 'Another Finding',
          finding_type: 'control_design_deficiency',
          description: 'Desc',
          risk_level: 'Critical',
        },
        AUDITOR_ID
      );

      expect(result.findingId).toBe('finding-2');
      expect(N8nService.sendEvent).toHaveBeenCalledWith(
        'finding.created',
        expect.objectContaining({
          findingId: 'finding-2',
          title: 'Another Finding',
          auditId: PLAN_ID,
          riskLevel: 'Critical',
          findingType: 'control_design_deficiency',
        })
      );
    });
  });
});
