import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserManagement } from '../../hooks/useUserManagement';
import { api } from '../../api';
import { ROLES } from '../../permissions';
import { UserManagementTab, AccessScope } from '../../constants';
import { useFormat } from '../../utils/formatService';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/errorService';
import toast from 'react-hot-toast';
import logger from '../../utils/logger';

// Sub-components
import UserManagementHeader from './UserManagementHeader';
import UserSummaryCards from './UserSummaryCards';
import UserList from './UserList';
import UserForm from './UserForm';
import RolePermissions from './RolePermissions';
import ResetRequests from './ResetRequests';
import SupportRequests from './SupportRequests';
import UserSessions from './UserSessions';
import HistoryLogs from './HistoryLogs';
import ManagementSettings from './ManagementSettings';
import UserDetailsModal from './UserDetailsModal';
import ConfirmationModal from './ConfirmationModal';
import Pagination from '../../components/Pagination';

const UserManagement: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { translateStatus, formatDateTime, translateName } = useFormat();
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [activeTab, setActiveTab] = useState<UserManagementTab>(UserManagementTab.USERS);
  const [filterDept, setFilterDept] = useState('All');
  const [filterRole, setFilterRole] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  // Use custom hook for data management
  const {
    users,
    summary,
    roles: allRoles,
    permissions: allPermissions,
    sessions,
    settings: managementSettings,
    loginHistory,
    auditTrail: activityLogs,
    resetRequests,
    departments: allDepartments,
    jobTitles: allJobTitles,
    loading,
    error,
    pagination: userPagination,
    historyPagination,
    activityPagination,
    refreshAll,
    updateUser
  } = useUserManagement({
    page: currentPage,
    pageSize: pageSize,
    search: debouncedSearchTerm,
    department: filterDept !== 'All' ? filterDept : undefined,
    role: filterRole !== 'All' ? filterRole : undefined,
    historyPage,
    auditPage
  });

  // State for modals and UI
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<any>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [newUser, setNewUser] = useState({ 
    username: '', 
    password: '', 
    name: '', 
    email: '', 
    department: '', 
    job_title_id: '', 
    role: ROLES.VIEWER,
    unit: '',
    reporting_manager_id: '',
    access_scope: AccessScope.GLOBAL,
    phone_number: '',
    notes: ''
  });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | number | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [userError, setUserError] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  
  // Labels
  const getRoleLabel = (role: string) => {
    const roleMapping: Record<string, string> = {
      [ROLES.ADMIN]: 'admin',
      [ROLES.INTERNAL_AUDITOR]: 'internalAuditor',
      [ROLES.COMPLIANCE_OFFICER]: 'complianceOfficer',
      [ROLES.RISK_OFFICER]: 'riskOfficer',
      [ROLES.MANAGER]: 'manager',
      [ROLES.VIEWER]: 'viewer',
    };
    return t(`roles.${roleMapping[role] || 'viewer'}`);
  };

  const getPermissionLabel = (perm: string) => {
    const permMapping: Record<string, string> = {
      'view': t('permissions.View'),
      'create': t('permissions.Create'),
      'edit': t('permissions.Edit'),
      'delete': t('permissions.Delete'),
      'approve': t('permissions.Approve'),
    };
    return permMapping[(perm || '').toLowerCase()] || perm;
  };

  // Handlers
  const handleSavePermissions = async (modifiedRoles: any[]) => {
    try {
      const promises = modifiedRoles.map(modifiedRole => {
        const newPermIds = [...new Set((modifiedRole.permissions || []).map((p: any) => p.id))] as string[];
        return api.userManagement.updateRolePermissions(modifiedRole.id, { permissionIds: newPermIds });
      });

      await Promise.all(promises);
      
      toast.success(t('updateSuccess'));
      refreshAll();
    } catch (err: any) {
      logger.error('Error updating permissions:', err);
      refreshAll();
      toast.error(t('userManagement.permissionUpdateFailed'));
    }
  };

  const handleUpdateSettings = async (newSettings: any) => {
    try {
      await api.userManagement.updateSettings(newSettings);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
      toast.success(t('updateSuccess'));
      refreshAll();
    } catch (err) { 
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    }
  };

  const handleRevokeSession = async (sessionId: string | number) => {
    try {
      await api.userManagement.revokeSession(sessionId);
      refreshAll();
    } catch (err) { logger.error('Operation failed', err); }
  };

  const handleExportUsers = () => {
    const headers = [t('common.id'), t('common.username'), t('common.name'), t('common.email'), t('common.role'), t('common.department'), t('common.statusLabel'), t('common.lastLogin')];
    const rows = users.map((u: any) => [
      u.id, u.username, translateName(u.name), u.email, getRoleLabel(u.role), u.department, translateStatus(u.status), u.last_login ? formatDateTime(u.last_login) : t('common.never')
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map((e: any) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "users_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveUser = async () => {
    setUserError('');
    if (!editingUser && newUser.password.length < 8) {
      setUserError(t('common.passwordTooShort'));
      return;
    }
    if (!newUser.username || !newUser.name || !newUser.email || !newUser.department || !newUser.role) {
      setUserError(t('common.fillAllFields'));
      return;
    }
    
    setIsSavingUser(true);
    try {
      const payload: any = {
        ...newUser,
        job_title_id: newUser.job_title_id || null,
        reporting_manager_id: newUser.reporting_manager_id || null
      };

      // Remove password if empty during edit
      if (editingUser && !newUser.password) {
        delete payload.password;
      }

      if (editingUser) {
        await api.users.update(editingUser.id, payload);
        toast.success(t('updateSuccess'));
      } else {
        await api.users.create(payload);
        toast.success(t('createSuccess'));
      }
      
      refreshAll();
      setShowAddUser(false);
      setEditingUser(null);
      setNewUser({ 
        username: '', password: '', name: '', email: '', department: '', 
        job_title_id: '', role: ROLES.VIEWER, unit: '', reporting_manager_id: '',
        access_scope: AccessScope.GLOBAL, phone_number: '', notes: ''
      });
    } catch (err: any) {
      logger.error('Operation failed', err);
      setUserError(extractErrorMessage(err, t('userManagement.errorSavingUser')));
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setNewUser({ 
      username: user.username || '',
      password: '', 
      name: user.name || '',
      email: user.email || '',
      department: user.department || '',
      job_title_id: user.job_title_id ? user.job_title_id.toString() : '',
      role: user.role || ROLES.VIEWER,
      unit: user.unit || '',
      reporting_manager_id: user.reporting_manager_id ? user.reporting_manager_id.toString() : '',
      access_scope: user.access_scope || AccessScope.GLOBAL,
      phone_number: user.phone_number || '',
      notes: user.notes || ''
    });
    setShowAddUser(true);
  };

  const handleConfirmSuspend = async () => {
    if (!selectedUserId) return;
    try {
      await api.userManagement.suspendUser(selectedUserId);
      toast.success(t('updateSuccess'));
      refreshAll();
    } catch (err) { 
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    }
    setShowSuspendConfirm(false);
    setSelectedUserId(null);
  };

  const handleConfirmDelete = async () => {
    if (!selectedUserId) return;
    try {
      await api.users.delete(selectedUserId);
      toast.success(t('deleteSuccess'));
      refreshAll();
    } catch (err) { 
      logger.error('Operation failed', err);
      toast.error(t('errorOccurred'));
    }
    setShowDeleteConfirm(false);
    setSelectedUserId(null);
  };

  const handleConfirmResetPassword = async () => {
    setResetError('');
    setResetSuccess('');
    if (!selectedUserId || !resetPasswordValue) return;
    if (resetPasswordValue.length < 8) {
      setResetError(t('auth.passwordTooShort'));
      return;
    }
    try {
      await api.userManagement.resetPassword(selectedUserId, { newPassword: resetPasswordValue });
      toast.success(t('userManagement.resetPassword'));
      setTimeout(() => {
        setShowResetPassword(false);
        setSelectedUserId(null);
        setResetPasswordValue('');
      }, 2000);
    } catch (err) { 
      toast.error(t('userManagement.errorResettingPassword'));
    }
  };

  const handleConfirmUnlock = async () => {
    setUnlockError('');
    if (!selectedUserId) return;
    try {
      await api.userManagement.unlockUser(selectedUserId);
      toast.success(t('updateSuccess'));
      refreshAll();
      setShowUnlockConfirm(false);
      setSelectedUserId(null);
    } catch (err) {
      logger.error('Operation failed', err);
      toast.error(t('userManagement.errorUnlockingUser'));
    }
  };

  const handleApproveReset = async (requestId: string | number) => {
    try {
      await api.userManagement.approveReset({ requestId: String(requestId), action: 'approve' });
      refreshAll();
    } catch (err) { logger.error('Operation failed', err); }
  };

  const handleConfirmApproveReset = async () => {
    if (!selectedRequestId) return;
    try {
      const res = await api.userManagement.approveReset({ requestId: String(selectedRequestId), action: 'approve' });
      setTempPassword((res as any).tempPassword || '');
      refreshAll();
      setShowResetConfirm(false);
    } catch (err) { logger.error('Operation failed', err); }
  };

  const filteredUsers = users;

  return (
    <div className="space-y-10 animate-in fade-in duration-700" dir={i18n.dir()}>
      <UserManagementHeader 
        activeTab={activeTab}
        searchTerm={searchTerm}
        resetRequestsCount={resetRequests.length}
        onTabChange={setActiveTab}
        onSearchChange={setSearchTerm}
        onExport={handleExportUsers}
        onAddUser={() => {
          setEditingUser(null);
          setNewUser({ 
            username: '', password: '', name: '', email: '', department: '', 
            job_title_id: '', role: ROLES.VIEWER, unit: '', reporting_manager_id: '',
            access_scope: AccessScope.GLOBAL, phone_number: '', notes: ''
          });
          setShowAddUser(true);
        }}
      />

      {activeTab === UserManagementTab.USERS && (
        <div className="space-y-4">
          {summary && <UserSummaryCards summary={summary} />}
          
          {showAddUser ? (
            <UserForm 
              editingUser={editingUser}
              newUser={newUser}
              userError={userError}
              jobTitles={allJobTitles}
              users={users}
              allRoles={allRoles}
              isLoading={isSavingUser}
              getRoleLabel={getRoleLabel}
              onCancel={() => {
                setShowAddUser(false);
                setEditingUser(null);
                setUserError('');
              }}
              onSave={handleSaveUser}
              onUpdateNewUser={(data) => setNewUser(prev => ({ ...prev, ...data }))}
            />
          ) : (
            <div className="space-y-4">
              <UserList 
                users={filteredUsers}
                getRoleLabel={getRoleLabel}
                onEdit={handleEditUser}
                onSuspend={(id) => { setSelectedUserId(id); setShowSuspendConfirm(true); }}
                onDelete={(id) => { setSelectedUserId(id); setShowDeleteConfirm(true); }}
                onResetPassword={(id) => { setSelectedUserId(id); setResetPasswordValue(''); setShowResetPassword(true); }}
                onUnlock={(id) => { setSelectedUserId(id); setShowUnlockConfirm(true); }}
              />

              <Pagination 
                currentPage={userPagination.page}
                totalPages={userPagination.totalPages}
                onPageChange={(page) => setCurrentPage(page)}
                pageSize={userPagination.pageSize}
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                totalItems={userPagination.total}
              />
            </div>
          )}
        </div>
      )}


      {activeTab === UserManagementTab.ROLES && (
        <RolePermissions 
          allRoles={allRoles}
          allPermissions={allPermissions}
          showSaveSuccess={showSaveSuccess}
          getRoleLabel={getRoleLabel}
          onSave={handleSavePermissions}
        />
      )}

      {activeTab === UserManagementTab.RESETS && (
        <ResetRequests 
          requests={resetRequests}
          tempPassword={tempPassword}
          onApprove={(id) => { setSelectedRequestId(id); setShowResetConfirm(true); }}
        />
      )}

      {activeTab === UserManagementTab.SUPPORT_REQUESTS && (
        <SupportRequests />
      )}

      {activeTab === UserManagementTab.SESSIONS && (
        <UserSessions 
          sessions={sessions}
          onRevoke={handleRevokeSession}
        />
      )}

      {activeTab === UserManagementTab.HISTORY && (
        <HistoryLogs 
          loginHistory={loginHistory}
          activityLogs={activityLogs}
          historyPagination={historyPagination}
          activityPagination={activityPagination}
          onHistoryPageChange={(page) => setHistoryPage(page)}
          onHistoryPageSizeChange={(size) => { setHistoryPage(1); /* In case size change resets to page 1 */ }} 
          onActivityPageChange={(page) => setAuditPage(page)}
          onActivityPageSizeChange={(size) => { setAuditPage(1); }}
        />
      )}

      {activeTab === UserManagementTab.SETTINGS && (
        <ManagementSettings 
          settings={managementSettings}
          onUpdate={handleUpdateSettings}
          showSuccess={showSaveSuccess}
        />
      )}

      {/* Modals */}
      <UserDetailsModal 
        user={selectedUserForDetails}
        onClose={() => { setShowUserDetails(false); setSelectedUserForDetails(null); }}
      />

      <ConfirmationModal 
        isOpen={showDeleteConfirm}
        title={t('userManagement.deleteUser')}
        message={t('userManagement.deleteUserConfirm')}
        confirmLabel={t('common.delete')}
        confirmVariant="danger"
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
      />

      <ConfirmationModal 
        isOpen={showSuspendConfirm}
        title={t('userManagement.changeUserStatus')}
        message={t('userManagement.suspendUserConfirm')}
        confirmLabel={t('common.save')}
        confirmVariant="warning"
        onClose={() => setShowSuspendConfirm(false)}
        onConfirm={handleConfirmSuspend}
      />

      <ConfirmationModal 
        isOpen={showResetPassword}
        title={t('userManagement.resetPassword')}
        message={t('userManagement.enterNewPassword')}
        confirmLabel={t('userManagement.resetPassword')}
        onClose={() => setShowResetPassword(false)}
        onConfirm={handleConfirmResetPassword}
        error={resetError}
        success={resetSuccess}
      >
        <input 
          type="password"
          placeholder={t('userManagement.enterNewPassword')}
          className="input-field mb-4"
          value={resetPasswordValue}
          onChange={(e) => setResetPasswordValue(e.target.value)}
        />
      </ConfirmationModal>

      <ConfirmationModal 
        isOpen={showUnlockConfirm}
        title={t('userManagement.unlockUser')}
        message={t('userManagement.unlockUserConfirm')}
        confirmLabel={t('userManagement.unlockUser')}
        confirmVariant="success"
        onClose={() => setShowUnlockConfirm(false)}
        onConfirm={handleConfirmUnlock}
        error={unlockError}
      />

      <ConfirmationModal 
        isOpen={showResetConfirm}
        title={t('userManagement.approveResetRequest')}
        message={t('userManagement.resetPasswordConfirm')}
        confirmLabel={t('common.approve')}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleConfirmApproveReset}
      />
    </div>
  );
};

export default UserManagement;
