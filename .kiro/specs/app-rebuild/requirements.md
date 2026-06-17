# Requirements Document

## Introduction

Comprehensive performance optimization of the Al-Saqi (الساقي) audit management single-page application. The objective is to reduce bundle size, accelerate initial load, improve runtime/navigation performance, optimize assets, strengthen caching strategies, and establish performance monitoring to prevent regressions. All work must preserve RTL/Arabic support, the existing design system (DESIGN.md), and treat `packages/shared` as frozen (read-only).

## Glossary

- **Build_System**: The Vite 7 + Rollup build pipeline configured in `apps/web/vite.config.ts` that compiles, bundles, and optimizes application source code for production deployment.
- **Critical_Path**: The minimal set of JavaScript, CSS, and font resources required to render the authenticated shell (sidebar, header, and initial route content) after login.
- **Bundle_Analyzer**: The `rollup-plugin-visualizer` integration that generates a `dist/bundle-stats.html` report with gzip and brotli size breakdowns.
- **Renderer**: The React 19 rendering engine responsible for component tree reconciliation, DOM updates, and concurrent features within the browser.
- **Asset_Pipeline**: The subsystem handling static assets (fonts, images, CSS) from source through optimization to production delivery.
- **Cache_Layer**: The combination of service worker, HTTP caching headers, and TanStack Query in-memory cache that control resource freshness and reuse.
- **Performance_Monitor**: The Web Vitals collection system (`webVitalsMonitor`, `webVitalsReporter`) that observes LCP, FID, CLS, FCP, and TTFB metrics and reports them to the backend.
- **Vendor_Chunk**: A named manual chunk in the Rollup configuration that groups related third-party dependencies (e.g., `vendor-react`, `vendor-charts`) for caching efficiency.
- **Lazy_Route**: A route-level React component loaded via `React.lazy()` and dynamic `import()` so its code is fetched only when the user navigates to that route.
- **Virtual_List**: A rendering technique that only mounts DOM nodes for visible rows in long lists or tables, reducing memory and paint cost.
- **App_Shell**: The minimal UI skeleton (sidebar navigation, top header, loading placeholder) rendered before any route module finishes loading.

## Requirements

### Requirement 1: Bundle Size Reduction

**User Story:** As a developer, I want the production JavaScript bundle to be smaller and more granularly split, so that users download less code on initial page load and subsequent navigations fetch only what is needed.

#### Acceptance Criteria

1. WHEN the Build_System produces a production build, THE Build_System SHALL generate a total initial JavaScript payload (sum of all chunks loaded before first meaningful paint on the `/dashboard` route) of no more than 250 KB gzip-compressed.
2. WHEN a Lazy_Route is not yet visited by the user, THE Build_System SHALL exclude that route's module code from the initial download.
3. WHEN the Build_System resolves imports from heavy libraries (Recharts, jsPDF, ExcelJS, CodeMirror, react-pdf), THE Build_System SHALL isolate each library into a separate Vendor_Chunk that loads only when a consuming route or component is activated.
4. WHEN the Build_System performs tree-shaking, THE Build_System SHALL eliminate unused exports from `lucide-react`, `date-fns`, `motion`, and `@radix-ui` so only referenced symbols appear in the output.
5. WHEN a developer runs `ANALYZE=true npm run build`, THE Bundle_Analyzer SHALL produce a visual report showing per-chunk gzip and brotli sizes.
6. IF a production build exceeds the 250 KB gzip initial-payload budget, THEN THE Build_System SHALL emit a warning to standard output indicating the overage amount.

### Requirement 2: Initial Load Time Optimization

**User Story:** As an auditor, I want the application to become interactive quickly after navigating to the URL, so that I can begin working without waiting for a full application download.

#### Acceptance Criteria

1. THE Build_System SHALL inline critical CSS required for the App_Shell (loading spinner, background color, layout frame) into the HTML document so that the shell renders without waiting for external stylesheet fetches.
2. WHEN the browser loads the application entry point, THE Asset_Pipeline SHALL preload the Tajawal font at weights 400, 700, and 800 using `<link rel="preload">` with `font-display: swap` to prevent layout shift from font loading.
3. WHEN the HTML document is served, THE Build_System SHALL emit `<link rel="modulepreload">` hints for the Critical_Path JavaScript chunks (vendor-react, vendor-ui, vendor-i18n, and the main app entry).
4. WHEN the user has not yet authenticated, THE Renderer SHALL render only the Login component and its direct dependencies without loading the full App_Shell or any Lazy_Route modules.
5. WHEN the i18n system initializes, THE Asset_Pipeline SHALL load only the active locale's translation file (Arabic or English) without fetching the unused locale.
6. THE Build_System SHALL configure the HTML entry point to include a `<meta>` viewport tag and minimal inline styles so that First Contentful Paint occurs within 1.5 seconds on a simulated 4G connection (RTT 150ms, 1.6 Mbps down).

### Requirement 3: Runtime and Navigation Performance

**User Story:** As an auditor navigating between modules, I want instant-feeling transitions and smooth interactions with data tables, so that the application never feels sluggish during a long working session.

#### Acceptance Criteria

