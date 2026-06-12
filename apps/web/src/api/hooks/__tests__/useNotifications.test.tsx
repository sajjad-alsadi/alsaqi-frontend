// @vitest-environment jsdom
/**
 * Tests for the Notifications React Query hooks.
 * Validates: Requirements 10.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const notificationsMock = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock('../../index', () => ({
  api: { notifications: notificationsMock },
}));

import {
  useNotifications,
  useMarkNotificationsRead,
  useMarkAllNotificationsRead,
  notificationsKeys,
} from '../useNotifications';
import { createTestQueryClient, createWrapper } from './queryWrapper';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificationsKeys', () => {
  it('builds hierarchical, filter-aware keys', () => {
    expect(notificationsKeys.all).toEqual(['notifications']);
    expect(notificationsKeys.lists()).toEqual(['notifications', 'list']);
    expect(notificationsKeys.list({ status: 'unread' })).toEqual([
      'notifications',
      'list',
      { status: 'unread' },
    ]);
  });
});

describe('useNotifications', () => {
  it('fetches the list of notifications', async () => {
    const data = [{ id: 'n1' }];
    notificationsMock.list.mockResolvedValue(data);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useNotifications({ status: 'unread' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notificationsMock.list).toHaveBeenCalledWith({ status: 'unread' });
    expect(result.current.data).toEqual(data);
  });

  it('surfaces errors from the list request', async () => {
    notificationsMock.list.mockRejectedValue(new Error('failed'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useMarkNotificationsRead', () => {
  it('marks specific notifications read and invalidates the list cache', async () => {
    notificationsMock.markRead.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper });
    result.current.mutate(['n1', 'n2']);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notificationsMock.markRead).toHaveBeenCalledWith(['n1', 'n2']);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: notificationsKeys.lists() });
  });

  it('reports an error when the request fails', async () => {
    notificationsMock.markRead.mockRejectedValue(new Error('nope'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper });
    result.current.mutate(['n1']);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useMarkAllNotificationsRead', () => {
  it('marks all notifications read and invalidates the list cache', async () => {
    notificationsMock.markAllRead.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notificationsMock.markAllRead).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: notificationsKeys.lists() });
  });
});
