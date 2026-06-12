// @vitest-environment jsdom
/**
 * Tests for the Audit Tasks React Query hooks.
 * Validates: Requirements 10.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const tasksMock = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../index', () => ({
  api: { tasks: tasksMock },
}));

import {
  useTasks,
  useTask,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  tasksKeys,
} from '../useTasks';
import { createTestQueryClient, createWrapper } from './queryWrapper';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tasksKeys', () => {
  it('builds hierarchical keys', () => {
    expect(tasksKeys.all).toEqual(['tasks']);
    expect(tasksKeys.list({ plan_id: 'p1' })).toEqual(['tasks', 'list', { plan_id: 'p1' }]);
    expect(tasksKeys.detail('t1')).toEqual(['tasks', 'detail', 't1']);
  });
});

describe('useTasks', () => {
  it('fetches the list of tasks', async () => {
    const data = [{ id: 't1' }];
    tasksMock.list.mockResolvedValue(data);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTasks({ plan_id: 'p1' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tasksMock.list).toHaveBeenCalledWith({ plan_id: 'p1' });
    expect(result.current.data).toEqual(data);
  });

  it('surfaces errors from the list request', async () => {
    tasksMock.list.mockRejectedValue(new Error('failed'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTasks(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useTask', () => {
  it('fetches a single task when an id is provided', async () => {
    tasksMock.getById.mockResolvedValue({ id: 't1' });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTask('t1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tasksMock.getById).toHaveBeenCalledWith('t1');
  });

  it('does not fetch when the id is empty (disabled query)', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTask(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(tasksMock.getById).not.toHaveBeenCalled();
  });
});

describe('useCreateTask', () => {
  it('creates a task and invalidates the list cache', async () => {
    tasksMock.create.mockResolvedValue({ id: 'new' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useCreateTask(), { wrapper });
    result.current.mutate({ title: 'x' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tasksMock.create).toHaveBeenCalledWith({ title: 'x' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tasksKeys.lists() });
  });
});

describe('useUpdateTask', () => {
  it('updates a task and invalidates list + detail caches', async () => {
    tasksMock.update.mockResolvedValue({ id: 't1' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });
    result.current.mutate({ id: 't1', data: { title: 'y' } as never });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tasksMock.update).toHaveBeenCalledWith('t1', { title: 'y' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tasksKeys.lists() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tasksKeys.detail('t1') });
  });
});

describe('useDeleteTask', () => {
  it('deletes a task and invalidates the list cache', async () => {
    tasksMock.delete.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useDeleteTask(), { wrapper });
    result.current.mutate('t1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tasksMock.delete).toHaveBeenCalledWith('t1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tasksKeys.lists() });
  });
});
