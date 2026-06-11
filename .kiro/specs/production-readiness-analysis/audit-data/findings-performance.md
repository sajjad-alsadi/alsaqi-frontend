# Findings — Performance Audit

## Task 4.1: Lazy Loading and Code Splitting

### PERF-010 — PASS ✅
- **File:** `apps/web/src/App.tsx`
- **Lines:** 24–45
- **Assessment:** All 22 route-level modules use `React.lazy()` with dynamic imports. A shared `<Suspense fallback={<LoadingFallback />}>` wraps all routes (line 82). Route-level code splitting is properly implemented — each module becomes its own chunk at build time.

### PERF-011
- **Severity:** 🟡 Warning
- **File:** `apps/web/src/modules/RiskRegister.tsx`
- **Line:** 7
- **Problem:** `ExcelJS` is statically imported at the top level (`import ExcelJS from 'exceljs'`). ExcelJS is a large library (~1.2 MB unminified) used only for Excel file import/export, which is a user-triggered action rather than a page-load necessity. Although Vite's `manualChunks` separates it into a `vendor-excel` chunk, the static import means this chunk is loaded eagerly when the RiskRegister module loads, not when the user actually triggers an Excel action.
- **Production Impact:** Every user who navigates to `/risks` downloads the ExcelJS chunk (~300+ KB gzipped) even if they never import/export an Excel file, increasing initial module load time and bandwidth usage.
- **Suggested Fix:** Convert to a dynamic import at the point of use: `const ExcelJS = (await import('exceljs')).default;` inside the handler functions that parse/generate Excel files. This defers loading until the user actually clicks import/export.

### PERF-012
- **Severity:** 🟡 Warning
- **File:** `apps/web/src/components/PdfViewer.tsx`
- **Line:** 2
- **Problem:** `PdfViewer` statically imports `react-pdf` and its worker (`pdfjs-dist`) at the top level. This component is then statically imported into three modules: `AuditEvidence.tsx` (line 15), `AuditTasks.tsx` (line 16), and `Correspondence/OutgoingRegister.tsx` (line 24). While Vite splits `react-pdf` into a `vendor-pdf` chunk, the static import chain means this chunk is eagerly loaded whenever any of these three modules load — even if the user never opens a PDF.
- **Production Impact:** Three frequently-visited routes (`/evidence`, `/tasks`, `/cms`) download the react-pdf/pdfjs-dist chunk (~400+ KB gzipped including the PDF.js worker) on initial module load, regardless of whether the user actually views a PDF document.
- **Suggested Fix:** Wrap `PdfViewer` in a lazy boundary: (1) Create a lazy wrapper: `const LazyPdfViewer = React.lazy(() => import('./PdfViewer'))` in consuming modules, or (2) conditionally render PdfViewer only when a PDF is selected, using `React.lazy()` + `<Suspense>` at the call site.

### PERF-013 — PASS ✅
- **File:** `apps/web/src/utils/docxExport.ts`
- **Assessment:** The `docx` library is properly code-split. It is only consumed via dynamic `await import('../../../utils/docxExport')` in `modules/Reports/hooks/useReports.ts` (lines 162, 331). This defers loading of both the `docx` and `file-saver` packages until the user explicitly triggers a DOCX export action. Well-implemented pattern.

### PERF-014 — PASS ✅
- **File:** `apps/web/vite.config.ts`
- **Lines:** 66–138
- **Assessment:** The `manualChunks` configuration correctly separates heavy vendor libraries into dedicated chunks: `vendor-charts` (recharts + d3), `vendor-pdf` (jspdf, react-pdf), `vendor-excel` (exceljs), `vendor-editor` (codemirror). The strategy avoids a catch-all vendor chunk, allowing Rollup to tree-shake and lazy-load unused vendor code with the modules that import them. This is a well-designed chunk splitting strategy.

### PERF-015
- **Severity:** 🟢 Improvement
- **File:** `apps/web/src/components/PdfTemplateEditor.tsx`
- **Line:** 3–6
- **Problem:** `PdfTemplateEditor.tsx` statically imports 4 CodeMirror packages (`codemirror`, `@codemirror/state`, `@codemirror/lang-html`, `@codemirror/view`). However, this component is not imported anywhere in the codebase — it appears to be dead code or intended for future use. If it were connected, the entire CodeMirror bundle (~200+ KB) would be eagerly loaded.
- **Production Impact:** Currently no production impact since the component is unreferenced. However, if integrated in the future without a lazy boundary, it would add significant bundle weight to whichever module imports it.
- **Suggested Fix:** (1) If unused, remove `PdfTemplateEditor.tsx` as dead code. (2) If planned for future use, ensure it is always imported via `React.lazy()` when connected, since CodeMirror is a heavy editor dependency.

### PERF-016 — PASS ✅
- **File:** `apps/web/src/modules/Dashboard/DashboardRiskOverview.tsx`
- **Line:** 4
- **Assessment:** Recharts is imported inside the Dashboard module (`DashboardRiskOverview.tsx` and `SystemErrorAnalytics.tsx`), which is lazy-loaded via `React.lazy(() => import('./modules/Dashboard'))` in App.tsx. Combined with the `vendor-charts` manual chunk in Vite config, recharts is only downloaded when the user navigates to the Dashboard. This is the correct pattern — no issue found.

## Task 4.2: Memoization, React Query, and Context Providers

