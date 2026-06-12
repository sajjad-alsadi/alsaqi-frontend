// @vitest-environment jsdom
/**
 * Tests for the Users React Query hooks.
 * Validates: Requirements 10.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const usersMock = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../index', () => ({
  api: { users: usersMock },
}));

import {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  usersKeys,
} from '../useUsers';
import { createTestQueryClient, createWrapper } from './queryWrapper';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usersKeys', () => {
  it('builds hierarchical keys', () => {
    expect(usersKeys.all).toEqual(['users']);
    expect(usersKeys.list({ role: 'admin' })).toEqual(['users', 'list', { role: 'admin' }]);
    expect(usersKeys.detail('u1')).toEqual(['users', 'detail', 'u1']);
  });
});

describe('useUsers', () => {
  it('fetches the list of users', async () => {
    const data = [{ id: 'u1' }];
    usersMock.list.mockResolvedValue(data);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUsers({ role: 'admin' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersMock.list).toHaveBeenCalledWith({ role: 'admin' });
    expect(result.current.data).toEqual(data);
  });

  it('surfaces errors from the list request', async () => {
    usersMock.list.mockRejectedValue(new Error('failed'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUsers(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUser', () => {
  it('fetches a single user when an id is provided', async () => {
    usersMock.getById.mockResolvedValue({ id: 'u1' });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUser('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersMock.getById).toHaveBeenCalledWith('u1');
  });

  it('does not fetch when the id is empty (disabled query)', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUser(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(usersMock.getById).not.toHaveBeenCalled();
  });
});

describe('useCreateUser', () => {
  it('creates a user and invalidates the list cache', async () => {
    usersMock.create.mockResolvedValue({ id: 'new' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useCreateUser(), { wrapper });
    result.current.mutate({ email: 'a@b.com' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersMock.create).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: usersKeys.lists() });
  });
});

describe('useUpdateUser', () => {
  it('updates a user and invalidates list + detail caches', async () => {
    usersMock.update.mockResolvedValue({ id: 'u1' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useUpdateUser(), { wrapper });
    result.current.mutate({ id: 'u1', data: { email: 'c@d.com' } as never });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersMock.update).toHaveBeenCalledWith('u1', { email: 'c@d.com' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: usersKeys.lists() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: usersKeys.detail('u1') });
  });
});

describe('useDeleteUser', () => {
  it('deletes a user and invalidates the list cache', async () => {
    usersMock.delete.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useDeleteUser(), { wrapper });
    result.current.mutate('u1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersMock.delete).toHaveBeenCalledWith('u1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: usersKeys.lists() });
  });
});
