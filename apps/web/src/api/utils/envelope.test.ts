/**
 * Unit tests for the envelope normalization helpers.
 *
 * Covers `toList`, `toPagination`, and `toData` across array / object / null /
 * envelope inputs, validating envelope-agnostic consumption and graceful
 * pagination fallback.
 */
import { describe, it, expect } from 'vitest';
import { toList, toPagination, toData } from './envelope';

// ─── toList ──────────────────────────────────────────────────────────────────

describe('toList', () => {
  it('returns the payload as-is when it is already an array (unwrapped)', () => {
    const arr = [{ id: 1 }, { id: 2 }];
    expect(toList(arr)).toBe(arr);
  });

  it('returns an empty array unchanged', () => {
    const arr: unknown[] = [];
    expect(toList(arr)).toEqual([]);
  });

  it('returns the inner data array from the non-enveloped { data, pagination } shape', () => {
    const data = [{ id: 1 }];
    const payload = { data, pagination: { total: 1, totalPages: 1 } };
    expect(toList(payload)).toBe(data);
  });

  it('returns the inner data array from the raw success envelope', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const payload = { success: true, data };
    expect(toList(payload)).toBe(data);
  });

  it('returns an empty array for null', () => {
    expect(toList(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(toList(undefined)).toEqual([]);
  });

  it('returns an empty array for an object without a data array', () => {
    expect(toList({ foo: 'bar' })).toEqual([]);
  });

  it('returns an empty array when data is present but not an array', () => {
    expect(toList({ data: { nested: true } })).toEqual([]);
  });
});

// ─── toPagination ────────────────────────────────────────────────────────────

describe('toPagination', () => {
  it('uses the existing pagination.total and pagination.totalPages when present', () => {
    const payload = { data: [], pagination: { total: 42, totalPages: 5 } };
    expect(toPagination(payload, 0)).toEqual({ total: 42, totalPages: 5 });
  });

  it('falls back to itemCount and 1 for an unwrapped array (pagination discarded)', () => {
    const payload = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(toPagination(payload, payload.length)).toEqual({
      total: 3,
      totalPages: 1,
    });
  });

  it('falls back to itemCount and 1 for null', () => {
    expect(toPagination(null, 7)).toEqual({ total: 7, totalPages: 1 });
  });

  it('falls back to itemCount and 1 for an object without pagination', () => {
    expect(toPagination({ data: [] }, 4)).toEqual({ total: 4, totalPages: 1 });
  });

  it('falls back per-field when pagination is partial (missing totalPages)', () => {
    const payload = { data: [], pagination: { total: 99 } };
    expect(toPagination(payload, 0)).toEqual({ total: 99, totalPages: 1 });
  });

  it('falls back per-field when pagination is partial (missing total)', () => {
    const payload = { data: [], pagination: { totalPages: 3 } };
    expect(toPagination(payload, 10)).toEqual({ total: 10, totalPages: 3 });
  });

  it('preserves a total of 0 rather than treating it as absent', () => {
    const payload = { data: [], pagination: { total: 0, totalPages: 0 } };
    expect(toPagination(payload, 5)).toEqual({ total: 0, totalPages: 0 });
  });
});

// ─── toData ──────────────────────────────────────────────────────────────────

describe('toData', () => {
  it('returns the inner data from the raw success envelope', () => {
    const inner = { count: 3, status: 'ok' };
    const payload = { success: true, data: inner };
    expect(toData(payload)).toBe(inner);
  });

  it('returns inner data even when it is null', () => {
    const payload = { success: true, data: null };
    expect(toData(payload)).toBeNull();
  });

  it('returns the payload as-is when already unwrapped (plain object)', () => {
    const payload = { count: 3, status: 'ok' };
    expect(toData(payload)).toBe(payload);
  });

  it('returns the payload as-is for an object with success but no data field', () => {
    const payload = { success: true };
    expect(toData(payload)).toBe(payload);
  });

  it('returns the payload as-is for an object with data but no success field', () => {
    const payload = { data: { x: 1 } };
    expect(toData(payload)).toBe(payload);
  });

  it('returns null unchanged', () => {
    expect(toData(null)).toBeNull();
  });

  it('returns undefined unchanged', () => {
    expect(toData(undefined)).toBeUndefined();
  });

  it('returns an array payload unchanged', () => {
    const arr = [1, 2, 3];
    expect(toData(arr)).toBe(arr);
  });
});
