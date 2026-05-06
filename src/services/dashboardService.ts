import api from './api';

export const dashboardService = {
  getStats: async (department?: string) => {
    const response = await api.get('/dashboard-stats', {
      params: { department: department === 'all' ? undefined : department }
    });
    return response.data;
  }
};
