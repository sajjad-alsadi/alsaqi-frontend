import { describe, it, expect } from 'vitest';
import {
  createUser,
  createAuditPlan,
  createAuditTask,
  createAuditFinding,
  createRisk,
  createCorrespondence,
  createNotification,
  createComplianceItem,
  createRecommendation,
} from './index';

describe('Test Data Factories', () => {
  describe('createUser', () => {
    it('should create a user with default values', () => {
      const user = createUser();
      expect(user.id).toBeDefined();
      expect(user.username).toContain('user_');
      expect(user.email).toContain('@test.com');
      expect(user.role).toBe('Internal Auditor');
      expect(user.status).toBe('Active');
      expect(user.failed_attempts).toBe(0);
      expect(user.locked_until).toBeNull();
      expect(user.session_version).toBe(1);
    });

    it('should accept overrides', () => {
      const user = createUser({ role: 'Admin', status: 'Disabled' });
      expect(user.role).toBe('Admin');
      expect(user.status).toBe('Disabled');
    });
  });

  describe('createAuditPlan', () => {
    it('should create an audit plan with default values', () => {
      const plan = createAuditPlan();
      expect(plan.id).toBeDefined();
      expect(plan.plan_code).toMatch(/^IA-PL-\d{2}-001$/);
      expect(plan.type).toBe('Financial');
      expect(plan.status).toBe('Planned');
      expect(plan.risk_rating).toBe('High');
    });

    it('should accept overrides', () => {
      const plan = createAuditPlan({ status: 'Fieldwork', type: 'IT' });
      expect(plan.status).toBe('Fieldwork');
      expect(plan.type).toBe('IT');
    });
  });

  describe('createAuditTask', () => {
    it('should create an audit task with default values', () => {
      const task = createAuditTask();
      expect(task.id).toBeDefined();
      expect(task.task_number).toMatch(/^IA-TSK-\d{2}-001$/);
      expect(task.status).toBe('draft');
      expect(task.audit_type).toBe('Financial');
    });

    it('should accept overrides', () => {
      const task = createAuditTask({ status: 'in_progress' });
      expect(task.status).toBe('in_progress');
    });
  });

  describe('createAuditFinding', () => {
    it('should create an audit finding with default values', () => {
      const finding = createAuditFinding();
      expect(finding.id).toBeDefined();
      expect(finding.audit_id).toBeDefined();
      expect(finding.risk_level).toBe('High');
      expect(finding.status).toBe('Open');
    });

    it('should accept overrides', () => {
      const finding = createAuditFinding({ risk_level: 'Low', status: 'Closed' });
      expect(finding.risk_level).toBe('Low');
      expect(finding.status).toBe('Closed');
    });
  });

  describe('createRisk', () => {
    it('should create a risk item with default values', () => {
      const risk = createRisk();
      expect(risk.id).toBeDefined();
      expect(risk.risk_id).toMatch(/^RR-\d{2}-001$/);
      expect(risk.rating).toBe('High');
      expect(risk.status).toBe('Active');
      expect(risk.score).toBe(12);
    });

    it('should accept overrides', () => {
      const risk = createRisk({ status: 'Mitigated', score: 4 });
      expect(risk.status).toBe('Mitigated');
      expect(risk.score).toBe(4);
    });
  });

  describe('createCorrespondence', () => {
    it('should create incoming correspondence by default', () => {
      const corr = createCorrespondence();
      expect(corr.id).toBeDefined();
      expect(corr.type).toBe('Incoming');
      expect(corr.sender_entity).toBeDefined();
      expect(corr.status).toBe('Received');
    });

    it('should create outgoing correspondence when specified', () => {
      const corr = createCorrespondence({ type: 'Outgoing' });
      expect(corr.type).toBe('Outgoing');
      expect(corr.recipient_entity).toBeDefined();
      expect(corr.status).toBe('Registered');
    });

    it('should accept overrides', () => {
      const corr = createCorrespondence({ priority: 'Urgent', classification: 'Compliance' });
      expect(corr.priority).toBe('Urgent');
      expect(corr.classification).toBe('Compliance');
    });
  });

  describe('createNotification', () => {
    it('should create a notification with default values', () => {
      const notif = createNotification();
      expect(notif.id).toBeDefined();
      expect(notif.event_type).toBe('record_created');
      expect(notif.is_read).toBe(false);
      expect(notif.status).toBe('Unread');
      expect(notif.related_module).toBe('Audit');
    });

    it('should accept overrides', () => {
      const notif = createNotification({ is_read: true, status: 'Read' });
      expect(notif.is_read).toBe(true);
      expect(notif.status).toBe('Read');
    });
  });

  describe('createComplianceItem', () => {
    it('should create a compliance item with default values', () => {
      const item = createComplianceItem();
      expect(item.id).toBeDefined();
      expect(item.ref_number).toMatch(/^CMP-\d{2}-001$/);
      expect(item.source_type).toBe('cbi_instruction');
      expect(item.compliance_status).toBe('compliant');
      expect(item.maturity_score).toBe(4);
    });

    it('should accept overrides', () => {
      const item = createComplianceItem({ compliance_status: 'non_compliant', maturity_score: 1 });
      expect(item.compliance_status).toBe('non_compliant');
      expect(item.maturity_score).toBe(1);
    });
  });

  describe('createRecommendation', () => {
    it('should create a recommendation with default values', () => {
      const rec = createRecommendation();
      expect(rec.id).toBeDefined();
      expect(rec.finding_id).toBeDefined();
      expect(rec.status).toBe('Open');
      expect(rec.risk_level).toBe('High');
    });

    it('should accept overrides', () => {
      const rec = createRecommendation({ status: 'Implemented', risk_level: 'Low' });
      expect(rec.status).toBe('Implemented');
      expect(rec.risk_level).toBe('Low');
    });
  });
});