1. WHEN the user navigates between Lazy_Route modules, THE Renderer SHALL display the target route content within 300 milliseconds of the navigation event (excluding network-dependent data fetching).
2. WHEN a data table renders more than 50 rows, THE Renderer SHALL use a Virtual_List technique to mount only visible rows plus a buffer of 10 rows above and below the viewport.
3. WHILE the user interacts with form inputs, dropdowns, or modals, THE Renderer SHALL maintain a frame budget of 16 milliseconds (60 fps) with no single scripting task exceeding 50 milliseconds on the main thread.
4. WHEN TanStack Query fetches data for a previously visited route, THE Cache_Layer SHALL serve stale cache data immediately and revalidate in the background (stale-while-revalidate pattern) so the UI renders without a loading spinner.
5. WHEN a context provider (AppContext, AuthContext, UserContext, PreferencesContext) updates its value, THE Renderer SHALL re-render only components that consume the specific changed value, not the entire provider subtree.
6. WHEN the user scrolls a large list or table, THE Renderer SHALL avoid synchronous re-layouts by deferring non-visible row measurement to idle callbacks or intersection observers.
7. IF a React component receives the same props and state between renders, THEN THE Renderer SHALL skip re-rendering that component using memoization (React.memo or useMemo).

### Requirement 4: Asset Optimization

**User Story:** As a user on a constrained network, I want fonts, images, and CSS to be delivered in the most efficient format, so that visual content appears quickly without excessive bandwidth usage.

#### Acceptance Criteria

1. THE Asset_Pipeline SHALL self-host the Tajawal and Inter font files (WOFF2 format) instead of loading them from Google Fonts CDN, eliminating the cross-origin connection setup cost.
2. WHEN the Asset_Pipeline processes font files, THE Asset_Pipeline SHALL subset Tajawal to include Arabic Unicode ranges (U+0600–U+06FF, U+FB50–U+FDFF, U+FE70–U+FEFF) and Latin (U+0000–U+007F) as separate font-face declarations with `unicode-range` descriptors so that only needed glyphs are downloaded.
3. WHEN the Asset_Pipeline encounters raster images (PNG, JPEG) during the build, THE Asset_Pipeline SHALL convert them to WebP format with a fallback `<picture>` source for browsers that lack WebP support.
4. THE Build_System SHALL configure CSS output to use a single combined CSS file with content-hash naming for long-term caching, eliminating render-blocking multiple stylesheet requests.
5. WHEN the Tailwind CSS compiler generates the production stylesheet, THE Build_System SHALL purge unused utility classes so the output CSS file does not exceed 50 KB gzip-compressed.
6. WHEN the Asset_Pipeline references SVG icons from `lucide-react`, THE Build_System SHALL inline only the referenced SVG paths rather than bundling the entire icon library sprite.

### Requirement 5: Caching Strategy

**User Story:** As a returning user, I want previously downloaded application assets to load from cache instantly, so that repeat visits and navigations within the same session are near-instantaneous.

#### Acceptance Criteria

1. THE Build_System SHALL append content-hash fingerprints to all emitted JavaScript, CSS, and font filenames so that HTTP `Cache-Control: max-age=31536000, immutable` headers can be applied by the hosting layer.
2. WHEN the application registers a service worker, THE Cache_Layer SHALL precache the App_Shell assets (HTML shell, Critical_Path JS chunks, primary CSS file, and Tajawal WOFF2 fonts) during the install phase.
3. WHEN the service worker intercepts a navigation request, THE Cache_Layer SHALL respond with the cached App_Shell HTML immediately, then fetch updated content in the background (app-shell caching pattern).
4. WHEN the service worker intercepts an API request to `/api/*`, THE Cache_Layer SHALL apply a network-first strategy with a 3-second timeout fallback to cache for GET requests.
5. WHEN a new service worker version activates, THE Cache_Layer SHALL purge stale caches from previous versions and notify the user that a new version is available without forcing a disruptive reload.
6. THE Cache_Layer SHALL configure TanStack Query `staleTime` per query type: 5 minutes for reference data (departments, job titles), 1 minute for volatile data (notifications, audit trail), and 30 minutes for rarely-changing data (system settings, user profile).

### Requirement 6: Performance Monitoring and Regression Prevention

**User Story:** As a development team, I want automated performance tracking and budget enforcement, so that regressions are caught before reaching production.

#### Acceptance Criteria

1. THE Performance_Monitor SHALL collect Largest Contentful Paint (LCP), First Input Delay (FID), Cumulative Layout Shift (CLS), First Contentful Paint (FCP), and Time to First Byte (TTFB) metrics for every page navigation.
2. WHEN the Performance_Monitor captures a metric that exceeds defined thresholds (LCP > 2.5s, FID > 100ms, CLS > 0.1), THE Performance_Monitor SHALL tag the metric report as "needs-improvement" or "poor" following Web Vitals classification.
3. WHEN a developer executes the build script, THE Build_System SHALL run a bundle-size budget check that fails the build if any single Vendor_Chunk exceeds 150 KB gzip or the total initial payload exceeds 250 KB gzip.
4. THE Build_System SHALL generate a `dist/bundle-stats.json` machine-readable manifest listing each chunk name, raw size, gzip size, and brotli size for CI comparison across commits.
5. WHEN the CI pipeline executes, THE Build_System SHALL compare the current build's total bundle size against the previous baseline and fail the pipeline if the total increases by more than 5 KB gzip without an explicit budget override.
6. THE Performance_Monitor SHALL expose a `/api/metrics/web-vitals` reporting endpoint integration that batches and sends collected metrics using `navigator.sendBeacon` to avoid blocking navigation or unload events.
7. WHEN a Lighthouse CI audit runs against the production build preview, THE Build_System SHALL enforce minimum scores of 90 for Performance, 90 for Accessibility, and 80 for Best Practices.
