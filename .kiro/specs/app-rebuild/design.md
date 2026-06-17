# Design Document: App Rebuild — Performance Optimization

## Overview

This design describes the architecture for a comprehensive performance optimization of the Al-Saqi audit management SPA. The objective is to reduce bundle size, accelerate initial load, improve runtime performance, optimize the asset pipeline, strengthen caching via a service worker, and establish performance monitoring with CI budget gates.

**Technical Stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS v4, TanStack Query 5  
**Constraints:** `packages/shared` is frozen (read-only), RTL/Arabic support preserved, DESIGN.md design system unchanged, existing Terser + manual chunks + source map deletion + proxy config retained.

---

## Architecture

### 1. Bundle Optimization Architecture

### 1.1 Chunk Splitting Strategy

The existing `manualChunks` in `vite.config.ts` already splits vendor code into named chunks. The rebuild refines this into a tiered model:

**Tier 1 — Critical Path (eagerly loaded):**
- `vendor-react`: react, react-dom, react-router-dom, scheduler
- `vendor-ui`: lucide-react, clsx, tailwind-merge, class-variance-authority, @radix-ui
- `vendor-i18n`: i18next, react-i18next (runtime only — translations loaded async)
- `app-entry`: main.tsx, App.tsx, Layout, Login, context providers

**Tier 2 — Deferred (loaded on first authenticated route):**
- `vendor-query`: @tanstack/react-query
- `vendor-forms`: react-hook-form, @hookform/resolvers, zod
- `vendor-motion`: motion (formerly framer-motion)
- `vendor-toast`: react-hot-toast, goober

