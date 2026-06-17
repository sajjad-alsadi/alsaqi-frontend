# Implementation Plan: App Rebuild — Performance Optimization

## Overview

This plan implements comprehensive performance optimization for the Al-Saqi audit management SPA. Work proceeds in layers: bundle splitting and build tooling first (foundation), then initial load and asset optimization, followed by runtime performance improvements, service worker integration, and finally performance monitoring with CI gates. Each task is a discrete coding step that builds on previous steps, culminating in full integration.

## Tasks

- [x] 1. Bundle Optimization — Chunk Splitting and Build Tooling
  - [x] 1.1 Refine manualChunks to 3-tier model in vite.config.ts
    - Update the `manualChunks` function in `apps/web/vite.config.ts` to implement the 3-tier chunk splitting strategy (Critical Path, Deferred, On-Demand)
    - Move `motion`, `react-hot-toast`, `goober` out of `vendor-react` into separate `vendor-motion` and `vendor-toast` chunks (Tier 2)
    - Ensure Tier 3 chunks (`vendor-charts`, `vendor-pdf`, `vendor-excel`, `vendor-editor`) load only when consuming routes activate
    - Add Terser `compress.passes: 2` for improved dead-code removal
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Create bundleBudgetPlugin Vite plugin
    - Create `apps/web/src/plugins/bundleBudget.ts` implementing the `BudgetConfig` interface
    - Plugin runs post-build: iterates output chunks, computes gzip sizes via `zlib.gzipSync`
    - Compares against thresholds: individual chunk ≤ 150 KB gzip, initial payload ≤ 250 KB gzip
    - Emits warnings locally, errors in CI (when `process.env.CI` is set)
    - Writes `dist/bundle-stats.json` with the `BundleStats` schema (chunk name, raw size, gzip size, brotli size, `isInitial` flag)
    - _Requirements: 1.1, 1.6, 6.3, 6.4_

  - [x] 1.3 Integrate bundleBudgetPlugin and visualizer into vite.config.ts
    - Import and register `bundleBudgetPlugin` in the Vite plugins array
    - Configure `initialChunks` list: `['vendor-react', 'vendor-ui', 'vendor-i18n', 'app-entry']`
    - Set `failOnOverage: !!process.env.CI`
    - Verify existing `rollup-plugin-visualizer` remains triggered by `ANALYZE=true`
    - _Requirements: 1.5, 1.6, 6.3_

  - [x] 1.4 Write property test for bundle budget check logic
    - **Property 15: Bundle budget check rejects overage**
    - **Validates: Requirements 6.3**
    - Use fast-check to generate arbitrary chunk size arrays; assert failure when max chunk > 150 KB or initial total > 250 KB

  - [x] 1.5 Write property test for CI delta comparison
    - **Property 16: CI delta comparison rejects excessive growth**
    - **Validates: Requirements 6.5**
    - Use fast-check to generate (currentTotal, baselineTotal) pairs; assert failure when delta > 5120 bytes without override

