import api from './api';

interface UserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
  department?: string;
}

interface LoginHistoryParams {
  page?: number;
  pageSize?: number;
  userId?: string;
  status?: string;
}

interface AuditTrailParams {
  page?: number;
  pageSize?: number;
  module?: string;
  action?: string;
  username?: string;
}

interface CreateUserData {
  username: string;
  password: string;
  name: string;
  email: string;
  department?: string;
  role: string;
  job_title_id?: string;
  unit?: string;
  reporting_manager_id?: string;
  access_scope?: string;
  phone_number?: string;
  notes?: string;
  status?: string;
}

interface ResetPasswordData {
  newPassword: string;
}

interface ApproveResetData {
  requestId: string;
  action: 'approve' | 'reject';
  tempPassword?: string;
}

interface UpdatePermissionsData {
  permissionIds: string[];
}

interface UserManagementSettings {
  failed_login_threshold?: number;
  inactive_account_threshold_days?: number;
  password_min_length?: number;
  password_require_uppercase?: number;
  password_require_lowercase?: number;
  password_require_numbers?: number;
  password_require_symbols?: number;
  password_expiry_days?: number;
  enforce_single_session?: number;
  session_timeout_minutes?: number;
}

export const userService = {
  init: async () => {
    const response = await api.get('/users/init');
    return response.data;
  },
  getUsers: async (params: UserListParams) => {
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
  getLoginHistory: async (params: LoginHistoryParams) => {
    const response = await api.get('/login-history', { params });
    return response.data;
  },
  getAuditTrail: async (params: AuditTrailParams) => {
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
  createUser: async (data: CreateUserData) => {
    const response = await api.post('/users', data);
    return response.data;
  },
  updateUser: async (id: string | number, data: Partial<CreateUserData>) => {
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
  resetPassword: async (id: string | number, data: ResetPasswordData) => {
    const response = await api.post(`/users/${id}/reset-password`, data);
    return response.data;
  },
  unlockUser: async (id: string | number) => {
    const response = await api.post(`/users/${id}/unlock`);
    return response.data;
  },
  approveReset: async (data: ApproveResetData) => {
    const response = await api.post('/auth/approve-reset', data);
    return response.data;
  },
  updateRolePermissions: async (roleId: string | number, data: UpdatePermissionsData) => {
    const response = await api.post(`/roles/${roleId}/permissions`, data);
    return response.data;
  },
  updateSettings: async (data: UserManagementSettings) => {
    const response = await api.put('/user-management-settings', data);
    return response.data;
  },
  revokeSession: async (sessionId: string | number) => {
    const response = await api.delete(`/user-sessions/${sessionId}`);
    return response.data;
  }
};
