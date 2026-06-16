import { describe, it, expect, vi } from 'vitest';
import { partitionSettled, runBulkImport } from './bulkImport';

describe('partitionSettled', () => {
  it('places fulfilled results in succeeded and rejected results in failed, preserving order', () => {
    const items = ['a', 'b', 'c'];
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: new Error('boom') },
      { status: 'fulfilled', value: 3 },
    ];

    const summary = partitionSettled(items, results);

    expect(summary.total).toBe(3);
    expect(summary.succeeded).toEqual(['a', 'c']);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]!.item).toBe('b');
    expect((summary.failed[0]!.reason as Error).message).toBe('boom');
  });

  it('accounts for every item exactly once even when a result is missing', () => {
    const items = ['x', 'y'];
    const results: PromiseSettledResult<unknown>[] = [{ status: 'fulfilled', value: 1 }];

    const summary = partitionSettled(items, results);

    expect(summary.succeeded.length + summary.failed.length).toBe(items.length);
    expect(summary.failed[0]!.item).toBe('y');
  });
});

describe('runBulkImport', () => {
  it('continues past individual failures and reports progress for every record', async () => {
    const items = [1, 2, 3, 4];
    const writeOne = vi.fn(async (item: number) => {
      if (item % 2 === 0) throw new Error(`fail ${item}`);
      return item;
    });
    const progress: Array<{ completed: number; total: number }> = [];

    const summary = await runBulkImport(items, writeOne, (completed, total) =>
      progress.push({ completed, total }),
    );

    // Every record was attempted despite the even ones failing.
    expect(writeOne).toHaveBeenCalledTimes(4);
    expect(summary.succeeded).toEqual([1, 3]);
    expect(summary.failed.map((f) => f.item)).toEqual([2, 4]);

    // Progress is reported once per settled record, ending at total.
    expect(progress).toHaveLength(4);
    expect(progress[progress.length - 1]).toEqual({ completed: 4, total: 4 });
  });

  it('returns an empty summary for an empty input without invoking the writer', async () => {
    const writeOne = vi.fn();
    const summary = await runBulkImport([], writeOne);

    expect(writeOne).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 0, succeeded: [], failed: [] });
  });
});