- [x] 2. Initial Load Optimization — Critical CSS, Fonts, Preloads, App Shell
  - [x] 2.1 Create criticalCssPlugin Vite plugin
    - Create `apps/web/src/plugins/criticalCss.ts` implementing `transformIndexHtml` hook
    - Inline the critical CSS (background color, spinner, grid layout frame, font-face for Tajawal) into `<style>` before `</head>`
    - Include RTL-aware media query overrides and dark mode custom property
    - _Requirements: 2.1, 2.6_

  - [x] 2.2 Self-host and subset Tajawal/Inter fonts
    - Add subset WOFF2 files to `apps/web/public/fonts/`: `tajawal-arabic-{400,700,800}.woff2`, `tajawal-latin-{400,700,800}.woff2`, `inter-latin-{400,700}.woff2`
    - Create `apps/web/src/styles/fonts.css` with `@font-face` declarations using `unicode-range` descriptors for Arabic (U+0600–06FF, U+FB50–FDFF, U+FE70–FEFF) and Latin (U+0000–007F, U+0080–00FF)
    - Set `font-display: swap` on all declarations
    - Remove Google Fonts `@import` from `index.css`
    - _Requirements: 4.1, 4.2, 2.2_

  - [x] 2.3 Add font preload and modulepreload hints
    - Add `<link rel="preload">` for Tajawal Arabic 400, 700, 800 in `index.html`
    - Create a Vite `transformIndexHtml` plugin (or extend criticalCssPlugin) to emit `<link rel="modulepreload">` for critical-path chunks (`vendor-react`, `vendor-ui`, `vendor-i18n`, app entry) at build time
    - _Requirements: 2.2, 2.3_

  - [x] 2.4 Implement dynamic locale loading via i18next-http-backend
    - Refactor `apps/web/src/i18n.ts` to use `HttpBackend` with `loadPath: '/locales/{{lng}}.json'`
    - Move translation JSON files from static imports to `public/locales/ar.json` and `public/locales/en.json`
    - Ensure only the active locale file is fetched on initialization
    - _Requirements: 2.5_

  - [x] 2.5 Implement App Shell skeleton and auth-gated loading
    - Create `apps/web/src/components/AppShellSkeleton.tsx` — CSS-only skeleton matching critical CSS layout
    - Refactor `AppContent` to render only Login when unauthenticated (no Layout, no lazy routes)
    - Defer `vendor-query` and `vendor-forms` import until after authentication is confirmed
    - _Requirements: 2.4, 2.6_

  - [x] 2.6 Write property test for single active locale loaded
    - **Property 3: Single active locale loaded**
    - **Validates: Requirements 2.5**
    - Assert that for any locale from {ar, en}, exactly one translation file fetch occurs during init

  - [x] 2.7 Write property test for font-face unicode-range declarations
    - **Property 8: Font-face declarations include unicode-range**
    - **Validates: Requirements 4.2**
    - Parse produced CSS and assert every Tajawal @font-face rule has a unicode-range descriptor covering Arabic or Latin ranges

- [x] 3. Checkpoint — Build and bundle verification
  - Ensure all tests pass, ask the user if questions arise.
  - Run `ANALYZE=true npm run build` and verify bundle-stats.json output, chunk names, and budget compliance.

- [x] 4. Runtime Performance — Virtualization, Context Splitting, Memoization, Query Tiers
  - [x] 4.1 Create VirtualTable component
    - Create `apps/web/src/components/VirtualTable.tsx` implementing the generic virtualized table
    - Accept `data`, `rowHeight`, `overscan` (default 10), `columns`, `renderRow` props
    - Use absolute positioning with `transform: translateY()` for each row
    - Defer off-screen row measurement to `requestIdleCallback`
    - Use `inset-inline-start: 0` for RTL compatibility
    - _Requirements: 3.2, 3.6_

  - [x] 4.2 Integrate VirtualTable into existing data tables
    - Replace existing table rendering in modules that display > 50 rows (audits list, findings list, etc.) with `VirtualTable`
    - Preserve existing column definitions and row rendering logic
    - _Requirements: 3.2, 3.6_

  - [x] 4.3 Split monolithic AppContext into focused providers
    - Create separate context files: `AuthContext`, `UserContext`, `PreferencesContext`, `PermissionsContext`, `NotificationContext`
    - Each provider exposes split `useXValue()` and `useXActions()` hooks (value/dispatch separation)
    - Update `NotificationProvider` to use `useReducer` with separate value and dispatch contexts
    - Wire new providers in `App.tsx` replacing the monolithic provider
    - _Requirements: 3.5_

  - [x] 4.4 Enable React Compiler or add manual memoization
    - Add `babel-plugin-react-compiler` to `@vitejs/plugin-react` Babel config in `vite.config.ts`
    - If React Compiler is not stable for this codebase, wrap data-table row components, sidebar items, and form field components in `React.memo`
    - Add `useMemo` for derived state (filtered/sorted lists) and `useCallback` for event handlers passed to memoized children
    - _Requirements: 3.7, 3.3_

  - [x] 4.5 Configure TanStack Query freshness tiers
    - Create `apps/web/src/lib/queryDefaults.ts` with `QUERY_STALE_TIMES` and `FRESHNESS_TIERS` configuration
    - Set global `QueryClient` default `staleTime: 5 * 60 * 1000` (reference-data tier)
    - Override volatile queries (notifications, audit-trail) to 1 minute staleTime
    - Override rarely-changing queries (settings, user-profile) to 30 minutes staleTime
    - _Requirements: 3.4, 5.6_

  - [x] 4.6 Write property test for VirtualTable row count bound
    - **Property 4: Virtual table row count bounded by viewport**
    - **Validates: Requirements 3.2**
    - Use fast-check to generate random N > 50 and viewport dimensions; assert mounted rows ≤ visibleRows + 2 * overscan

  - [x] 4.7 Write property test for cache freshness tier assignment
    - **Property 7: Cache freshness tiers applied correctly**
    - **Validates: Requirements 3.4, 5.6**
    - Use fast-check to generate arbitrary query key prefixes from each category; assert correct staleTime resolution

