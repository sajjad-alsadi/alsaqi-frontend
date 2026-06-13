// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock dependencies
vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatDate: (d: string) => d || '',
    formatNumber: (n: number) => String(n),
    formatDateTime: (d: string) => d || 'Never',
    translateStatus: (s: string) => s,
    translateName: (n: string) => n,
  }),
}));

vi.mock('../../context/PreferencesContext', () => ({
  usePreferences: () => ({ language: 'en', theme: 'light' }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../api', () => ({
  api: {
    users: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userManagement: {
      init: vi.fn().mockResolvedValue({}),
      getSummary: vi.fn(),
      getRoles: vi.fn(),
      getPermissions: vi.fn(),
      getSessions: vi.fn(),
      getSettings: vi.fn(),
      getLoginHistory: vi.fn(),
      getAuditTrail: vi.fn(),
      getJobTitles: vi.fn(),
      getResetRequests: vi.fn(),
      suspendUser: vi.fn(),
      unlockUser: vi.fn(),
      resetPassword: vi.fn(),
      updateRolePermissions: vi.fn(),
      updateSettings: vi.fn(),
      revokeSession: vi.fn(),
      approveReset: vi.fn(),
    },
    departments: {
      list: vi.fn(),
    },
  },
}));

vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../utils/errorService', () => ({
  extractErrorMessage: (err: any, fallback: string) => fallback,
}));

const mockUseUserManagement = vi.fn();
vi.mock('../../api/hooks/useUserManagement', () => ({
  useUserManagement: (...args: any[]) => mockUseUserManagement(...args),
}));

const mockUseDebounce = vi.fn((value: string) => value);
vi.mock('../../hooks/useDebounce', () => ({
  useDebounce: (...args: [string]) => mockUseDebounce(...args),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icon = React.forwardRef((props: any, ref: any) => React.createElement('svg', { ...props, ref }));
  return {
    Mail: icon, Shield: icon, Building: icon, Edit: icon, Trash2: icon, Unlock: icon,
    Users: icon, Settings: icon, Key: icon, Clock: icon, Search: icon, Plus: icon,
    Download: icon, Filter: icon, UserPlus: icon, RefreshCw: icon, Activity: icon,
    AlertCircle: icon, CheckCircle: icon, XCircle: icon, Lock: icon,
  };
});

// Override the global react-i18next mock to add i18n.dir()
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn(), dir: () => 'ltr' },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  Trans: ({ children }: any) => children,
}));

// Mock sub-components
vi.mock('../UserManagement/UserManagementHeader', () => ({
  default: ({ activeTab, searchTerm, onTabChange, onSearchChange, onExport, onAddUser, resetRequestsCount }: any) => 
    React.createElement('div', { 'data-testid': 'user-management-header' },
      React.createElement('input', { 
        placeholder: 'userManagement.search', 
        value: searchTerm, 
        onChange: (e: any) => onSearchChange(e.target.value) 
      }),
      React.createElement('button', { onClick: onAddUser, 'data-testid': 'add-user-btn' }, 'userManagement.addUser'),
      React.createElement('button', { onClick: onExport, 'data-testid': 'export-btn' }, 'userManagement.export'),
      React.createElement('button', { onClick: () => onTabChange('users'), 'data-testid': 'tab-users' }, 'userManagement.users'),
      React.createElement('button', { onClick: () => onTabChange('roles'), 'data-testid': 'tab-roles' }, 'userManagement.roles'),
      React.createElement('button', { onClick: () => onTabChange('sessions'), 'data-testid': 'tab-sessions' }, 'userManagement.sessions'),
      resetRequestsCount > 0 && React.createElement('span', { 'data-testid': 'reset-badge' }, resetRequestsCount)
    ),
}));

vi.mock('../UserManagement/UserSummaryCards', () => ({
  default: ({ summary }: any) => 
    React.createElement('div', { 'data-testid': 'user-summary-cards' },
      React.createElement('span', null, `Total: ${summary.total}`),
      React.createElement('span', null, `Active: ${summary.active}`),
      React.createElement('span', null, `Suspended: ${summary.suspended}`)
    ),
}));

