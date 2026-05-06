import api from './api';

export const userService = {
  init: async () => {
    const response = await api.get('/users/init');
    return response.data;
  },
  getUsers: async (params: any) => {
    const response = await api.get('/users', { params });
    return response.data;
  },
  getSummary: async () => {
    const response = await api.get('/users/summary');
    return response.data;
  },
  getRoles: async () => {
    const response = await api.get('/roles');
    return response.data;
  },
  getPermissions: async () => {
    const response = await api.get('/permissions');
    return response.data;
  },
  getSessions: async () => {
    const response = await api.get('/user-sessions');
    return response.data;
  },
  getSettings: async () => {
    const response = await api.get('/user-management-settings');
    return response.data;
  },
  getLoginHistory: async (params: any) => {
    const response = await api.get('/login-history', { params });
    return response.data;
  },
  getAuditTrail: async (params: any) => {
    const response = await api.get('/audit-trail', { params });
    return response.data;
  },
  getDepartments: async () => {
    const response = await api.get('/departments');
    return response.data;
  },
  getJobTitles: async () => {
    const response = await api.get('/job-titles');
    return response.data;
  },
  getResetRequests: async () => {
    const response = await api.get('/auth/reset-requests');
    return response.data;
  },
  createUser: async (data: any) => {
    const response = await api.post('/users', data);
    return response.data;
  },
  updateUser: async (id: string | number, data: any) => {
    const response = await api.put(`/users/${id}`, data);
    return response.data;
  },
  deleteUser: async (id: string | number) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },
  suspendUser: async (id: string | number) => {
    const response = await api.post(`/users/${id}/suspend`);
    return response.data;
  },
  resetPassword: async (id: string | number, data: any) => {
    const response = await api.post(`/users/${id}/reset-password`, data);
    return response.data;
  },
  unlockUser: async (id: string | number) => {
    const response = await api.post(`/users/${id}/unlock`);
    return response.data;
  },
  approveReset: async (data: any) => {
    const response = await api.post('/auth/approve-reset', data);
    return response.data;
  },
  updateRolePermissions: async (roleId: string | number, data: any) => {
    const response = await api.post(`/roles/${roleId}/permissions`, data);
    return response.data;
  },
  updateSettings: async (data: any) => {
    const response = await api.put('/user-management-settings', data);
    return response.data;
  },
  revokeSession: async (sessionId: string | number) => {
    const response = await api.delete(`/user-sessions/${sessionId}`);
    return response.data;
  }
};
