// @vitest-environment jsdom
/**
 * Tests for the Audit Plans React Query hooks.
 * Validates: Requirements 10.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const auditPlansMock = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../index', () => ({
  api: { auditPlans: auditPlansMock },
}));

import {
  useAuditPlans,
  useAuditPlan,
  useCreateAuditPlan,
  useUpdateAuditPlan,
  useDeleteAuditPlan,
  auditPlansKeys,
} from '../useAuditPlans';
import { createTestQueryClient, createWrapper } from './queryWrapper';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auditPlansKeys', () => {
  it('builds hierarchical keys', () => {
    expect(auditPlansKeys.all).toEqual(['audit-plans']);
    expect(auditPlansKeys.list({ status: 'Planned' })).toEqual([
      'audit-plans',
      'list',
      { status: 'Planned' },
    ]);
    expect(auditPlansKeys.detail('p1')).toEqual(['audit-plans', 'detail', 'p1']);
  });
});

describe('useAuditPlans', () => {
  it('fetches the list of audit plans with server pagination metadata', async () => {
    const data = { items: [{ id: 'p1' }], total: 42, totalPages: 3 };
    auditPlansMock.list.mockResolvedValue(data);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuditPlans({ department: 'IT' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(auditPlansMock.list).toHaveBeenCalledWith({ department: 'IT' });
    expect(result.current.data).toEqual(data);
    // total/totalPages are surfaced from server meta, not derived from items.length
    expect(result.current.data?.total).toBe(42);
    expect(result.current.data?.totalPages).toBe(3);
  });

  it('surfaces errors from the list request', async () => {
    auditPlansMock.list.mockRejectedValue(new Error('failed'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuditPlans(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useAuditPlan', () => {
  it('fetches a single plan when an id is provided', async () => {
    auditPlansMock.getById.mockResolvedValue({ id: 'p1' });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuditPlan('p1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(auditPlansMock.getById).toHaveBeenCalledWith('p1');
    expect(result.current.data).toEqual({ id: 'p1' });
  });

  it('does not fetch when the id is empty (disabled query)', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAuditPlan(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(auditPlansMock.getById).not.toHaveBeenCalled();
  });
});

describe('useCreateAuditPlan', () => {
  it('creates a plan and invalidates the list cache', async () => {
    auditPlansMock.create.mockResolvedValue({ id: 'new' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useCreateAuditPlan(), { wrapper });
    result.current.mutate({ title: 'x' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(auditPlansMock.create).toHaveBeenCalledWith({ title: 'x' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: auditPlansKeys.lists() });
  });
});

describe('useUpdateAuditPlan', () => {
  it('updates a plan and invalidates list + detail caches', async () => {
    auditPlansMock.update.mockResolvedValue({ id: 'p1' });
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useUpdateAuditPlan(), { wrapper });
    result.current.mutate({ id: 'p1', data: { title: 'y' } as never });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(auditPlansMock.update).toHaveBeenCalledWith('p1', { title: 'y' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: auditPlansKeys.lists() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: auditPlansKeys.detail('p1') });
  });
});

describe('useDeleteAuditPlan', () => {
  it('deletes a plan and invalidates the list cache', async () => {
    auditPlansMock.delete.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { wrapper } = createWrapper(client);

    const { result } = renderHook(() => useDeleteAuditPlan(), { wrapper });
    result.current.mutate('p1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(auditPlansMock.delete).toHaveBeenCalledWith('p1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: auditPlansKeys.lists() });
  });
});
