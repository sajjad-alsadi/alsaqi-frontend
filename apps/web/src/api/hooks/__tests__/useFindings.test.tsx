// @vitest-environment jsdom
/**
 * Tests for the Findings React Query hooks.
 * Validates: Requirements 10.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const findingsMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../index', () => ({
  api: { findings: findingsMock },
}));

import {
  useFindings,
  useCreateFinding,
  useUpdateFinding,
  useDeleteFinding,
  findingsKeys,
} from '../useFindings';
import { createTestQueryClient, createWrapper } from './queryWrapper';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findingsKeys', () => {
  it('builds hierarchical, filter-aware keys', () => {
    expect(findingsKeys.all).toEqual(['findings']);
    expect(findingsKeys.lists()).toEqual(['findings', 'list']);
    expect(findingsKeys.list({ status: 'Open' })).toEqual([
      'findings',
      'list',
      { status: 'Open' },
    ]);
    expect(findingsKeys.detail('f1')).toEqual(['findings', 'detail', 'f1']);
  });
});

describe('useFindings', () => {
  it('fetches the list and returns data on success', async () => {
    const data = [{ id: 'f1' }, { id: 'f2' }];
    findingsMock.list.mockResolvedValue(data);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useFindings({ status: 'Open' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(findingsMock.list).toHaveBeenCalledWith({ status: 'Open' });
    expect(result.current.data).toEqual(data);
  });

  it('exposes the error state when the request fails', async () => {
    findingsMock.list.mockRejectedValue(new Error('boom'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useFindings(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCreateFinding', () => {
  it('creates a finding and invalidates the list cache', async () => {
    findingsMock.create.mockResolvedValue({ id: 'new' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useCreateFinding(), { wrapper });
    result.current.mutate({ title: 'x' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(findingsMock.create).toHaveBeenCalledWith({ title: 'x' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: findingsKeys.lists() });
  });
});

describe('useUpdateFinding', () => {
  it('updates a finding and invalidates list + detail caches', async () => {
    findingsMock.update.mockResolvedValue({ id: 'f1' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useUpdateFinding(), { wrapper });
    result.current.mutate({ id: 'f1', data: { title: 'y' } as never });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(findingsMock.update).toHaveBeenCalledWith('f1', { title: 'y' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: findingsKeys.lists() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: findingsKeys.detail('f1') });
  });
});

describe('useDeleteFinding', () => {
  it('deletes a finding and invalidates the list cache', async () => {
    findingsMock.delete.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useDeleteFinding(), { wrapper });
    result.current.mutate('f1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(findingsMock.delete).toHaveBeenCalledWith('f1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: findingsKeys.lists() });
  });

  it('reports an error when deletion fails', async () => {
    findingsMock.delete.mockRejectedValue(new Error('nope'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteFinding(), { wrapper });
    result.current.mutate('f1');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
