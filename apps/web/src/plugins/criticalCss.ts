import type { Plugin } from 'vite';

/**
 * Critical CSS inlined into the HTML document before any external stylesheet loads.
 * Paints the App Shell (loading spinner, background, grid layout frame) immediately,
 * preventing a flash of unstyled content during JS/CSS bundle download.
 *
 * Includes:
 * - CSS custom properties for background and primary color (light + dark mode)
 * - Body reset with font stack (Tajawal first for Arabic-first app)
 * - App shell grid layout (sidebar 260px + main area)
 * - Loading spinner animation
 * - RTL-aware overrides (app is Arabic-first, dir="rtl" by default)
 * - Responsive collapse for mobile (<768px)
 *
 * @see Requirements 2.1 (inline critical CSS for App Shell)
 * @see Requirements 2.6 (FCP within 1.5s on simulated 4G)
 */
const CRITICAL_CSS = `
:root {
  --color-bg-main: #f4f7f9;
  --color-primary: #0a7d85;
}
.dark {
  --color-bg-main: #0c1220;
}
body {
  margin: 0;
  background: var(--color-bg-main);
  font-family: Tajawal, Inter, system-ui, sans-serif;
}
.app-shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}
[dir="rtl"] .app-shell {
  direction: rtl;
}
.app-shell-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}
.app-shell-spinner::after {
  content: '';
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@media (max-width: 768px) {
  .app-shell {
    grid-template-columns: 1fr;
  }
}
`;

/**
 * Vite plugin that inlines critical CSS into the HTML document at build time.
 * Uses the `transformIndexHtml` hook to inject a `<style>` block before `</head>`,
 * ensuring the App Shell renders without waiting for external stylesheet fetches.
 */
export function criticalCssPlugin(): Plugin {
  return {
    name: 'critical-css',
    transformIndexHtml(html) {
      return html.replace('</head>', `<style>${CRITICAL_CSS}</style>\n</head>`);
    },
  };
}
