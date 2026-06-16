/**
 * Property-based tests for object-URL lifecycle balance in the PDF viewer.
 *
 * Property 16: PDF viewer never leaks object URLs
 *   For any sequence of `url`-prop changes and unmount events, the number of
 *   `URL.revokeObjectURL` calls equals the number of `URL.createObjectURL`
 *   calls — every created object URL is eventually revoked, including when the
 *   component unmounts before a load completes.
 *   **Validates: Requirements 25.2, 25.3**
 *
 * Feature: code-review-remediation, Property 16
 *
 * The component's `data:` path creates object URLs synchronously inside the
 * effect, so the test drives a fast-check-generated sequence of `url`-prop
 * changes (valid PDF data URLs, empty strings, and invalid data) followed by an
 * unmount. URL.createObjectURL / URL.revokeObjectURL are spied with unique
 * per-call URLs so we can assert both call-count balance and that the exact set
 * of created URLs is the set of revoked URLs after unmount.
 *
 * Inputs are generated with fast-check (`fc.assert`, >= 100 runs) and exercised
 * through a synchronous mount/rerender/unmount loop. The viewer's data path
 * creates/revokes object URLs synchronously inside the effect (and its cleanup),
 * so no async settling is required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import PdfViewer from './PdfViewer';

// ─── Module mocks ────────────────────────────────────────────────────────────

// react-pdf pulls in pdfjs and renders a real PDF canvas; replace it with inert
// stand-ins so mounting the viewer never touches the worker or DOM canvas.
vi.mock('react-pdf', () => ({
  Document: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

// The `?url` worker asset import has no meaning under vitest — stub it.
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf-worker-url' }));

// The viewer fetches via the raw HTTP client on the non-data path; the test only
// exercises the synchronous data path, but mock it so nothing hits the network.
vi.mock('../api/httpClient', () => ({
  __esModule: true,
  default: { get: vi.fn().mockRejectedValue(new Error('not used')) },
}));

// formatService depends on PreferencesContext; the URL lifecycle is independent
// of formatting, so provide a minimal stand-in.
vi.mock('../utils/formatService', () => ({
  useFormat: () => ({ formatNumber: (n: number | string | undefined) => String(n ?? 0) }),
}));

// The global test setup mocks react-i18next with a `useTranslation` that returns
// a FRESH `t` function on every render. PdfViewer's load effect depends on
// `[url, t]`, so an unstable `t` would make the effect re-run on every commit
// (an artifact of the mock, not real i18n where `t` is stable). Override with a
// stable `t` so the effect re-runs only on real `url` changes — matching
// production behavior.
const stableT = (key: string) => key;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: stableT, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  Trans: ({ children }: { children?: React.ReactNode }) => children,
}));

// ─── Generators ─────────────────────────────────────────────────────────────

type UrlKind = 'valid' | 'empty' | 'invalid';

/** Kinds of `url` prop the viewer may receive in sequence. */
const arbUrlKind = fc.constantFrom<UrlKind>('valid', 'empty', 'invalid');

/** A sequence of 1..15 prop changes, ending in an unmount. */
const arbUrlSequence = fc.array(arbUrlKind, { minLength: 1, maxLength: 15 });

/** Build a unique `url` prop string for a given kind + sequence index. */
function urlFor(kind: UrlKind, index: number): string {
  switch (kind) {
    case 'empty':
      return '';
    case 'valid':
      // Bytes start with the %PDF- magic number, so the viewer creates an
      // object URL synchronously. The index keeps each url string unique so the
      // effect re-runs on every prop change.
      return `data:application/pdf;base64,${btoa(`%PDF-1.4\nmock-pdf-${index}`)}`;
    case 'invalid':
      // Valid base64, but no %PDF- magic number → the viewer reports an error
      // and creates no object URL.
      return `data:application/pdf;base64,${btoa(`not-a-pdf-${index}`)}`;
  }
}

// ─── Property ───────────────────────────────────────────────────────────────

describe('PdfViewer object-URL lifecycle balance (Property 16)', () => {
  let createdUrls: string[];
  let revokedUrls: string[];
  let createSpy: ReturnType<typeof vi.spyOn>;
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let counter = 0;

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];

    // Unique URL per call so each created URL can be matched against a revoke.
    createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:http://localhost/pdf-${counter++}`;
      createdUrls.push(url);
      return url;
    });
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revokedUrls.push(url);
    });
  });

  afterEach(() => {
    cleanup();
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('revokes exactly the object URLs it creates across prop changes + unmount', () => {
    fc.assert(
      fc.property(arbUrlSequence, (kinds) => {
        createdUrls.length = 0;
        revokedUrls.length = 0;

        const urls = kinds.map((kind, i) => urlFor(kind, i));

        const { rerender, unmount } = render(<PdfViewer url={urls[0]} />);
        for (let i = 1; i < urls.length; i++) {
          rerender(<PdfViewer url={urls[i]} />);
        }
        // Unmount drives the final cleanup that must revoke any tracked URL.
        unmount();
        cleanup();

        // The core property: every created object URL is eventually revoked.
        expect(revokedUrls.length).toBe(createdUrls.length);

        // Stronger: the multiset of revoked URLs equals the multiset of created
        // URLs, so no URL is left un-revoked and none is revoked that was never
        // created.
        expect([...revokedUrls].sort()).toEqual([...createdUrls].sort());
      }),
      { numRuns: 100 }
    );
  });
});