vi.mock('../UserManagement/UserList', () => ({
  default: ({ users, getRoleLabel, onEdit, onSuspend, onDelete, onResetPassword, onUnlock }: any) => 
    React.createElement('div', { 'data-testid': 'user-list' },
      users.map((user: any) => 
        React.createElement('div', { key: user.id, 'data-testid': `user-card-${user.id}` },
          React.createElement('span', { 'data-testid': `user-name-${user.id}` }, user.name),
          React.createElement('span', { 'data-testid': `user-role-${user.id}` }, getRoleLabel(user.role)),
          React.createElement('span', { 'data-testid': `user-status-${user.id}` }, user.status),
          React.createElement('button', { onClick: () => onEdit(user), 'data-testid': `edit-${user.id}` }, 'Edit'),
          React.createElement('button', { onClick: () => onSuspend(user.id), 'data-testid': `suspend-${user.id}` }, 'Suspend'),
          React.createElement('button', { onClick: () => onDelete(user.id), 'data-testid': `delete-${user.id}` }, 'Delete'),
          React.createElement('button', { onClick: () => onResetPassword(user.id), 'data-testid': `reset-${user.id}` }, 'Reset Password'),
          user.status === 'Locked' && React.createElement('button', { onClick: () => onUnlock(user.id), 'data-testid': `unlock-${user.id}` }, 'Unlock')
        )
      )
    ),
}));

vi.mock('../UserManagement/UserForm', () => ({
  default: ({ editingUser, onCancel, onSave }: any) => 
    React.createElement('div', { 'data-testid': 'user-form' },
      React.createElement('span', null, editingUser ? 'Edit User' : 'Add User'),
      React.createElement('button', { onClick: onSave, 'data-testid': 'save-user-btn' }, 'Save'),
      React.createElement('button', { onClick: onCancel, 'data-testid': 'cancel-user-btn' }, 'Cancel')
    ),
}));

vi.mock('../UserManagement/RolePermissions', () => ({
  default: ({ allRoles, onSave }: any) => 
    React.createElement('div', { 'data-testid': 'role-permissions' }, 'Role Permissions'),
}));

vi.mock('../UserManagement/ResetRequests', () => ({
  default: ({ requests, onApprove }: any) => 
    React.createElement('div', { 'data-testid': 'reset-requests' }, `Requests: ${requests.length}`),
}));

vi.mock('../UserManagement/SupportRequests', () => ({
  default: () => React.createElement('div', { 'data-testid': 'support-requests' }, 'Support Requests'),
}));

vi.mock('../UserManagement/UserSessions', () => ({
  default: ({ sessions, onRevoke }: any) => 
    React.createElement('div', { 'data-testid': 'user-sessions' }, `Sessions: ${sessions.length}`),
}));

vi.mock('../UserManagement/HistoryLogs', () => ({
  default: () => React.createElement('div', { 'data-testid': 'history-logs' }, 'History Logs'),
}));

vi.mock('../UserManagement/ManagementSettings', () => ({
  default: ({ settings, onUpdate }: any) => 
    React.createElement('div', { 'data-testid': 'management-settings' }, 'Settings'),
}));

vi.mock('../UserManagement/UserDetailsModal', () => ({
  default: ({ user, onClose }: any) => 
    user ? React.createElement('div', { 'data-testid': 'user-details-modal' }, user.name) : null,
}));

vi.mock('../UserManagement/ConfirmationModal', () => ({
  default: ({ isOpen, title, onClose, onConfirm, children }: any) => 
    isOpen ? React.createElement('div', { 'data-testid': 'confirmation-modal', role: 'dialog' },
      React.createElement('h3', null, title),
      children,
      React.createElement('button', { onClick: onConfirm, 'data-testid': 'confirm-btn' }, 'Confirm'),
      React.createElement('button', { onClick: onClose, 'data-testid': 'cancel-modal-btn' }, 'Cancel')
    ) : null,
}));

vi.mock('../../components/Pagination', () => ({
  default: ({ currentPage, totalPages, onPageChange }: any) => 
    React.createElement('div', { 'data-testid': 'pagination' }, `Page ${currentPage} of ${totalPages}`),
}));

import UserManagement from '../UserManagement/index';