- [x] 5. Asset Optimization — Images, CSS Output, SVG
  - [x] 5.1 Create OptimizedImage component with WebP support
    - Create `apps/web/src/components/OptimizedImage.tsx` with `<picture>` element and WebP `<source>`
    - Support `loading="lazy"`, `decoding="async"`, `width`, `height` props
    - _Requirements: 4.3_

  - [x] 5.2 Configure CSS output optimization
    - Verify Tailwind CSS v4 content detection scans all `.tsx`, `.ts`, `.html` files (purge unused utilities)
    - Configure build to output single CSS file with content-hash naming (`assets/styles.[hash].css`)
    - Add non-blocking CSS loading pattern (`<link rel="preload" as="style">`) in HTML template
    - _Requirements: 4.4, 4.5_

  - [x] 5.3 Verify tree-shaking of lucide-react SVG icons
    - Audit all `lucide-react` imports across the codebase — ensure named imports only (no `import *`)
    - Verify build output only contains referenced SVG paths, not entire icon library
    - _Requirements: 4.6, 1.4_

  - [x] 5.4 Write property test for content-hash fingerprints
    - **Property 10: Content-hash fingerprints on all emitted assets**
    - **Validates: Requirements 5.1**
    - After build, assert every JS/CSS/WOFF2 file in `dist/assets/` matches `[name].[hash].[ext]` pattern

  - [x] 5.5 Write property test for raster image WebP conversion
    - **Property 9: Raster images produce WebP with fallback**
    - **Validates: Requirements 4.3**
    - Assert OptimizedImage renders `<picture>` with WebP source and original format fallback for any image src

- [x] 6. Checkpoint — Runtime and asset verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify VirtualTable renders correct row count, context splitting prevents unnecessary re-renders, and CSS output is within 50 KB gzip budget.

- [x] 7. Service Worker — Precaching, Runtime Strategies, Update Flow
  - [x] 7.1 Create service worker with precache manifest and cache strategies
    - Create `apps/web/public/sw.js` implementing:
      - Precache manifest for App Shell assets (index.html, critical-path JS, CSS, Tajawal fonts)
      - Navigation requests: cache-first (App Shell pattern)
      - API GET requests: network-first with 3-second timeout fallback to cache
      - Static assets (JS, CSS, fonts): cache-first
      - Locale files: stale-while-revalidate
    - Implement `networkFirstWithTimeout` helper with AbortController
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 7.2 Implement cache versioning and cleanup on activate
    - Add `CACHE_VERSION` constant and `EXPECTED_CACHES` array in `sw.js`
    - On `activate` event: delete stale caches not in expected set, then `clients.claim()`
    - _Requirements: 5.5_

  - [x] 7.3 Create service worker registration with update notification
    - Create `apps/web/src/sw-register.ts` with `registerServiceWorker()` function
    - Listen for `updatefound` and `statechange` events
    - Dispatch `CustomEvent('sw:updated')` when new worker activates
    - Create `apps/web/src/components/UpdateNotification.tsx` — non-intrusive toast: "A new version is available. Refresh to update."
    - _Requirements: 5.5_

  - [x] 7.4 Create Vite plugin for precache manifest generation
    - Create `apps/web/src/plugins/precacheManifest.ts`
    - At build time: collect App Shell asset filenames with content hashes
    - Inject manifest into `sw.js` (or generate a manifest JSON file imported by SW)
    - _Requirements: 5.2_

  - [x] 7.5 Write property test for navigation request App Shell caching
    - **Property 12: Navigation requests served from App Shell cache**
    - **Validates: Requirements 5.3**
    - Mock fetch events with `request.mode === 'navigate'`; assert response is cached `/index.html`

  - [x] 7.6 Write property test for API network-first with timeout
    - **Property 13: API GET requests use network-first with timeout fallback**
    - **Validates: Requirements 5.4**
    - Use fast-check for varying timeout/network conditions; assert cache fallback when network exceeds 3s

