import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n'; // Import i18n
import { initNoiseFilter } from './utils/NoiseFilter';
import { SecurityProvider } from './utils/SecurityProvider';
import { registerGlobalErrorHandlers } from './utils/globalErrorHandlers';
import { initSentry } from './utils/sentry';
import { webVitalsMonitor } from './utils/webVitalsMonitor';
import { initWebVitalsReporter } from './utils/webVitalsReporter';
import { registerServiceWorker } from './sw-register';

// Initialize noise filter for dev environment noise
initNoiseFilter();

// Register global error handlers (window.onerror + unhandledrejection)
registerGlobalErrorHandlers();

// Initialize Sentry AFTER the global handlers so Sentry chains (and preserves)
// the existing errorReporter window.onerror handler instead of overwriting it.
// Production + DSN gated and guarded so a missing DSN never breaks startup.
initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SecurityProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-soft)]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
          <App />
        </Suspense>
      </BrowserRouter>
    </SecurityProvider>
  </StrictMode>,
);

// Register service worker after initial render (non-blocking).
// This precaches App Shell assets and enables offline-first caching strategies.
// Registration is deferred post-render so it doesn't block the critical path.
registerServiceWorker();

// Initialize Web Vitals monitoring (non-blocking, runs after initial render)
// The monitor observes performance entries (LCP, FID, CLS, FCP, TTFB) and the
// reporter batches and sends metrics to /api/metrics/web-vitals via sendBeacon
// so reporting never blocks FCP or the main thread.
webVitalsMonitor.init();
initWebVitalsReporter();