function createMockUsers(count: number = 4) {
  const roles = ['Admin', 'Internal Auditor', 'Compliance Officer', 'Viewer'];
  const statuses = ['Active', 'Active', 'Suspended', 'Locked'];
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i + 1}`,
    username: `user${i + 1}`,
    name: `User ${i + 1}`,
    email: `user${i + 1}@test.com`,
    role: roles[i % roles.length],
    department: `Department ${i + 1}`,
    status: statuses[i % statuses.length],
    last_login: i === 0 ? '2025-01-15T10:00:00Z' : null,
    failed_attempts: i === 3 ? 5 : 0,
  }));
}

function createMockSummary() {
  return {
    total: 4,
    active: 2,
    suspended: 1,
    locked: 1,
  };
}

function setupMock(options?: { users?: any[]; loading?: boolean; summary?: any }) {
  mockUseUserManagement.mockReturnValue({
    users: options?.users ?? createMockUsers(),
    summary: options?.summary ?? createMockSummary(),
    roles: [
      { id: 1, name: 'Admin' },
      { id: 2, name: 'Internal Auditor' },
      { id: 3, name: 'Compliance Officer' },
      { id: 4, name: 'Viewer' },
    ],
    permissions: [],
    sessions: [{ id: 's1', user_id: 'user-1', ip: '127.0.0.1' }],
    settings: { password_expiry_days: 90, max_failed_attempts: 5 },
    loginHistory: [],
    auditTrail: [],
    resetRequests: [],
    departments: ['Department 1', 'Department 2'],
    jobTitles: [{ id: 1, title: 'Auditor' }],
    loading: options?.loading ?? false,
    error: null,
    pagination: { total: 4, page: 1, pageSize: 10, totalPages: 1 },
    historyPagination: { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    activityPagination: { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    refreshAll: vi.fn(),
    updateUser: vi.fn(),
  });
}

describe('UserManagement Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDebounce.mockImplementation((value: string) => value);
  });

  it('renders the user list with user data', () => {
    setupMock();

    render(<UserManagement />);

    expect(screen.getByTestId('user-list')).toBeInTheDocument();
    expect(screen.getByTestId('user-card-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('user-card-user-2')).toBeInTheDocument();
    expect(screen.getByTestId('user-card-user-3')).toBeInTheDocument();
    expect(screen.getByTestId('user-card-user-4')).toBeInTheDocument();
  });

  it('displays user names correctly', () => {
    setupMock();

    render(<UserManagement />);

    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('User 2')).toBeInTheDocument();
    expect(screen.getByText('User 3')).toBeInTheDocument();
    expect(screen.getByText('User 4')).toBeInTheDocument();
  });

  it('displays user statuses', () => {
    setupMock();

    render(<UserManagement />);

    expect(screen.getByTestId('user-status-user-1')).toHaveTextContent('Active');
    expect(screen.getByTestId('user-status-user-3')).toHaveTextContent('Suspended');
    expect(screen.getByTestId('user-status-user-4')).toHaveTextContent('Locked');
  });

  it('renders action buttons for each user (edit, suspend, delete, reset password)', () => {
    setupMock();

    render(<UserManagement />);

    // Each user should have action buttons
    expect(screen.getByTestId('edit-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('suspend-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('delete-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('reset-user-1')).toBeInTheDocument();
  });

  it('shows unlock button only for locked users', () => {
    setupMock();

    render(<UserManagement />);

    // User 4 is locked, should have unlock button
    expect(screen.getByTestId('unlock-user-4')).toBeInTheDocument();

    // User 1 is active, should NOT have unlock button
    expect(screen.queryByTestId('unlock-user-1')).not.toBeInTheDocument();
  });

  it('renders summary cards with correct counts', () => {
    setupMock();

    render(<UserManagement />);

    expect(screen.getByTestId('user-summary-cards')).toBeInTheDocument();
    expect(screen.getByText('Total: 4')).toBeInTheDocument();
    expect(screen.getByText('Active: 2')).toBeInTheDocument();
    expect(screen.getByText('Suspended: 1')).toBeInTheDocument();
  });

  it('opens add user form when add button is clicked', () => {
    setupMock();

    render(<UserManagement />);

    fireEvent.click(screen.getByTestId('add-user-btn'));

    expect(screen.getByTestId('user-form')).toBeInTheDocument();
    expect(screen.getByText('Add User')).toBeInTheDocument();
  });

  it('opens delete confirmation modal when delete is clicked', () => {
    setupMock();

    render(<UserManagement />);

    fireEvent.click(screen.getByTestId('delete-user-1'));

    expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument();
    expect(screen.getByText('userManagement.deleteUser')).toBeInTheDocument();
  });

  it('opens suspend confirmation modal when suspend is clicked', () => {
    setupMock();

    render(<UserManagement />);

    fireEvent.click(screen.getByTestId('suspend-user-1'));

    expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument();
    expect(screen.getByText('userManagement.changeUserStatus')).toBeInTheDocument();
  });

  it('renders pagination component', () => {
    setupMock();

    render(<UserManagement />);

    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });
});
