import { test, expect, backendHttpOrigin } from './fixtures/backend';

/**
 * Stream 1 — critical path `files.upload-download` (Req 1.3).
 *
 * Exercises the file upload + download round trip against the deterministic
 * mock backend and asserts the downloaded content is byte-for-byte identical to
 * what was uploaded, for files up to 10 MB.
 *
 * The mock backend (see `fixtures/backend.ts`) stores the raw upload bytes and
 * echoes them back verbatim from the matching download endpoint, so a faithful
 * byte-for-byte comparison is possible without a live backend. The round trip
 * is driven from the page context via `fetch`, so the comparison happens in the
 * browser and only the verdict (sizes + SHA-256 digests) is returned to Node —
 * the multi-megabyte payload never crosses the evaluate boundary.
 */

const ONE_MB = 1024 * 1024;

interface RoundTripResult {
  ok: boolean;
  status: number;
  uploadedSize: number;
  downloadedSize: number;
  uploadedHash: string;
  downloadedHash: string;
  identical: boolean;
}

/**
 * Run a full upload→download round trip inside the page for a payload of
 * `sizeBytes`, returning the sizes and SHA-256 digests of both ends so the
 * caller can assert byte-for-byte identity.
 */
async function roundTrip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  origin: string,
  sizeBytes: number
): Promise<RoundTripResult> {
  return page.evaluate(
    async ({ origin, sizeBytes }: { origin: string; sizeBytes: number }): Promise<RoundTripResult> => {
      // Build a deterministic-but-arbitrary byte payload. crypto.getRandomValues
      // fills at most 65536 bytes per call, so fill in chunks.
      const uploaded = new Uint8Array(sizeBytes);
      const CHUNK = 65536;
      for (let offset = 0; offset < sizeBytes; offset += CHUNK) {
        crypto.getRandomValues(uploaded.subarray(offset, Math.min(offset + CHUNK, sizeBytes)));
      }

      const sha256 = async (bytes: Uint8Array): Promise<string> => {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      };

      // The app hardens `window.fetch` to reject cross-origin requests, while
      // its own API client (axios) talks to the backend over XHR. Mirror that
      // transport here so the request reaches the mocked backend on :3000.
      const xhr = <R extends 'json' | 'arraybuffer'>(
        method: string,
        url: string,
        responseType: R,
        body?: Uint8Array
      ): Promise<{ status: number; response: R extends 'json' ? unknown : ArrayBuffer }> =>
        new Promise((resolve, reject) => {
          const req = new XMLHttpRequest();
          req.open(method, url);
          req.responseType = responseType;
          req.onload = () => resolve({ status: req.status, response: req.response });
          req.onerror = () => reject(new Error(`XHR network error: ${method} ${url}`));
          req.send(body ?? null);
        });

      // Upload the raw bytes.
      const upload = await xhr('POST', `${origin}/api/files`, 'json', uploaded);
      const uploadJson = upload.response as { success: boolean; data: { id: string; sizeBytes: number } };
      const id = uploadJson.data.id;

      // Download the stored bytes and compare.
      const download = await xhr('GET', `${origin}/api/files/${id}/content`, 'arraybuffer');
      const downloaded = new Uint8Array(download.response as ArrayBuffer);

      const uploadedHash = await sha256(uploaded);
      const downloadedHash = await sha256(downloaded);

      let identical = uploaded.length === downloaded.length;
      if (identical) {
        for (let i = 0; i < uploaded.length; i++) {
          if (uploaded[i] !== downloaded[i]) {
            identical = false;
            break;
          }
        }
      }

      return {
        ok: upload.status >= 200 && upload.status < 300 && download.status >= 200 && download.status < 300,
        status: download.status,
        uploadedSize: uploaded.length,
        downloadedSize: downloaded.length,
        uploadedHash,
        downloadedHash,
        identical,
      };
    },
    { origin, sizeBytes }
  );
}

test.describe('File upload/download round trip (Req 1.3)', () => {
  test.beforeEach(async ({ page }) => {
    // Establish a real page origin (:5173) so cross-origin fetches to the mock
    // backend (:3000) carry an Origin header and pass the CORS reflection.
    await page.goto('/');
  });

  test('a small file round-trips byte-for-byte', async ({ page }) => {
    const result = await roundTrip(page, backendHttpOrigin(), 4096);

    expect(result.ok).toBe(true);
    expect(result.downloadedSize).toBe(result.uploadedSize);
    expect(result.downloadedHash).toBe(result.uploadedHash);
    expect(result.identical).toBe(true);
  });

  test('a 10 MB file is accepted and downloads byte-for-byte identical', async ({ page }) => {
    const tenMb = 10 * ONE_MB;
    const result = await roundTrip(page, backendHttpOrigin(), tenMb);

    // Upload accepted and download succeeded.
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    // Byte-for-byte fidelity at the 10 MB boundary.
    expect(result.uploadedSize).toBe(tenMb);
    expect(result.downloadedSize).toBe(tenMb);
    expect(result.downloadedHash).toBe(result.uploadedHash);
    expect(result.identical).toBe(true);
  });
});
