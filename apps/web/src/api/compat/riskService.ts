import api from '../httpClient';

interface RiskListParams {
  page?: number;
  pageSize?: number;
  type?: string;
  rating?: string;
  status?: string;
  search?: string;
}

interface RiskData {
  risk_id?: string;
  description?: string;
  owner?: string;
  source?: string;
  early_warning?: string;
  type?: string;
  likelihood?: string;
  impact?: string;
  score?: number;
  rating?: string;
  controls?: string;
  control_assessment?: string;
  mitigation?: string;
  treatment_option?: string;
  residual_likelihood?: string;
  residual_impact?: string;
  residual_score?: number;
  residual_rating?: string;
  status?: string;
  target_date?: string;
  review_date?: string;
  notes?: string;
}

export const riskService = {
  getRisks: async (params: RiskListParams = {}) => {
    const response = await api.get('/risk-register', { params });
    return response.data;
  },
  createRisk: async (data: RiskData) => {
    const response = await api.post('/risk-register', data);
    return response.data;
  },
  updateRisk: async (id: string | number, data: Partial<RiskData>) => {
    const response = await api.put(`/risk-register/${id}`, data);
    return response.data;
  },
  deleteRisk: async (id: string | number) => {
    const response = await api.delete(`/risk-register/${id}`);
    return response.data;
  }
};
