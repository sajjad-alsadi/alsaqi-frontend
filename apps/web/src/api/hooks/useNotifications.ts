/**
 * React Query hooks for the Notifications API module.
 *
 * Provides typed query/mutation hooks with automatic cache invalidation.
 * Validates: Requirements 4.7
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../index';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const notificationsKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationsKeys.all, 'list'] as const,
  list: (filters?: NotificationsListParams) =>
    [...notificationsKeys.lists(), filters] as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationsListParams {
  page?: number;
  pageSize?: number;
  status?: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of notifications.
 */
export function useNotifications(params?: NotificationsListParams) {
  return useQuery({
    queryKey: notificationsKeys.list(params),
    queryFn: () => api.notifications.list(params),
  });
}

/**
 * Mark specific notifications as read. Invalidates the notifications list cache.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationIds: Array<string | number>) =>
      api.notifications.markRead(notificationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsKeys.lists() });
    },
  });
}

/**
 * Mark all notifications as read. Invalidates the notifications list cache.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsKeys.lists() });
    },
  });
}
