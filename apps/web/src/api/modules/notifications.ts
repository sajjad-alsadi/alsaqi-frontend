/**
 * Notifications module API client.
 * Provides typed methods for notification list and mark-read endpoints.
 */
import { z } from 'zod';
import type { ApiClient } from '../client';
import type { Notification } from '@alsaqi/shared';

// ─── Response Schemas ─────────────────────────────────────────────────────────

// @ts-expect-error -- Zod .optional() produces T | undefined which conflicts with exactOptionalPropertyTypes
const NotificationSchema: z.ZodType<Notification> = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  recipient_row_id: z.string().optional(),
  user_id: z.number().optional(),
  event_type: z.string(),
  title: z.string().nullable().optional(),
  description: z.string(),
  related_module: z.string(),
  date: z.string(),
  status: z.enum(['Read', 'Unread']).optional(),
  is_read: z.boolean().optional(),
  read_at: z.string().nullable().optional(),
  link: z.string().optional(),
  actor_id: z.string().optional(),
  entity_id: z.string().optional(),
  entity_type: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const NotificationListSchema = z.array(NotificationSchema);

/**
 * The bulk mark-read (`PUT /notifications/mark-read`) and mark-all-read
 * (`PUT /notifications/mark-all-read`) endpoints return `{ updated: number }`
 * (the count of notifications changed to read) per the unified contract.
 */
const MarkReadResponseSchema = z.object({
  updated: z.number(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationsApi {
  list(query?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<Notification[]>;
  /**
   * Bulk-mark the given notifications as read in a single call via the
   * `PUT /notifications/mark-read` endpoint. Resolves with the count actually
   * marked read for the current user (`data.updated`).
   */
  markRead(notificationIds: Array<string | number>): Promise<{ updated: number }>;
  markAllRead(): Promise<{ updated: number }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createNotificationsApi(client: ApiClient): NotificationsApi {
  return {
    list(query) {
      return client.get('/notifications', NotificationListSchema, { params: query });
    },

    markRead(notificationIds) {
      return client.put('/notifications/mark-read', MarkReadResponseSchema, {
        notification_ids: notificationIds,
      });
    },

    markAllRead() {
      return client.put('/notifications/mark-all-read', MarkReadResponseSchema);
    },
  };
}
