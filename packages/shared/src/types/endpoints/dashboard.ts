/**
 * Endpoint contract interfaces for the Dashboard module.
 * Defines the request/response shapes for each route.
 *
 * Response shapes reference the relocated `DashboardStatsSchema` validator
 * (via its inferred `DashboardStatsValidated` type) so the contract stays in
 * lockstep with the single source of validation truth.
 */
import type { DashboardStatsValidated } from '../../validators/dashboard';

export interface DashboardEndpoints {
  'GET /v1/dashboard-stats': {
    query: { department?: string };
    response: DashboardStatsValidated;
  };
}
