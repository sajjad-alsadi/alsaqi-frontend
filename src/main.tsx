import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import api from './services/api';
import './index.css';
import './i18n'; // Import i18n
import { securityLogger } from './utils/SecurityLogger';
import { initNoiseFilter } from './utils/NoiseFilter';
import { SecurityProvider } from './utils/SecurityProvider';

// Initialize noise filter for dev environment noise
initNoiseFilter();

// Global Error Listener for Frontend
window.addEventListener('error', (event) => {
  const msg = (event.message || '').toLowerCase();
  const isAuthError = (event.error as any)?.response?.status === 401;
  const isViteNoise = (msg.includes('vite') || msg.includes('hmr')) && 
                     (msg.includes('websocket') || msg.includes('connection failed') || msg.includes('closed without opened'));

  if (
    isViteNoise ||
    isAuthError ||
    msg.includes('network error')
  ) return;

  api.post('/system-errors', {
    message: msg,
    stack: event.error?.stack || null,
    module: 'Frontend'
  }).catch(err => console.error('Failed to log frontend error:', err));
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = (event.reason?.message || String(event.reason) || '').toLowerCase();
  const isAuthError = event.reason?.response?.status === 401;
  const isViteNoise = (msg.includes('vite') || msg.includes('hmr')) && 
                     (msg.includes('websocket') || msg.includes('connection failed') || msg.includes('closed without opened'));

  if (
    isViteNoise ||
    isAuthError ||
    msg.includes('network error')
  ) return;

  api.post('/system-errors', {
    message: msg,
    stack: event.reason?.stack || null,
    module: 'Frontend (Promise)'
  }).catch(err => console.error('Failed to log frontend promise error:', err));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SecurityProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
          <App />
        </Suspense>
      </BrowserRouter>
    </SecurityProvider>
  </StrictMode>,
);
