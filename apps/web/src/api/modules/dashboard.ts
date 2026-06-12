/**
 * Dashboard module API client.
 * Provides typed methods for dashboard statistics endpoint.
 *
 * Typed equivalent of: api/compat/dashboardService.ts
 */
import { DashboardStatsSchema } from '@alsaqi/shared';
import type { DashboardStats } from '@alsaqi/shared';
import type { ApiClient } from '../client';

// Re-export the shared type so existing consumers of this module keep working.
export type { DashboardStats } from '@alsaqi/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardApi {
  getStats(department?: string): Promise<DashboardStats>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDashboardApi(client: ApiClient): DashboardApi {
  return {
    getStats(department) {
      const params = department && department !== 'all' ? { department } : undefined;
      return client.get('/v1/dashboard-stats', DashboardStatsSchema, { params });
    },
  };
}
