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

// Initialize noise filter for dev environment noise
initNoiseFilter();

// Register global error handlers (window.onerror + unhandledrejection)
registerGlobalErrorHandlers();

// Initialize Sentry AFTER the global handlers so Sentry chains (and preserves)
// the existing errorReporter window.onerror handler instead of overwriting it.
// Production + DSN gated and guarded so a missing DSN never breaks startup.
initSentry();

// Activate Web Vitals collection and reporting. The monitor observes
// performance entries (LCP, FID, CLS, FCP, TTFB) and the reporter POSTs
// captured metrics to /api/metrics/web-vitals using a non-blocking,
// buffered retry pipeline so reporting never impacts the main thread.
webVitalsMonitor.init();
initWebVitalsReporter();

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
