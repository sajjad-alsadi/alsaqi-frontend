import api from './api';

export const correspondenceService = {
  getStats: async () => {
    const response = await api.get('/correspondence/stats');
    return response.data;
  },
  getIncoming: async (params: any) => {
    const response = await api.get('/correspondence/incoming', { params });
    return response.data;
  },
  getOutgoing: async (params: any) => {
    const response = await api.get('/correspondence/outgoing', { params });
    return response.data;
  },
  getArchive: async (params: any) => {
    const response = await api.get('/correspondence/archive', { params });
    return response.data;
  },
  getDetails: async (type: string, id: number) => {
    const response = await api.get(`/correspondence/details/${type}/${id}`);
    return response.data;
  },
  createIncoming: async (data: any) => {
    const response = await api.post('/correspondence/incoming', data);
    return response.data;
  },
  createOutgoing: async (data: any) => {
    const response = await api.post('/correspondence/outgoing', data);
    return response.data;
  },
  updateIncoming: async (id: number, data: any) => {
    const response = await api.put(`/correspondence/incoming/${id}`, data);
    return response.data;
  },
  updateOutgoing: async (id: number, data: any) => {
    const response = await api.put(`/correspondence/outgoing/${id}`, data);
    return response.data;
  },
  deleteIncoming: async (id: number) => {
    const response = await api.delete(`/correspondence/incoming/${id}`);
    return response.data;
  },
  deleteOutgoing: async (id: number) => {
    const response = await api.delete(`/correspondence/outgoing/${id}`);
    return response.data;
  },
  archiveIncoming: async (id: number) => {
    const response = await api.put(`/correspondence/archive/incoming/${id}`);
    return response.data;
  },
  archiveOutgoing: async (id: number) => {
    const response = await api.put(`/correspondence/archive/outgoing/${id}`);
    return response.data;
  }
};
