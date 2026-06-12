/**
 * Endpoint contract interfaces for the User Management module
 * (roles, permissions, sessions, job titles, settings).
 * Defines the request/response shapes for each route.
 *
 * Response/body shapes reference the relocated user-management validators
 * (via their inferred `*Validated` types) so the contract stays in lockstep
 * with the single source of validation truth.
 */
import type {
  RoleValidated,
  PermissionValidated,
  UserSessionValidated,
  UserManagementSettingsValidated,
  JobTitleValidated,
} from '../../validators/user-management';

export interface UserManagementEndpoints {
  'GET /v1/roles': {
    response: RoleValidated[];
  };
  'GET /v1/permissions': {
    response: PermissionValidated[];
  };
  'GET /v1/user-sessions': {
    response: UserSessionValidated[];
  };
  'GET /v1/user-management-settings': {
    response: UserManagementSettingsValidated;
  };
  'PUT /v1/user-management-settings': {
    body: UserManagementSettingsValidated;
    response: UserManagementSettingsValidated;
  };
  'GET /v1/job-titles': {
    response: JobTitleValidated[];
  };
  'DELETE /v1/user-sessions/:id': {
    params: { id: string };
    response: { deleted: boolean };
  };
}
