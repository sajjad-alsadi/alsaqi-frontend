// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOptimisticUpdate } from '../useOptimisticUpdate';

interface TestItem {
  id: number;
  name: string;
  status: string;
}

describe('useOptimisticUpdate', () => {
  const initialItems: TestItem[] = [
    { id: 1, name: 'Item 1', status: 'draft' },
    { id: 2, name: 'Item 2', status: 'draft' },
    { id: 3, name: 'Item 3', status: 'in_progress' },
  ];

  let setItems: (items: TestItem[]) => void;

  beforeEach(() => {
    setItems = vi.fn();
  });

  describe('تحديث الواجهة فوراً قبل استجابة الخادم', () => {
    it('should apply optimistic update immediately before action resolves', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      let resolveAction: () => void;
      const action = new Promise<void>((resolve) => {
        resolveAction = resolve;
      });

      const applyOptimistic = (items: TestItem[]) =>
        items.map((item) => (item.id === 1 ? { ...item, status: 'completed' } : item));

      // Start execution but don't resolve the action yet
      act(() => {
        result.current.execute(
          {
            action: () => action,
            applyOptimistic,
            revertItem: (items) => items,
          },
          initialItems,
          setItems
        );
      });

      // setItems should have been called immediately with the optimistic update
      expect(setItems).toHaveBeenCalledTimes(1);
      expect(setItems).toHaveBeenCalledWith([
        { id: 1, name: 'Item 1', status: 'completed' },
        { id: 2, name: 'Item 2', status: 'draft' },
        { id: 3, name: 'Item 3', status: 'in_progress' },
      ]);

      // isLoading should be true while action is pending
      expect(result.current.isLoading).toBe(true);

      // Now resolve the action
      await act(async () => {
        resolveAction!();
      });

      // isLoading should be false after action completes
      expect(result.current.isLoading).toBe(false);
    });

    it('should set isLoading to true during the async operation', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      let resolveAction: () => void;
      const action = new Promise<void>((resolve) => {
        resolveAction = resolve;
      });

      act(() => {
        result.current.execute(
          {
            action: () => action,
            applyOptimistic: (items) => items,
            revertItem: (items) => items,
          },
          initialItems,
          setItems
        );
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveAction!();
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should apply the optimistic update function to the current items', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      const applyOptimistic = (items: TestItem[]) =>
        items.filter((item) => item.id !== 2);

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.resolve(),
            applyOptimistic,
            revertItem: (items) => items,
          },
          initialItems,
          setItems
        );
      });

      // First call should be the optimistic update (removing item 2)
      expect(setItems).toHaveBeenCalledWith([
        { id: 1, name: 'Item 1', status: 'draft' },
        { id: 3, name: 'Item 3', status: 'in_progress' },
      ]);
    });
  });

  describe('التراجع الدقيق (revertItem) عند فشل الطلب', () => {
    it('should revert only the affected item when action fails', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      const error = new Error('Server error');
      const onError = vi.fn();

      const applyOptimistic = (items: TestItem[]) =>
        items.map((item) => (item.id === 1 ? { ...item, status: 'completed' } : item));
      // Invert only item 1 back to its original status against the current list
      const revertItem = (items: TestItem[]) =>
        items.map((item) => (item.id === 1 ? { ...item, status: 'draft' } : item));

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.reject(error),
            applyOptimistic,
            revertItem,
            onError,
          },
          initialItems,
          setItems
        );
      });

      // First call: optimistic update
      expect(setItems).toHaveBeenNthCalledWith(1, [
        { id: 1, name: 'Item 1', status: 'completed' },
        { id: 2, name: 'Item 2', status: 'draft' },
        { id: 3, name: 'Item 3', status: 'in_progress' },
      ]);

      // Second call: only the affected item is reverted (effectively original)
      expect(setItems).toHaveBeenNthCalledWith(2, initialItems);
    });

    it('should preserve concurrent updates to other items on rollback (lost-update-safe)', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      // Optimistic change targets item 1. revertItem only ever touches item 1,
      // so any concurrent change present on other items survives the rollback.
      const applyOptimistic = (items: TestItem[]) =>
        items.map((item) => (item.id === 1 ? { ...item, status: 'completed' } : item));
      const revertItem = (items: TestItem[]) =>
        items.map((item) => (item.id === 1 ? { ...item, status: 'draft' } : item));

      // Simulate that item 2 was concurrently updated before the action failed
      const itemsWithConcurrentUpdate: TestItem[] = [
        { id: 1, name: 'Item 1', status: 'draft' },
        { id: 2, name: 'Item 2', status: 'approved' }, // concurrent update
        { id: 3, name: 'Item 3', status: 'in_progress' },
      ];

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.reject(new Error('fail')),
            applyOptimistic,
            revertItem,
          },
          itemsWithConcurrentUpdate,
          setItems
        );
      });

      // The rollback must NOT wipe out the concurrent update to item 2
      expect(setItems).toHaveBeenLastCalledWith([
        { id: 1, name: 'Item 1', status: 'draft' },
        { id: 2, name: 'Item 2', status: 'approved' },
        { id: 3, name: 'Item 3', status: 'in_progress' },
      ]);
    });

    it('should refetch when revertItem cannot invert precisely (returns null)', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      const refetch = vi.fn();

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.reject(new Error('fail')),
            applyOptimistic: (items) =>
              items.map((item) => ({ ...item, status: 'completed' })),
            revertItem: () => null, // cannot invert precisely
            refetch,
          },
          initialItems,
          setItems
        );
      });

      // Only the optimistic update was set; rollback falls back to refetch
      expect(setItems).toHaveBeenCalledTimes(1);
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('should call onError callback with the error when action fails', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      const error = new Error('Network failure');
      const onError = vi.fn();

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.reject(error),
            applyOptimistic: (items) => items,
            revertItem: (items) => items,
            onError,
          },
          initialItems,
          setItems
        );
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should set isLoading to false after rollback', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.reject(new Error('fail')),
            applyOptimistic: (items) => items,
            revertItem: (items) => items,
          },
          initialItems,
          setItems
        );
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('عدم التراجع عند نجاح الطلب', () => {
    it('should not rollback when action succeeds', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      const onSuccess = vi.fn();

      const applyOptimistic = (items: TestItem[]) =>
        items.map((item) => (item.id === 2 ? { ...item, status: 'approved' } : item));

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.resolve({ success: true }),
            applyOptimistic,
            revertItem: (items) => items,
            onSuccess,
          },
          initialItems,
          setItems
        );
      });

      // setItems should only be called once (the optimistic update), no rollback
      expect(setItems).toHaveBeenCalledTimes(1);
      expect(setItems).toHaveBeenCalledWith([
        { id: 1, name: 'Item 1', status: 'draft' },
        { id: 2, name: 'Item 2', status: 'approved' },
        { id: 3, name: 'Item 3', status: 'in_progress' },
      ]);
    });

    it('should call onSuccess callback when action succeeds', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      const onSuccess = vi.fn();

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.resolve(),
            applyOptimistic: (items) => items,
            revertItem: (items) => items,
            onSuccess,
          },
          initialItems,
          setItems
        );
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should not call onError callback when action succeeds', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      const onError = vi.fn();
      const onSuccess = vi.fn();

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.resolve(),
            applyOptimistic: (items) => items,
            revertItem: (items) => items,
            onSuccess,
            onError,
          },
          initialItems,
          setItems
        );
      });

      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should set isLoading to false after successful action', async () => {
      const { result } = renderHook(() => useOptimisticUpdate<TestItem>());

      await act(async () => {
        await result.current.execute(
          {
            action: () => Promise.resolve(),
            applyOptimistic: (items) => items,
            revertItem: (items) => items,
          },
          initialItems,
          setItems
        );
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