**Tier 3 — On-Demand (loaded only when consuming route activates):**
- `vendor-charts`: recharts, d3-* (Dashboard only)
- `vendor-pdf`: jspdf, jspdf-autotable, react-pdf (Reports only)
- `vendor-excel`: exceljs (Reports only)
- `vendor-editor`: codemirror, @codemirror/* (specific modules only)

```typescript
// vite.config.ts — refined manualChunks
manualChunks(id) {
  if (!id.includes('node_modules')) return;

  // Tier 1: Critical path
  if (/\/(react-dom|react-router-dom|\/react\/|\/scheduler\/)/.test(id))
    return 'vendor-react';
  if (/(lucide-react|class-variance-authority|\/clsx\/|tailwind-merge|@radix-ui)/.test(id))
    return 'vendor-ui';
  if (/(i18next|react-i18next)/.test(id))
    return 'vendor-i18n';

  // Tier 2: Deferred (loaded after auth)
  if (id.includes('@tanstack/react-query')) return 'vendor-query';
  if (/(react-hook-form|@hookform\/resolvers|\/zod\/)/.test(id)) return 'vendor-forms';
  if (/\/(motion|framer-motion)\//.test(id)) return 'vendor-motion';
  if (/(react-hot-toast|\/goober\/)/.test(id)) return 'vendor-toast';

  // Tier 3: On-demand (lazy-loaded with consuming route)
  if (/(recharts|\/d3-)/.test(id)) return 'vendor-charts';
  if (/(jspdf|react-pdf)/.test(id)) return 'vendor-pdf';
  if (id.includes('exceljs')) return 'vendor-excel';
  if (/(codemirror|@codemirror)/.test(id)) return 'vendor-editor';

  // Remaining: let Rollup co-locate with importing chunk
}
```

### 1.2 Tree-Shaking Configuration

Vite 7 with Rollup already performs tree-shaking, but effectiveness requires:

1. **Named imports only** for `lucide-react` (`import { FileText } from 'lucide-react'` — never `import * as Icons`).
2. **`date-fns`** — already tree-shakeable via ESM exports. Verify no barrel re-exports that defeat it.
3. **`motion`** — import only used components (`import { motion, AnimatePresence } from 'motion/react'`).
4. **`@radix-ui`** — each primitive is a separate package, naturally tree-shaken.

Terser `compress.passes: 2` improves dead-code removal after Rollup's initial pass.

### 1.3 Dynamic Import Boundaries

Every route in `App.tsx` already uses `React.lazy()`. The rebuild adds:

- **Component-level splitting** for heavy sub-features: PDF viewer in Reports, chart panels in Dashboard, CodeMirror in Correspondence templates.
- **Deferred provider loading**: `vendor-query` and `vendor-forms` load only after authentication is confirmed (the `AppContent` component triggers these imports).

```typescript
// Example: deferred chart import within Dashboard
const ChartPanel = lazy(() => import('./components/ChartPanel'));
// ChartPanel internally imports from recharts — pulling vendor-charts on demand
```

### 1.4 Bundle Budget Enforcement

A Vite plugin (`budgetPlugin`) runs post-build and:
1. Reads each chunk's gzip size from Rollup output.
2. Compares against thresholds: individual chunk ≤ 150 KB, initial payload ≤ 250 KB.
3. Emits warnings (dev) or errors (CI) when budgets are exceeded.
4. Writes `dist/bundle-stats.json` for CI delta comparison.

```typescript
// src/plugins/bundleBudget.ts
import { Plugin } from 'vite';
import { gzipSync } from 'zlib';
import { writeFileSync } from 'fs';
import path from 'path';

interface BudgetConfig {
  maxChunkGzip: number;      // bytes — default 153600 (150 KB)
  maxInitialGzip: number;    // bytes — default 256000 (250 KB)
  initialChunks: string[];   // chunk names that compose initial payload
  failOnOverage: boolean;    // true in CI, false locally
}

export function bundleBudgetPlugin(config: BudgetConfig): Plugin {
  return {
    name: 'bundle-budget',
    apply: 'build',
    closeBundle() {
      // Implementation: iterate output chunks, compute gzip sizes,
      // compare against budgets, write bundle-stats.json, emit warnings/errors
    },
  };
}
```

---

## 2. Initial Load Optimization

### 2.1 Critical CSS Extraction

An inline `<style>` block in `index.html` contains the minimal CSS needed to paint the App Shell before any external stylesheet loads:

- Background color (`--color-bg-main`)
- Loading spinner animation
- Layout frame (sidebar width placeholder, header height)
- Font-face declarations for Tajawal (referenced by preload)

This is achieved via a Vite `transformIndexHtml` plugin that injects the critical CSS at build time.

```typescript
// src/plugins/criticalCss.ts
import { Plugin } from 'vite';

const CRITICAL_CSS = `
  :root { --color-bg-main: #f4f7f9; --color-primary: #0a7d85; }
  .dark { --color-bg-main: #0c1220; }
  body { margin: 0; background: var(--color-bg-main); font-family: Tajawal, Inter, system-ui, sans-serif; }
  .app-shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
  .app-shell-spinner { display: flex; align-items: center; justify-content: center; height: 100vh; }
  .app-shell-spinner::after {
    content: ''; width: 48px; height: 48px; border-radius: 50%;
    border: 3px solid transparent; border-top-color: var(--color-primary);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 768px) { .app-shell { grid-template-columns: 1fr; } }
`;

export function criticalCssPlugin(): Plugin {
  return {
    name: 'critical-css',
    transformIndexHtml(html) {
      return html.replace('</head>', `<style>${CRITICAL_CSS}</style>\n</head>`);
    },
  };
}
```

### 2.2 Font Loading Strategy

**Current state:** Fonts loaded from Google Fonts CDN via `@import url(...)` in `index.css` — this creates a render-blocking cross-origin request chain.

**Target state:**
1. Self-host WOFF2 font files in `public/fonts/`.
2. Subset Tajawal into Arabic-range and Latin-range font files.
3. Add `<link rel="preload">` in `index.html` for critical weights (400, 700, 800).
4. Use `font-display: swap` to prevent FOIT.
5. Remove the Google Fonts `@import` from `index.css`.

```html
<!-- index.html — font preloads -->
<link rel="preload" href="/fonts/tajawal-arabic-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/tajawal-arabic-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/tajawal-arabic-800.woff2" as="font" type="font/woff2" crossorigin>
```

```css
/* fonts.css — subset @font-face declarations */
@font-face {
  font-family: 'Tajawal';
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/tajawal-arabic-400.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+FB50-FDFF, U+FE70-FEFF;
}
@font-face {
  font-family: 'Tajawal';
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/tajawal-latin-400.woff2') format('woff2');
  unicode-range: U+0000-007F, U+0080-00FF, U+0100-024F;
}
/* Repeat for weights 500, 700, 800 */
```

### 2.3 Preload Hints

A `transformIndexHtml` hook emits `<link rel="modulepreload">` for the critical-path chunks identified at build time:

```typescript
// Injected into <head> at build time
<link rel="modulepreload" href="/assets/vendor-react.[hash].js">
<link rel="modulepreload" href="/assets/vendor-ui.[hash].js">
<link rel="modulepreload" href="/assets/vendor-i18n.[hash].js">
<link rel="modulepreload" href="/assets/app-entry.[hash].js">
```

### 2.4 App Shell Approach

The application entry renders in two phases:

1. **Phase 1 (unauthenticated):** Only the Login component and its direct dependencies load. No Layout, no lazy routes, no sidebar. The session-check response determines whether to proceed.
2. **Phase 2 (authenticated):** The App Shell (Layout with sidebar + header + Suspense boundary) renders. Lazy routes load on navigation.

```typescript
// Simplified AppContent rendering logic
if (isCheckingSession) return <AppShellSkeleton />;  // CSS-only skeleton
if (!user) return <Login />;                          // No Layout, no lazy routes
return <Layout><Suspense fallback={<RouteSkeleton />}><Routes>...</Routes></Suspense></Layout>;
```

### 2.5 Locale Loading — Dynamic Import

**Current state:** Both `ar.json` and `en.json` are statically imported in `i18n.ts`, bundled into the main chunk regardless of active locale.

**Target state:** Locales loaded via `i18next-http-backend` with dynamic fetch:

```typescript
// i18n.ts — async locale loading
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'ar',
    supportedLngs: ['ar', 'en'],
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    // Only the detected/stored language is fetched
  });
