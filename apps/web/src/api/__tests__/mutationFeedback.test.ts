/**
 * Unit tests for the Mutation_Feedback_Policy (`withMutationFeedback`).
 *
 * Covers Requirement 18 (Visible Mutation Failure Feedback):
 *  - 18.1: a failed mutation surfaces a user-visible failure indication.
 *  - 18.2: a failed submission keeps the form open (the wrapper re-throws so the
 *          caller's success/close path never runs).
 *  - 18.3: a mutation error is never discarded without surfacing (no silent catch).
 *  - 18.4: a successful mutation surfaces a success indication.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the toast surface so we can assert on success/error indications.
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import toast from 'react-hot-toast';
import { withMutationFeedback } from '../mutationFeedback';

const mockedToast = vi.mocked(toast);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withMutationFeedback — success path (Req 18.4)', () => {
  it('fires a success toast when successMessage is provided', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const wrapped = withMutationFeedback(fn, { successMessage: 'Saved' });

    const result = await wrapped();

    expect(result).toBe('ok');
    expect(mockedToast.success).toHaveBeenCalledTimes(1);
    expect(mockedToast.success).toHaveBeenCalledWith('Saved');
    expect(mockedToast.error).not.toHaveBeenCalled();
  });

  it('does not fire a success toast when successMessage is omitted', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const wrapped = withMutationFeedback(fn);

    const result = await wrapped();

    expect(result).toBe(42);
    expect(mockedToast.success).not.toHaveBeenCalled();
  });

  it('passes through arguments and runs onSuccess before the success toast', async () => {
    const order: string[] = [];
    const fn = vi.fn(async (a: number, b: number) => a + b);
    const onSuccess = vi.fn(() => order.push('onSuccess'));
    mockedToast.success.mockImplementation(() => {
      order.push('toast');
      return 'id';
    });

    const wrapped = withMutationFeedback(fn, { successMessage: 'Done', onSuccess });
    const result = await wrapped(2, 3);

    expect(result).toBe(5);
    expect(fn).toHaveBeenCalledWith(2, 3);
    expect(onSuccess).toHaveBeenCalledWith(5);
    expect(order).toEqual(['onSuccess', 'toast']);
  });
});

describe('withMutationFeedback — failure path (Req 18.1, 18.2)', () => {
  it('surfaces an error toast and re-throws so the form stays open', async () => {
    const error = new Error('boom');
    const fn = vi.fn().mockRejectedValue(error);
    const wrapped = withMutationFeedback(fn, { errorMessage: 'Save failed' });

    await expect(wrapped()).rejects.toBe(error);
    expect(mockedToast.error).toHaveBeenCalledTimes(1);
    expect(mockedToast.error).toHaveBeenCalledWith('Save failed');
    // Form stays open: success indication must never fire on failure.
    expect(mockedToast.success).not.toHaveBeenCalled();
  });

  it('derives a user-visible failure message from the error when errorMessage is omitted (Req 18.1)', async () => {
    const error = {
      response: { data: { error: 'Server rejected the request' } },
    };
    const fn = vi.fn().mockRejectedValue(error);
    const wrapped = withMutationFeedback(fn);

    await expect(wrapped()).rejects.toBe(error);
    expect(mockedToast.error).toHaveBeenCalledWith('Server rejected the request');
  });

  it('invokes onError with the original error to allow inline surfacing (Req 18.1)', async () => {
    const error = new Error('inline');
    const fn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const wrapped = withMutationFeedback(fn, { errorMessage: 'failed', onError });

    await expect(wrapped()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('withMutationFeedback — no silent catch (Req 18.3)', () => {
  it('always re-throws the original error after surfacing it', async () => {
    const error = new Error('must propagate');
    const fn = vi.fn().mockRejectedValue(error);
    const wrapped = withMutationFeedback(fn, { errorMessage: 'failed' });

    await expect(wrapped()).rejects.toThrow('must propagate');
    // The error was surfaced (not swallowed) AND re-thrown.
    expect(mockedToast.error).toHaveBeenCalledTimes(1);
  });

  it('re-throws even when an onError callback runs without throwing', async () => {
    const error = new Error('not swallowed');
    const fn = vi.fn().mockRejectedValue(error);
    // onError intentionally returns normally — the policy must still re-throw.
    const onError = vi.fn(() => undefined);
    const wrapped = withMutationFeedback(fn, { onError, errorMessage: 'failed' });

    await expect(wrapped()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
