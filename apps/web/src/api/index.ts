/**
 * API Client Entry Point
 *
 * Composes all module-specific API clients into a single typed object.
 * This is the primary interface for the frontend to communicate with the API.
 *
 * Usage:
 *   import { api } from '@/api';
 *   const findings = await api.findings.list({ status: 'Open' });
 *   const user = await api.auth.login({ usernameOrEmail: '...', password: '...' });
 */
import { createApiClient, type ApiClientConfig } from './client';
import { dispatchUnauthorized } from './navigationEvents';
import { createAuthApi, type AuthApi } from './modules/auth';
import { createFindingsApi, type FindingsApi } from './modules/findings';
import { createAuditPlansApi, type AuditPlansApi } from './modules/audit-plans';
import { createTasksApi, type TasksApi } from './modules/tasks';
import { createUsersApi, type UsersApi } from './modules/users';
import { createDepartmentsApi, type DepartmentsApi } from './modules/departments';
import { createNotificationsApi, type NotificationsApi } from './modules/notifications';
import { createCorrespondenceApi, type CorrespondenceApi } from './modules/correspondence';
import { createRiskRegisterApi, type RiskRegisterApi } from './modules/risk-register';
import { createRecommendationsApi, type RecommendationsApi } from './modules/recommendations';
import { createDashboardApi, type DashboardApi } from './modules/dashboard';
import { createRegulatoryApi, type RegulatoryApi } from './modules/regulatory';
import { createUserManagementApi, type UserManagementApi } from './modules/user-management';

// ─── Composed API Client Interface ────────────────────────────────────────────

export interface ComposedApiClient {
  auth: AuthApi;
  findings: FindingsApi;
  auditPlans: AuditPlansApi;
  tasks: TasksApi;
  users: UsersApi;
  departments: DepartmentsApi;
  notifications: NotificationsApi;
  correspondence: CorrespondenceApi;
  riskRegister: RiskRegisterApi;
  recommendations: RecommendationsApi;
  dashboard: DashboardApi;
  regulatory: RegulatoryApi;
  userManagement: UserManagementApi;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a fully composed API client with all module sub-clients.
 *
 * @param config - API client configuration (baseUrl, timeout, callbacks)
 * @returns Typed API client with all module methods
 */
export function createComposedApiClient(config: ApiClientConfig): ComposedApiClient {
  const client = createApiClient(config);

  return {
    auth: createAuthApi(client),
    findings: createFindingsApi(client),
    auditPlans: createAuditPlansApi(client),
    tasks: createTasksApi(client),
    users: createUsersApi(client),
    departments: createDepartmentsApi(client),
    notifications: createNotificationsApi(client),
    correspondence: createCorrespondenceApi(client),
    riskRegister: createRiskRegisterApi(client),
    recommendations: createRecommendationsApi(client),
    dashboard: createDashboardApi(client),
    regulatory: createRegulatoryApi(client),
    userManagement: createUserManagementApi(client),
  };
}

// ─── Default Instance ─────────────────────────────────────────────────────────

/**
 * Default API client instance configured from environment variables.
 * Uses `/api` as the base URL (the Vite dev server proxy will forward to the API).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env as Record<string, string> | undefined;

export const api: ComposedApiClient = createComposedApiClient({
  baseUrl: env?.['VITE_API_URL'] || '/api',
  timeout: 30000,
  onUnauthorized: () => {
    // SPA-internal redirect (Req 23.2): dispatch an in-app navigation event
    // consumed by a top-level listener that calls `navigate('/login')`,
    // instead of reloading the document via `window.location.href`.
    dispatchUnauthorized();
  },
  onError: (error) => {
    console.error('[API Error]', error.type, error.url, error.reason);
  },
});

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { createApiClient } from './client';
export type { ApiClient, ApiClientConfig, ApiClientError } from './client';
export { UNAUTHORIZED_EVENT, dispatchUnauthorized } from './navigationEvents';
export type { AuthApi } from './modules/auth';
export type { FindingsApi } from './modules/findings';
export type { AuditPlansApi } from './modules/audit-plans';
export type { TasksApi } from './modules/tasks';
export type { UsersApi } from './modules/users';
export type { DepartmentsApi } from './modules/departments';
export type { NotificationsApi } from './modules/notifications';
export type { CorrespondenceApi } from './modules/correspondence';
export type { RiskRegisterApi } from './modules/risk-register';
export type { RecommendationsApi } from './modules/recommendations';
export type { DashboardApi } from './modules/dashboard';
export type { RegulatoryApi } from './modules/regulatory';
export type { UserManagementApi } from './modules/user-management';

// ─── React Query Hooks ────────────────────────────────────────────────────────

export * from './hooks/useFindings';
export * from './hooks/useAuditPlans';
export * from './hooks/useTasks';
export * from './hooks/useUsers';
export * from './hooks/useAuth';
export * from './hooks/useNotifications';

// ─── Mutation Feedback Policy (Req 18) ────────────────────────────────────────

export { withMutationFeedback, type MutationFeedbackOptions } from './mutationFeedback';