```

Translation JSON files move to `public/locales/ar.json` and `public/locales/en.json`, served as static assets (cached by the service worker).

---

## 3. Runtime Performance Patterns

### 3.1 Table Virtualization

Tables with more than 50 rows use a virtualized renderer. The component:

1. Measures the container viewport height and row height.
2. Computes visible range: `startIndex = Math.floor(scrollTop / rowHeight)`.
3. Renders only `visibleCount + overscan` rows (overscan = 10 above + 10 below).
4. Uses absolute positioning with `transform: translateY()` for each row to avoid layout thrashing.
5. Defers off-screen row measurement to `requestIdleCallback`.

```typescript
// components/VirtualTable.tsx
interface VirtualTableProps<T> {
  data: T[];
  rowHeight: number;
  overscan?: number;       // default 10
  columns: ColumnDef<T>[];
  renderRow: (item: T, index: number) => React.ReactNode;
}

function VirtualTable<T>({ data, rowHeight, overscan = 10, columns, renderRow }: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const totalHeight = data.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(data.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan);
  const visibleItems = data.slice(startIndex, endIndex);

  return (
    <div ref={containerRef} className="table-container overflow-y-auto" style={{ height: '100%' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => (
          <div key={startIndex + i}
            style={{ position: 'absolute', top: (startIndex + i) * rowHeight, height: rowHeight, width: '100%' }}>
            {renderRow(item, startIndex + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 3.2 Memoization Strategy

React 19 includes the React Compiler (formerly React Forget) which auto-memoizes components. The strategy is:

1. **Enable React Compiler** via `@vitejs/plugin-react` Babel configuration. The compiler automatically inserts memoization for components whose props haven't changed.
2. **Manual `React.memo`** retained for components that the compiler cannot optimize (components with non-serializable closures, third-party HOCs).
3. **`useMemo` / `useCallback`** used only for expensive computations (sorting/filtering large datasets) and callback identity stability for child components.

```typescript
// vite.config.ts — React Compiler activation
react({
  babel: {
    plugins: [['babel-plugin-react-compiler', {}]],
  },
})
```

**Fallback (if React Compiler is not yet stable for this codebase):** Wrap all data-table row components, sidebar items, and form field components in `React.memo`. Use `useMemo` for derived state (filtered/sorted lists) and `useCallback` for event handlers passed to memoized children.

### 3.3 Context Splitting

**Current state:** A single `AppContext` contains multiple unrelated values. Any update triggers re-renders across all consumers.

**Target state:** Split into focused, minimal providers:

| Provider | Values | Update Frequency |
|----------|--------|-----------------|
| `AuthContext` | token, session state | Rare (login/logout) |
| `UserContext` | user profile, role | Rare (profile update) |
| `PreferencesContext` | language, theme, direction | Rare (settings change) |
| `PermissionsContext` | permission map | Rare (role change) |
| `NotificationContext` | unread count, toast queue | Frequent |

Each provider exposes a separate `useXValue()` and `useXActions()` hook pair so value reads and dispatch functions don't co-trigger.

```typescript
// context/NotificationContext.tsx — split value from dispatch
const NotificationValueContext = createContext<NotificationState>(defaultState);
const NotificationDispatchContext = createContext<NotificationDispatch>(noopDispatch);

export function useNotificationValue() {
  return useContext(NotificationValueContext);
}

export function useNotificationDispatch() {
  return useContext(NotificationDispatchContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(notificationReducer, defaultState);
  return (
    <NotificationDispatchContext.Provider value={dispatch}>
      <NotificationValueContext.Provider value={state}>
        {children}
      </NotificationValueContext.Provider>
    </NotificationDispatchContext.Provider>
  );
}
```

### 3.4 Stale-While-Revalidate with TanStack Query

```typescript
// lib/queryDefaults.ts
export const QUERY_STALE_TIMES = {
  referenceData: 5 * 60 * 1000,     // 5 min — departments, job titles, org structure
  volatileData: 1 * 60 * 1000,      // 1 min — notifications, audit trail
  rarelyChanging: 30 * 60 * 1000,   // 30 min — system settings, user profile
} as const;

// Applied per query:
useQuery({
  queryKey: ['departments'],
  queryFn: fetchDepartments,
  staleTime: QUERY_STALE_TIMES.referenceData,
});
```

The global `QueryClient` keeps `staleTime: 5 * 60 * 1000` as default (reference-data tier). Volatile queries override to 1 minute. This ensures previously visited routes render cached data instantly while background revalidation runs.

---

## 4. Asset Pipeline Design

### 4.1 Font Subsetting

A build-time script (using `pyftsubset` or `glyphhanger`) produces subset WOFF2 files:

| File | Subset | Unicode Range |
|------|--------|--------------|
| `tajawal-arabic-{weight}.woff2` | Arabic + Arabic Presentation Forms | U+0600-06FF, U+FB50-FDFF, U+FE70-FEFF |
| `tajawal-latin-{weight}.woff2` | Basic Latin + Latin Extended | U+0000-007F, U+0080-00FF, U+0100-024F |
| `inter-latin-{weight}.woff2` | Latin (fallback) | U+0000-007F, U+0080-00FF |

Each `@font-face` declaration specifies `unicode-range` so the browser downloads only the character set needed for the current content. Arabic users (primary) download Arabic glyphs; Latin-only content uses the smaller Latin subset.

### 4.2 Image Optimization

A Vite plugin (`vite-plugin-image-optimizer` or custom) processes images at build time:

1. **PNG/JPEG → WebP** conversion with quality 80.
2. **SVG** — passed through SVGO for minification.
3. **`<picture>` wrapper** generated by a custom component:

```typescript
// components/OptimizedImage.tsx
interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function OptimizedImage({ src, alt, width, height, className, loading = 'lazy' }: OptimizedImageProps) {
  const webpSrc = src.replace(/\.(png|jpe?g)$/i, '.webp');
  return (
    <picture>
      <source srcSet={webpSrc} type="image/webp" />
      <img src={src} alt={alt} width={width} height={height}
           className={className} loading={loading} decoding="async" />
    </picture>
  );
}
```

### 4.3 CSS Output Strategy

Tailwind CSS v4 with `@tailwindcss/vite` produces a single CSS file. The build:

1. **Purges unused utilities** — Tailwind v4 content detection scans all `.tsx`, `.ts`, `.html` files.
2. **Outputs a single CSS file** with content-hash (`assets/styles.[hash].css`).
3. **Critical CSS inlined** separately (see §2.1) — the external CSS file is non-blocking (`media="print" onload="this.media='all'"` pattern or `<link rel="preload" as="style">`).
4. **Target: ≤ 50 KB gzip** for the complete CSS output.

---

## 5. Service Worker Architecture

### 5.1 Registration and Lifecycle

```typescript
// src/sw-register.ts
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  
  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    newWorker?.addEventListener('statechange', () => {
      if (newWorker.state === 'activated') {
        // Dispatch custom event for UI notification
        window.dispatchEvent(new CustomEvent('sw:updated'));
      }
    });
  });
}
```

### 5.2 Precaching Manifest

During the build, a Vite plugin generates the precache manifest listing App Shell assets:

```typescript
// Precache manifest (generated at build time)
const PRECACHE_MANIFEST = [
  { url: '/index.html', revision: BUILD_HASH },
  { url: '/assets/vendor-react.[hash].js', revision: null },  // hash in filename
  { url: '/assets/vendor-ui.[hash].js', revision: null },
  { url: '/assets/vendor-i18n.[hash].js', revision: null },
  { url: '/assets/app-entry.[hash].js', revision: null },
  { url: '/assets/styles.[hash].css', revision: null },
  { url: '/fonts/tajawal-arabic-400.woff2', revision: FONT_HASH },
  { url: '/fonts/tajawal-arabic-700.woff2', revision: FONT_HASH },
  { url: '/fonts/tajawal-arabic-800.woff2', revision: FONT_HASH },
];
```

### 5.3 Runtime Caching Strategies

```typescript
// sw.js — fetch event handler
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Strategy 1: App Shell (navigation requests)
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('/index.html').then(
      cached => cached || fetch(request)
    ));
    return;
  }

  // Strategy 2: API requests — network-first with 3s timeout
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(networkFirstWithTimeout(request, 3000));
    return;
  }

  // Strategy 3: Static assets (JS, CSS, fonts) — cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(caches.match(request).then(
      cached => cached || fetch(request).then(response => {
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, response.clone());
        return response;
      })
    ));
    return;
  }

  // Strategy 4: Locale files — stale-while-revalidate
  if (url.pathname.startsWith('/locales/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

async function networkFirstWithTimeout(request: Request, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    // Cache successful GET responses
    const cache = await caches.open(API_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    clearTimeout(timeoutId);
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

### 5.4 Cache Versioning and Cleanup

```typescript
// sw.js — activate event
const CACHE_VERSION = 'v2';
const EXPECTED_CACHES = [`static-${CACHE_VERSION}`, `api-${CACHE_VERSION}`, `locale-${CACHE_VERSION}`];

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => !EXPECTED_CACHES.includes(key)).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});
```

### 5.5 Update Notification Flow

When a new service worker activates:
1. The SW posts a message to all clients: `{ type: 'SW_UPDATED' }`.
2. The app listens via `navigator.serviceWorker.addEventListener('message', ...)`.
3. A non-intrusive toast notification appears: "A new version is available. Refresh to update."
4. The user clicks to reload — no forced interruption.

---

## 6. Performance Monitoring Integration

### 6.1 Web Vitals Collection

The existing `webVitalsMonitor` is retained and enhanced:

```typescript
// utils/webVitalsMonitor.ts
import { onLCP, onFID, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals';

type Rating = 'good' | 'needs-improvement' | 'poor';

interface MetricReport {
  name: string;
  value: number;
  rating: Rating;
  delta: number;
  id: string;
  navigationType: string;
}

const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  FID: [100, 300],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

function classifyMetric(name: string, value: number): Rating {
  const [good, poor] = THRESHOLDS[name] ?? [Infinity, Infinity];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

class WebVitalsMonitor {
  private buffer: MetricReport[] = [];

  init() {
    const handler = (metric: Metric) => {
      this.buffer.push({
        name: metric.name,
        value: metric.value,
        rating: classifyMetric(metric.name, metric.value),
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
      });
    };
    onLCP(handler);
    onFID(handler);
    onCLS(handler);
    onFCP(handler);
    onTTFB(handler);
  }

  flush(): MetricReport[] {
    const reports = [...this.buffer];
    this.buffer = [];
    return reports;
  }
}

export const webVitalsMonitor = new WebVitalsMonitor();
```

### 6.2 Beacon-Based Reporting

```typescript
// utils/webVitalsReporter.ts
const REPORT_ENDPOINT = '/api/metrics/web-vitals';
const BATCH_INTERVAL = 10_000; // 10 seconds

export function initWebVitalsReporter() {
  // Periodic flush
  setInterval(() => {
    const metrics = webVitalsMonitor.flush();
    if (metrics.length === 0) return;
    sendMetrics(metrics);
  }, BATCH_INTERVAL);

  // Flush on page hide (before unload)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const metrics = webVitalsMonitor.flush();
      if (metrics.length > 0) sendMetrics(metrics);
    }
  });
}

function sendMetrics(metrics: MetricReport[]) {
  const payload = JSON.stringify({ metrics, timestamp: Date.now() });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(REPORT_ENDPOINT, payload);
  } else {
    // Fallback: fire-and-forget fetch
    fetch(REPORT_ENDPOINT, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    });
  }
}
```

### 6.3 CI Budget Gates

The CI pipeline integrates three checks:

1. **Bundle budget** (`bundleBudgetPlugin`): Fails build if any chunk > 150 KB gzip or initial payload > 250 KB gzip.
2. **Delta comparison**: A script compares `dist/bundle-stats.json` against the stored baseline. Fails if total grows > 5 KB gzip without `BUDGET_OVERRIDE=true`.
3. **Lighthouse CI**: Runs against preview build with assertions: Performance ≥ 90, Accessibility ≥ 90, Best Practices ≥ 80.

```typescript
// scripts/check-bundle-delta.mjs
import { readFileSync } from 'fs';

const current = JSON.parse(readFileSync('dist/bundle-stats.json', 'utf-8'));
const baseline = JSON.parse(readFileSync('.bundle-baseline.json', 'utf-8'));

const currentTotal = current.chunks.reduce((sum, c) => sum + c.gzipSize, 0);
const baselineTotal = baseline.chunks.reduce((sum, c) => sum + c.gzipSize, 0);
const delta = currentTotal - baselineTotal;

if (delta > 5120 && !process.env.BUDGET_OVERRIDE) {
  console.error(`Bundle size increased by ${(delta / 1024).toFixed(1)} KB gzip (limit: 5 KB).`);
  console.error('Set BUDGET_OVERRIDE=true to bypass this check.');
  process.exit(1);
}

console.log(`Bundle delta: ${delta >= 0 ? '+' : ''}${(delta / 1024).toFixed(1)} KB gzip — within budget.`);
```

---

## Components and Interfaces

All Vite plugins, the service worker, and the performance monitor are standalone modules with well-defined interfaces described throughout the Architecture section above. Key plugin interfaces:

- `bundleBudgetPlugin(config: BudgetConfig): Plugin` — post-build budget enforcement
- `criticalCssPlugin(): Plugin` — HTML transform for inline critical CSS
- `registerServiceWorker(): Promise<void>` — SW registration with update detection
- `WebVitalsMonitor.init() / flush(): MetricReport[]` — metric collection
- `initWebVitalsReporter(): void` — beacon-based metric dispatch
- `VirtualTable<T>(props: VirtualTableProps<T>): JSX.Element` — generic virtualized table

## Data Models

### 7.1 Bundle Stats Schema

```typescript
interface BundleStats {
  buildTime: string;         // ISO 8601
  commitHash: string;
  chunks: ChunkInfo[];
  totals: {
    rawSize: number;
    gzipSize: number;
    brotliSize: number;
  };
}

interface ChunkInfo {
  name: string;              // e.g., 'vendor-react'
  fileName: string;          // e.g., 'vendor-react.a1b2c3d4.js'
  rawSize: number;           // bytes
  gzipSize: number;          // bytes
  brotliSize: number;        // bytes
  isInitial: boolean;        // part of critical path?
  modules: string[];         // top-level packages in this chunk
}
```

### 7.2 Service Worker Cache Manifest

```typescript
interface PrecacheEntry {
  url: string;
  revision: string | null;   // null when URL contains content hash
}

interface CacheStrategy {
  pattern: RegExp | string;
  strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  timeout?: number;          // ms, for network-first
  cacheName: string;
}
```

### 7.3 Web Vitals Report Schema

```typescript
interface MetricReport {
  name: 'LCP' | 'FID' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'prerender';
}

interface MetricsBatch {
  metrics: MetricReport[];
  timestamp: number;
  sessionId: string;
  route: string;
  userAgent: string;
}
```

### 7.4 Query Freshness Configuration

```typescript
interface QueryFreshnessConfig {
  category: 'referenceData' | 'volatileData' | 'rarelyChanging';
  staleTime: number;         // ms
  gcTime: number;            // ms (garbage collection / cache eviction)
  queryKeyPrefixes: string[];
}

const FRESHNESS_TIERS: QueryFreshnessConfig[] = [
  {
    category: 'referenceData',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryKeyPrefixes: ['departments', 'job-titles', 'org-structure', 'compliance-matrix'],
  },
  {
    category: 'volatileData',
    staleTime: 1 * 60_000,
    gcTime: 5 * 60_000,
    queryKeyPrefixes: ['notifications', 'audit-trail', 'unread-count'],
  },
  {
    category: 'rarelyChanging',
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    queryKeyPrefixes: ['settings', 'user-profile', 'feature-flags'],
  },
];
```

---

## Error Handling

### 8.1 Service Worker Failures

- **Registration failure:** Silently degraded — app works without caching. Logged to Sentry.
- **Cache storage full:** Evict oldest API cache entries (LRU). Static asset cache is never evicted (content-hashed, small).
- **Fetch timeout in network-first:** Falls back to cached response or returns a structured 503 JSON error.

### 8.2 Lazy Load Failures

- **Chunk load error** (network issue, deploy mismatch): `ModuleErrorBoundary` catches, shows retry button. On retry, forces reload to get fresh `index.html` with updated chunk references.
- **Import() rejection:** Logged to Sentry with chunk name and route context.

### 8.3 Web Vitals Reporting Failures

- **sendBeacon failure:** Non-critical. Metrics are lost for that session but no user impact.
- **Endpoint unavailable:** Reporter uses fire-and-forget pattern — no retries, no user-facing errors.

### 8.4 Font Loading Failures

- `font-display: swap` ensures text remains visible with fallback system font.
- If WOFF2 preload fails, CSS `@font-face` still attempts normal fetch.
- Worst case: system font renders — legibility preserved.

---

## 9. RTL/Bidirectional Considerations

All optimizations preserve existing RTL support:

1. **CSS direction-aware properties:** `inset-inline-start/end`, `margin-inline-start`, `padding-inline-start` used throughout. Tailwind v4 logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`) preferred over `ml-*`/`mr-*`.
2. **Animation direction:** Slide-in keyframes have `[dir="rtl"]` variants (already defined in `index.css`).
3. **Table scroll indicator:** Uses CSS custom property `--scroll-dir` to orient the fade gradient correctly in RTL.
4. **Virtual table:** Row positioning uses `inset-inline-start: 0` instead of `left: 0`.
5. **Service worker:** Direction-agnostic — caching strategies don't depend on layout direction.
6. **Font subsetting:** Arabic range is the primary/larger subset, preloaded first.