_Pending — to be populated by task 4.2 execution._

## Task 4.3: WebSocket and Asset Optimization

### PERF-001
- **Severity:** 🟡 Warning
- **File:** `apps/web/src/context/NotificationContext.tsx`
- **Line:** 119–125
- **Problem:** NotificationContext uses a raw `WebSocket` with a fixed 5-second reconnect delay (`setTimeout(connectWebSocket, 5000)`) instead of exponential backoff. The well-engineered `WebSocketClient` class in `apps/web/src/api/ws/websocket-client.ts` (which implements proper exponential backoff with jitter) is never imported or used in the actual application.
- **Production Impact:** On prolonged server outages, clients will hammer the server every 5 seconds indefinitely with no backoff, contributing to thundering herd problems during recovery. The reconnection strategy also has no maximum attempt limit, meaning it reconnects forever.
- **Suggested Fix:** Replace the raw `WebSocket` usage in `NotificationContext` with the existing `WebSocketClient` class from `apps/web/src/api/ws/websocket-client.ts`, which already implements exponential backoff (1s → 30s cap), jitter, max 10 attempts, and HTTP polling fallback.

### PERF-002
- **Severity:** 🟡 Warning
- **File:** `apps/web/src/context/NotificationContext.tsx`
- **Line:** 134–138
- **Problem:** The `playNotificationSound()` function creates a new `AudioContext` on every notification. `AudioContext` instances are expensive browser resources with a limited pool (typically 6 per page). They are never closed after use (`ctx.close()` is never called).
- **Production Impact:** In high-notification environments, AudioContext instances accumulate and are never garbage-collected until the context limit is hit, causing subsequent sound playback to fail silently. Each unclosed context also holds onto system audio resources.
- **Suggested Fix:** Create a single shared `AudioContext` instance (or reuse one) and close it after the oscillator stops, or use a module-level singleton. At minimum, call `ctx.close()` after the oscillator completes (after 0.25s timeout).

### PERF-003
- **Severity:** 🟡 Warning
- **File:** `apps/web/src/context/NotificationContext.tsx`
- **Line:** 149–161
- **Problem:** The `useEffect` cleanup in NotificationContext sets `ws.onclose = null` before calling `ws.close()`. While this prevents the reconnect logic from firing during cleanup, the effect's dependency array is `[user, isCheckingSession]` but references `connectWebSocket`, `fetchNotifications`, and `fetchUnreadCount` which are not in the deps array. This can lead to stale closures where the WebSocket reconnects with outdated callbacks.
- **Production Impact:** After user state changes, the WebSocket may reconnect using stale callback references, potentially causing notifications to be processed with outdated context or duplicate subscriptions if the effect re-runs.
- **Suggested Fix:** Either add `connectWebSocket`, `fetchNotifications`, `fetchUnreadCount` to the dependency array (with appropriate guards to prevent over-triggering), or restructure to use refs for the callbacks that don't need to trigger effect re-runs.

### PERF-004
- **Severity:** 🟢 Improvement
- **File:** `apps/web/public/`
- **Lines:** N/A (directory-level)
- **Problem:** All three assets in `public/` are unoptimized PNG files (`ALSAQI Logo S Left.png`, `ALSAQI Logo S Under.png`, `logo.png`). No WebP or AVIF variants are provided. Furthermore, `ALSAQI Logo S Left.png` and `ALSAQI Logo S Under.png` are never referenced in any source file — they appear to be unused dead assets.
- **Production Impact:** PNG logos are typically 3-5× larger than modern WebP equivalents. Unused assets increase deployment size and Docker image size unnecessarily. The `Logo.tsx` component serves `logo.png` without `loading="lazy"`, `fetchpriority`, or `decoding="async"` attributes — though as a logo it likely loads above the fold so this is minor.
- **Suggested Fix:** (1) Remove unused `ALSAQI Logo S Left.png` and `ALSAQI Logo S Under.png` from `public/`. (2) Convert `logo.png` to WebP format for smaller payload. (3) Consider adding `decoding="async"` to the `<img>` tag in `Logo.tsx`.

### PERF-005 — PASS ✅
- **File:** `apps/web/src/api/ws/websocket-client.ts`
- **Assessment:** The WebSocket client class is well-engineered with no memory leak potential. It:
  - Properly nullifies all event handlers before closing the socket (`closeWebSocket()` sets `onopen`, `onmessage`, `onclose`, `onerror` to null)
  - Clears all timers on disconnect (`clearReconnectTimer()`, `stopPolling()`)
  - Uses an `isDestroyed` flag to prevent operations after disconnect
  - Implements exponential backoff with jitter (±20%) to prevent thundering herd
  - Caps reconnection at 10 attempts before entering a `failed` state
  - Falls back to HTTP polling and automatically attempts WebSocket reconnection
  - Aborts in-flight poll requests are not an issue since polling uses fire-and-forget `fetch`

### PERF-006 — PASS ✅
- **File:** `apps/web/src/hooks/useConnectionStatus.ts`
- **Assessment:** The hook implements comprehensive cleanup with no memory leak potential. It:
  - Removes `online`/`offline` event listeners on unmount
  - Clears the ping interval (`clearInterval`)
  - Clears the debounce timer (`clearTimeout`)
  - Aborts in-flight fetch requests via `AbortController`
  - Uses `isMountedRef` to prevent state updates after unmount
  - Properly manages refs to avoid stale closure issues
