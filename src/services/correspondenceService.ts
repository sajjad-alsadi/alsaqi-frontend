import api from './api';

interface CorrespondenceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  type?: string;
}

interface IncomingData {
  letter_number?: string;
  sender_entity: string;
  sender_entity_type?: string;
  subject: string;
  letter_date: string;
  receipt_date?: string;
  classification?: string;
  priority?: string;
  method?: string;
  receiving_dept_id?: number;
  assigned_dept_id?: number;
  assigned_user_id?: number;
  follow_up_required?: boolean;
  follow_up_date?: string;
  response_required?: boolean;
  response_due_date?: string;
  notes?: string;
}

interface OutgoingData {
  letter_date: string;
  recipient_entity: string;
  subject: string;
  classification: string;
  sending_method: string;
  attachment_file?: File;
}

export const correspondenceService = {
  getStats: async () => {
    const response = await api.get('/correspondence/stats');
    return response.data;
  },
  getIncoming: async (params: CorrespondenceListParams) => {
    const response = await api.get('/correspondence/incoming', { params });
    return response.data;
  },
  getOutgoing: async (params: CorrespondenceListParams) => {
    const response = await api.get('/correspondence/outgoing', { params });
    return response.data;
  },
  getArchive: async (params: CorrespondenceListParams) => {
    const response = await api.get('/correspondence/archive', { params });
    return response.data;
  },
  getDetails: async (type: string, id: number) => {
    const response = await api.get(`/correspondence/details/${type}/${id}`);
    return response.data;
  },
  createIncoming: async (data: IncomingData) => {
    const response = await api.post('/correspondence/incoming', data);
    return response.data;
  },
  createOutgoing: async (data: OutgoingData | FormData) => {
    const response = await api.post('/correspondence/outgoing', data);
    return response.data;
  },
  updateIncoming: async (id: number, data: Partial<IncomingData>) => {
    const response = await api.put(`/correspondence/incoming/${id}`, data);
    return response.data;
  },
  updateOutgoing: async (id: number, data: Partial<OutgoingData> | FormData) => {
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