---

## Testing Strategy

**Unit Tests (vitest):**
- Budget check function with various chunk size inputs
- Web Vitals `classifyMetric` function with boundary values
- Service worker fetch handler logic (mocked caches API)
- Query freshness tier resolution from query key prefixes

**Property-Based Tests (fast-check + vitest):**
- Correctness properties 14–16 (pure functions with varied numeric inputs)
- Property 4 (virtual table row bounds across random N > 50)
- Property 7 (cache tier assignment for arbitrary query key prefixes)

**Integration Tests:**
- Build output verification (chunk names, sizes, content-hash patterns)
- Service worker lifecycle (install → precache, activate → purge old caches)
- Lighthouse CI performance assertions

**E2E Tests (Playwright):**
- Route navigation timing (< 300ms)
- Lazy chunk loading on first route visit
- Offline fallback via service worker

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Lazy-loaded chunks excluded from initial payload

*For any* route module registered with `React.lazy()` and any heavy library in the on-demand tier (Recharts, jsPDF, ExcelJS, CodeMirror, react-pdf), the chunk containing that module/library SHALL NOT appear in the set of chunks loaded during initial page render on the `/dashboard` route.

**Validates: Requirements 1.2, 1.3**

### Property 2: Unauthenticated state loads only Login dependencies