- [x] 8. Performance Monitoring — Web Vitals, Reporter, CI Gates
  - [x] 8.1 Implement WebVitalsMonitor class
    - Create or refactor `apps/web/src/utils/webVitalsMonitor.ts`
    - Collect LCP, FID, CLS, FCP, TTFB using `web-vitals` library
    - Implement `classifyMetric` function with thresholds: LCP [2500, 4000], FID [100, 300], CLS [0.1, 0.25], FCP [1800, 3000], TTFB [800, 1800]
    - Buffer metrics with `init()` and `flush()` methods
    - _Requirements: 6.1, 6.2_

  - [x] 8.2 Implement beacon-based Web Vitals reporter
    - Create `apps/web/src/utils/webVitalsReporter.ts`
    - Batch and send metrics every 10 seconds via `navigator.sendBeacon` to `/api/metrics/web-vitals`
    - Flush on `visibilitychange` (hidden) to avoid losing metrics on navigation
    - Fallback to `fetch` with `keepalive: true` when sendBeacon unavailable
    - _Requirements: 6.6_

  - [x] 8.3 Create CI bundle delta comparison script
    - Create `apps/web/scripts/check-bundle-delta.mjs`
    - Read `dist/bundle-stats.json` and `.bundle-baseline.json`
    - Fail if total gzip size increases > 5 KB without `BUDGET_OVERRIDE=true`
    - Output human-readable delta message
    - _Requirements: 6.5_

  - [x] 8.4 Add Lighthouse CI configuration
    - Create `apps/web/lighthouserc.js` with assertions: Performance ≥ 90, Accessibility ≥ 90, Best Practices ≥ 80
    - Configure to run against preview build URL
    - _Requirements: 6.7_

  - [x] 8.5 Write property test for Web Vitals classification
    - **Property 14: Web Vitals classification correctness**
    - **Validates: Requirements 6.1, 6.2**
    - Use fast-check to generate random metric values for each metric name; assert correct rating classification against thresholds

- [x] 9. Integration and Wiring
  - [x] 9.1 Wire all Vite plugins together in vite.config.ts
    - Register `criticalCssPlugin`, `bundleBudgetPlugin`, and `precacheManifestPlugin` in the plugins array
    - Ensure correct plugin ordering (React → Tailwind → env validator → criticalCss → budgetPlugin → precacheManifest → visualizer → Sentry)
    - _Requirements: 1.5, 1.6, 2.1, 2.3, 5.2, 6.3_

  - [x] 9.2 Wire service worker registration in app entry
    - Import and call `registerServiceWorker()` in `main.tsx` after app mounts
    - Add `UpdateNotification` component in the app root
    - _Requirements: 5.2, 5.5_

  - [x] 9.3 Wire Web Vitals monitor and reporter in app entry
    - Initialize `webVitalsMonitor.init()` and `initWebVitalsReporter()` in `main.tsx`
    - Ensure reporting runs after app mount to avoid blocking initial render
    - _Requirements: 6.1, 6.6_

  - [x] 9.4 Update build scripts in package.json
    - Add `check-bundle-delta.mjs` to the CI script pipeline
    - Add lighthouse CI command to CI workflow
    - Ensure `npm run build` triggers budget checks
    - _Requirements: 6.3, 6.5, 6.7_

  - [x] 9.5 Write integration tests for build output verification
    - Verify chunk names match expected pattern (vendor-react, vendor-ui, etc.)
    - Verify content-hash filenames in dist/assets
    - Verify bundle-stats.json schema compliance
    - _Requirements: 1.1, 1.3, 5.1, 6.4_

- [x] 10. Final Checkpoint — Full verification
  - Ensure all tests pass, ask the user if questions arise.
  - Run full build and verify: bundle budget compliance, bundle-stats.json output, service worker precache manifest, Lighthouse CI scores.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 3, 4, 7, 8, 9, 10, 12, 13, 14, 15, 16)
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with Vite 7, React 19, and vitest for testing
- `packages/shared` is frozen — no modifications allowed
- All CSS and layout changes must preserve RTL/Arabic support

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.2", "2.3", "2.4", "4.1"] },
    { "id": 2, "tasks": ["1.3", "2.5", "4.3", "5.1", "5.2"] },
    { "id": 3, "tasks": ["1.4", "1.5", "2.6", "2.7", "4.2", "4.4", "4.5", "5.3"] },
    { "id": 4, "tasks": ["4.6", "4.7", "5.4", "5.5", "7.1", "8.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "8.2", "8.3", "8.4"] },
    { "id": 6, "tasks": ["7.5", "7.6", "8.5", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 8, "tasks": ["9.5"] }
  ]
}
```
