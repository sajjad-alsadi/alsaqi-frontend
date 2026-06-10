/**
 * Dashboard module API client.
 * Provides typed methods for dashboard statistics endpoint.
 *
 * Typed equivalent of: api/compat/dashboardService.ts
 */
import { z } from 'zod';
import type { ApiClient } from '../client';

// ─── Response Schemas ─────────────────────────────────────────────────────────

const DashboardStatsSchema = z.record(z.string(), z.unknown());

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  [key: string]: unknown;
}

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