*For any* application state where the user is not authenticated (user === null), the module graph loaded by the browser SHALL contain only the Login component and its direct dependencies — no Layout, no sidebar, no lazy route modules.

**Validates: Requirements 2.4**

### Property 3: Single active locale loaded

*For any* locale selection from the supported set {ar, en}, the i18n system SHALL fetch exactly one translation file (the active locale) and SHALL NOT fetch the other locale's translation file during initialization.

**Validates: Requirements 2.5**

### Property 4: Virtual table row count bounded by viewport

*For any* dataset with N rows where N > 50, the virtualized table component SHALL mount at most `visibleRows + 2 * overscan` DOM row elements (where overscan = 10), never the full N rows.

**Validates: Requirements 3.2**

### Property 5: Context update isolation

*For any* context provider with split value/dispatch architecture, updating one context value SHALL trigger re-renders only in components that consume that specific value — components consuming other contexts or the dispatch-only hook SHALL NOT re-render.

**Validates: Requirements 3.5**

### Property 6: Memoized component skip on identical props

*For any* component wrapped in `React.memo` (or optimized by React Compiler), receiving props and state identical to the previous render SHALL result in the component body not re-executing.

**Validates: Requirements 3.7**

### Property 7: Cache freshness tiers applied correctly

*For any* TanStack Query with a key prefix in the reference-data category, its effective staleTime SHALL be 5 minutes; for volatile-data prefixes, 1 minute; for rarely-changing prefixes, 30 minutes. Furthermore, *for any* previously-fetched query that is re-mounted while within its staleTime, the cached data SHALL be returned synchronously without a loading state.

