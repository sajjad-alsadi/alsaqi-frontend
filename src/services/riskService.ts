import api from './api';

export const riskService = {
  getRisks: async (params: any = {}) => {
    const response = await api.get('/risk-register', { params });
    return response.data;
  },
  createRisk: async (data: any) => {
    const response = await api.post('/risk-register', data);
    return response.data;
  },
  updateRisk: async (id: string | number, data: any) => {
    const response = await api.put(`/risk-register/${id}`, data);
    return response.data;
  },
  deleteRisk: async (id: string | number) => {
    const response = await api.delete(`/risk-register/${id}`);
    return response.data;
  }
};
