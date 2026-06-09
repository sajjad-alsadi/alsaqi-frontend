import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollReportStatus } from '../pollReportStatus';

// Mock the httpClient module
vi.mock('../../api/httpClient', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../../api/httpClient';

const mockedApi = vi.mocked(api);

describe('pollReportStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onReady immediately when status is "ready"', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { status: 'ready', downloadUrl: 'https://example.com/report.pdf' },
    } as any);

    const onReady = vi.fn();
    const onFailed = vi.fn();

    await pollReportStatus('report-123', onReady, onFailed);

    expect(onReady).toHaveBeenCalledWith('https://example.com/report.pdf');
    expect(onFailed).not.toHaveBeenCalled();
    expect(mockedApi.get).toHaveBeenCalledWith('/reports/report-123/status');
  });

  it('calls onFailed when status is "failed"', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { status: 'failed', errorMessage: 'Audit not found' },
    } as any);

    const onReady = vi.fn();
    const onFailed = vi.fn();

    await pollReportStatus('report-456', onReady, onFailed);

    expect(onFailed).toHaveBeenCalledWith('Audit not found');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onFailed with default message when failed without errorMessage', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { status: 'failed' },
    } as any);

    const onReady = vi.fn();
    const onFailed = vi.fn();

    await pollReportStatus('report-789', onReady, onFailed);

    expect(onFailed).toHaveBeenCalledWith('Report generation failed.');
  });

  it('polls again after interval when status is "pending"', async () => {
    // First call: pending, second call: ready
    mockedApi.get
      .mockResolvedValueOnce({ data: { status: 'pending' } } as any)
      .mockResolvedValueOnce({
        data: { status: 'ready', downloadUrl: 'https://example.com/done.pdf' },
      } as any);

    const onReady = vi.fn();
    const onFailed = vi.fn();

    // Start polling
    const pollPromise = pollReportStatus('report-poll', onReady, onFailed);
    await pollPromise;

    // First poll returned pending, so onReady is not called yet
    expect(onReady).not.toHaveBeenCalled();
    expect(mockedApi.get).toHaveBeenCalledTimes(1);

    // Advance timer to trigger next poll (3 seconds)
    await vi.advanceTimersByTimeAsync(3_000);

    expect(mockedApi.get).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenCalledWith('https://example.com/done.pdf');
  });

  it('times out after maxWaitMs and calls onFailed', async () => {
    mockedApi.get.mockResolvedValue({ data: { status: 'pending' } } as any);

    const onReady = vi.fn();
    const onFailed = vi.fn();

    // maxWaitMs=2500 with intervalMs=1000:
    // Poll 1 at t=0: elapsed 0 < 2500 → pending → setTimeout(1000)
    // Poll 2 at t=1000: elapsed 1000 < 2500 → pending → setTimeout(1000)
    // Poll 3 at t=2000: elapsed 2000 < 2500 → pending → setTimeout(1000)
    // Poll 4 at t=3000: elapsed 3000 > 2500 → timeout!
    const pollPromise = pollReportStatus('report-timeout', onReady, onFailed, {
      intervalMs: 1_000,
      maxWaitMs: 2_500,
    });
    await pollPromise;

    // First poll returned pending
    expect(onFailed).not.toHaveBeenCalled();

    // Second poll
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onFailed).not.toHaveBeenCalled();

    // Third poll
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onFailed).not.toHaveBeenCalled();

    // Fourth poll — now elapsed > maxWaitMs → timeout
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onFailed).toHaveBeenCalledWith('Report generation timed out.');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onFailed when API request throws an error', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('Network error'));

    const onReady = vi.fn();
    const onFailed = vi.fn();

    await pollReportStatus('report-err', onReady, onFailed);

    expect(onFailed).toHaveBeenCalledWith('Network error');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onStatusUpdate callback with each status response', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { status: 'ready', downloadUrl: 'https://example.com/r.pdf' },
    } as any);

    const onReady = vi.fn();
    const onFailed = vi.fn();
    const onStatusUpdate = vi.fn();

    await pollReportStatus('report-status', onReady, onFailed, { onStatusUpdate });

    expect(onStatusUpdate).toHaveBeenCalledWith({
      status: 'ready',
      downloadUrl: 'https://example.com/r.pdf',
    });
  });

  it('calls onFailed when ready but no downloadUrl is provided', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { status: 'ready' },
    } as any);

    const onReady = vi.fn();
    const onFailed = vi.fn();

    await pollReportStatus('report-no-url', onReady, onFailed);

    expect(onFailed).toHaveBeenCalledWith(
      'Report is ready but no download URL was provided.'
    );
    expect(onReady).not.toHaveBeenCalled();
  });
});