**Validates: Requirements 3.4, 5.6**

### Property 8: Font-face declarations include unicode-range

*For any* `@font-face` rule for the Tajawal font family in the production CSS output, the rule SHALL include a `unicode-range` descriptor covering either the Arabic ranges (U+0600–U+06FF, U+FB50–FDFF, U+FE70–FEFF) or the Latin ranges (U+0000–U+007F, U+0080–00FF).

**Validates: Requirements 4.2**

### Property 9: Raster images produce WebP with fallback

*For any* raster image (PNG, JPEG) referenced in the source code, the build output SHALL include a corresponding WebP variant, and the rendering component SHALL use a `<picture>` element providing both the WebP source and the original format as fallback.

**Validates: Requirements 4.3**

### Property 10: Content-hash fingerprints on all emitted assets

*For any* JavaScript, CSS, or WOFF2 file emitted to the `dist/assets/` directory, the filename SHALL contain a content-based hash segment (matching pattern `[name].[hash].[ext]`), enabling immutable cache headers.

**Validates: Requirements 5.1**

### Property 11: Precache manifest covers App Shell assets

*For any* asset in the defined App Shell set (index.html, critical-path JS chunks, primary CSS file, Tajawal WOFF2 fonts), that asset SHALL appear in the service worker precache manifest.

