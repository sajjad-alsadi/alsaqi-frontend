import api from '../../../services/api';
import { AuditReport, AuditPlan, AuditFinding } from '../../../types';
import { ExecData } from '../types';

export const fetchReports = async (): Promise<AuditReport[]> => {
  const res = await api.get('/audit-reports');
  return res.data.data || (Array.isArray(res.data) ? res.data : []);
};

export const fetchAudits = async (): Promise<AuditPlan[]> => {
  const res = await api.get('/audit-plans');
  return res.data.data || (Array.isArray(res.data) ? res.data : []);
};

export const fetchExecData = async (): Promise<ExecData> => {
  const res = await api.get('/executive-summary');
  return res.data;
};

export const fetchAuditFindings = async (auditId: string | number): Promise<AuditFinding[]> => {
  const res = await api.get('/audit-findings');
  const allFindings: AuditFinding[] = res.data;
  return allFindings.filter(f => String(f.audit_id) === String(auditId));
};

export const deleteReport = async (id: string | number): Promise<void> => {
  await api.delete(`/audit-reports/${id}`);
};

export const saveReport = async (report: Partial<AuditReport>): Promise<void> => {
  await api.post('/audit-reports', report);
};
