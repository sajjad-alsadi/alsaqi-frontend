import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n'; // Import i18n
import { initNoiseFilter } from './utils/NoiseFilter';
import { SecurityProvider } from './utils/SecurityProvider';
import { registerGlobalErrorHandlers } from './utils/globalErrorHandlers';

// Initialize noise filter for dev environment noise
initNoiseFilter();

// Register global error handlers (window.onerror + unhandledrejection)
registerGlobalErrorHandlers();

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
