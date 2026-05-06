import api from './api';

export const auditService = {
  getPlans: async (params: any) => {
    const response = await api.get('/audit-plans', { params });
    return response.data;
  },
  createPlan: async (data: any) => {
    const response = await api.post('/audit-plans', data);
    return response.data;
  },
  updatePlan: async (id: string | number, data: any) => {
    const response = await api.put(`/audit-plans/${id}`, data);
    return response.data;
  },
  deletePlan: async (id: string | number) => {
    const response = await api.delete(`/audit-plans/${id}`);
    return response.data;
  },
  getFindings: async (params: any) => {
    const response = await api.get('/audit-findings', { params });
    return response.data;
  },
  createFinding: async (data: any) => {
    const response = await api.post('/audit-findings', data);
    return response.data;
  },
  updateFinding: async (id: string | number, data: any) => {
    const response = await api.put(`/audit-findings/${id}`, data);
    return response.data;
  },
  deleteFinding: async (id: string | number) => {
    const response = await api.delete(`/audit-findings/${id}`);
    return response.data;
  }
};