**Validates: Requirements 5.2**

### Property 12: Navigation requests served from App Shell cache

*For any* fetch event with `request.mode === 'navigate'` intercepted by the service worker, the response SHALL be the cached `/index.html` (App Shell pattern), falling back to network only if no cache entry exists.

**Validates: Requirements 5.3**

### Property 13: API GET requests use network-first with timeout fallback

*For any* GET request matching the `/api/*` pattern intercepted by the service worker, the handler SHALL attempt a network fetch with a 3-second timeout; if the network request fails or exceeds the timeout, the handler SHALL respond with a cached response if available.

**Validates: Requirements 5.4**

### Property 14: Web Vitals classification correctness

*For any* metric value and metric name in {LCP, FID, CLS, FCP, TTFB}, the `classifyMetric` function SHALL return 'good' when the value is at or below the good threshold, 'needs-improvement' when between good and poor thresholds, and 'poor' when above the poor threshold — matching the Web Vitals specification thresholds exactly.

**Validates: Requirements 6.1, 6.2**

### Property 15: Bundle budget check rejects overage

*For any* set of chunk size measurements where the maximum individual chunk gzip size exceeds 150 KB or the sum of initial-payload chunk gzip sizes exceeds 250 KB, the budget check function SHALL return a failure result indicating the specific overage.

**Validates: Requirements 6.3**

### Property 16: CI delta comparison rejects excessive growth

*For any* pair of (current total gzip size, baseline total gzip size) where `current - baseline > 5120 bytes` and no budget override flag is set, the delta comparison SHALL fail the pipeline with an error message indicating the overage amount.

**Validates: Requirements 6.5**
