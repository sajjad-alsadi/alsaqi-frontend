/**
 * pollReportStatus — Polls the server for report generation status.
 *
 * After requesting report generation (POST /reports/generate), the server
 * returns a reportId. This utility polls GET /reports/:reportId/status at
 * a 3-second interval until the report is ready, failed, or a 5-minute
 * timeout is exceeded.
 *
 * Requirements: 8.1, 8.4, 8.6
 */
import api from '../api/httpClient';

/** Status returned by GET /reports/:reportId/status */
export interface ReportStatusResponse {
  status: 'pending' | 'ready' | 'failed';
  downloadUrl?: string;
  errorMessage?: string;
}

export interface PollReportStatusOptions {
  /** Polling interval in milliseconds. Default: 3000 (3 seconds) */
  intervalMs?: number;
  /** Maximum wait time in milliseconds. Default: 300000 (5 minutes) */
  maxWaitMs?: number;
  /** Called on each poll with the current status (for UI updates) */
  onStatusUpdate?: (status: ReportStatusResponse) => void;
}

/**
 * Polls the report generation status until it reaches a terminal state
 * (ready or failed) or the timeout is exceeded.
 *
 * @param reportId - The ID returned by POST /reports/generate
 * @param onReady - Called with the download URL when the report is ready
 * @param onFailed - Called with an error message when generation fails or times out
 * @param options - Optional configuration for polling behavior
 */
export async function pollReportStatus(
  reportId: string,
  onReady: (downloadUrl: string) => void,
  onFailed: (error: string) => void,
  options: PollReportStatusOptions = {}
): Promise<void> {
  const {
    intervalMs = 3_000,
    maxWaitMs = 5 * 60_000,
    onStatusUpdate,
  } = options;

  const startTime = Date.now();

  const poll = async () => {
    // Check timeout
    if (Date.now() - startTime > maxWaitMs) {
      onFailed('Report generation timed out.');
      return;
    }

    try {
      const response = await api.get<ReportStatusResponse>(
        `/reports/${reportId}/status`
      );
      const data: ReportStatusResponse = response.data;

      // Notify UI of current status
      onStatusUpdate?.(data);

      if (data.status === 'ready') {
        if (data.downloadUrl) {
          onReady(data.downloadUrl);
        } else {
          onFailed('Report is ready but no download URL was provided.');
        }
      } else if (data.status === 'failed') {
        onFailed(data.errorMessage || 'Report generation failed.');
      } else {
        // Still pending — schedule next poll
        setTimeout(poll, intervalMs);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to check report status.';
      onFailed(message);
    }
  };

  await poll();
}
