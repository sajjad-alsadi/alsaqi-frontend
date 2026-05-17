import { secureStore } from '../utils/SecureStorage';

export interface ContactAdminRequest {
  id?: string;
  fullName: string;
  contactInfo: string;
  requestType: string;
  requestDetails: string;
  status?: 'pending' | 'resolved' | 'rejected';
  createdAt?: string;
  ticketId?: string;
}

export interface ContactAdminResponse {
  success: boolean;
  message?: string;
  ticketId?: string;
}

const STORAGE_KEY = 'alsaqi_support_requests';

export const getContactAdminRequests = async (): Promise<ContactAdminRequest[]> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  const stored = await secureStore.get(STORAGE_KEY);
  if (stored) {
    return stored as ContactAdminRequest[];
  }
  return [];
};

export const updateContactAdminRequestStatus = async (id: string, status: 'resolved' | 'rejected'): Promise<boolean> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  const stored = await secureStore.get(STORAGE_KEY);
  if (stored) {
    const requests: ContactAdminRequest[] = stored;
    const updated = requests.map(req => req.id === id ? { ...req, status } : req);
    await secureStore.set(STORAGE_KEY, updated);
    return true;
  }
  return false;
};

export const submitContactAdminRequest = async (
  requestData: ContactAdminRequest
): Promise<ContactAdminResponse> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Basic validation on the server side (mock)
  if (!requestData.fullName || !requestData.contactInfo || !requestData.requestType || !requestData.requestDetails) {
    return {
      success: false,
      message: 'Missing required fields',
    };
  }

  const ticketId = `REQ-${crypto.getRandomValues(new Uint16Array(1))[0].toString().padStart(5, '0')}`;
  const newRequest: ContactAdminRequest = {
    ...requestData,
    id: crypto.getRandomValues(new Uint32Array(2)).reduce((s, v) => s + v.toString(36), '').slice(0, 12),
    ticketId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  const stored = await secureStore.get(STORAGE_KEY);
  const requests = stored ? (stored as ContactAdminRequest[]) : [];
  requests.unshift(newRequest);
  await secureStore.set(STORAGE_KEY, requests);

  return {
    success: true,
    ticketId,
  };
};
