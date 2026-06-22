/**
 * Endpoint contract interfaces for the Notifications module.
 * Defines the request/response shapes for each route.
 *
 * Response convention: every `/api` response is wrapped in the standard
 * Success_Envelope `{ success, data, meta }`. The `response` type declared here
 * is the payload carried in the envelope `data` field; for paginated lists the
 * pagination metadata is carried in `meta.pagination` (see `GET /notifications`).
 */
import type { Notification } from '../models';

export interface NotificationsEndpoints {
  /**
   * Paginated notifications for the current user. The notification items are
   * carried in the Success_Envelope `data` array; pagination metadata is carried
   * in `meta.pagination` (R11 — corrected from a misleading bare top-level array).
   * The `Notification` model already contains every field returned by the
   * backend's NotificationFeedItem.
   */
  'GET /notifications': {
    query: { page?: number; pageSize?: number; status?: string };
    response: Notification[];
  };
  /** Unread count for the current user (R12). */
  'GET /notifications/unread-count': {
    response: { count: number };
  };
  /** Bulk-mark a set of the current user's notifications as read. */
  'PUT /notifications/mark-read': {
    body: { notification_ids: Array<string | number> };
    response: { updated: number };
  };
  /**
   * Mark a single notification as read (R12 — retained for backward
   * compatibility; not removed by the bulk endpoint).
   */
  'PUT /notifications/:id/read': {
    params: { id: string | number };
    response: { success: boolean };
  };
  /** Mark all of the current user's notifications as read. */
  'PUT /notifications/mark-all-read': {
    body: undefined;
    response: { updated: number };
  };
  /** Dismiss (soft-delete) a single notification (R12). */
  'DELETE /notifications/:id': {
    params: { id: string | number };
    response: { success: boolean };
  };
}
