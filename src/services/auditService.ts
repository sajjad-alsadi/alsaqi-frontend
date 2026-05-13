import api from './api';

interface PlanListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  department?: string;
  type?: string;
  search?: string;
}

interface PlanData {
  title: string;
  department?: string;
  type?: string;
  risk_rating?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  status?: string;
  lead_auditor?: string;
  team_members?: string;
  objectives?: string;
  scope?: string;
  notes?: string;
  program_id?: string;
}

interface FindingListParams {
  page?: number;
  pageSize?: number;
  audit_id?: string;
  risk_level?: string;
  status?: string;
  search?: string;
}

interface FindingData {
  audit_id?: string;
  title: string;
  description?: string;
  criteria?: string;
  condition?: string;
  cause?: string;
  consequence?: string;
  recommendation?: string;
  risk_level?: string;
  status?: string;
  finding_type?: string;
  impact?: string;
  root_cause?: string;
  responsible_unit_id?: string;
}

export const auditService = {
  getPlans: async (params: PlanListParams) => {
    const response = await api.get('/audit-plans', { params });
    return response.data;
  },
  createPlan: async (data: PlanData) => {
    const response = await api.post('/audit-plans', data);
    return response.data;
  },
  updatePlan: async (id: string | number, data: Partial<PlanData>) => {
    const response = await api.put(`/audit-plans/${id}`, data);
    return response.data;
  },
  deletePlan: async (id: string | number) => {
    const response = await api.delete(`/audit-plans/${id}`);
    return response.data;
  },
  getFindings: async (params: FindingListParams) => {
    const response = await api.get('/audit-findings', { params });
    return response.data;
  },
  createFinding: async (data: FindingData) => {
    const response = await api.post('/audit-findings', data);
    return response.data;
  },
  updateFinding: async (id: string | number, data: Partial<FindingData>) => {
    const response = await api.put(`/audit-findings/${id}`, data);
    return response.data;
  },
  deleteFinding: async (id: string | number) => {
    const response = await api.delete(`/audit-findings/${id}`);
    return response.data;
  }
};
