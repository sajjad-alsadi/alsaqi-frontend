import React from 'react';

/**
 * CSS-only App Shell skeleton displayed during session verification.
 *
 * Uses the same CSS classes injected by the criticalCssPlugin (`app-shell`,
 * `app-shell-spinner`) so it renders immediately from inlined critical CSS —
 * no external stylesheet or JS dependency required for first paint.
 *
 * Layout: 260px sidebar placeholder + main content area with a centered spinner.
 * Responsive: collapses to single-column on mobile (<768px via critical CSS media query).
 *
 * @see criticalCss.ts — inlines `.app-shell` and `.app-shell-spinner` styles
 * @see Requirements 2.4 — App Shell skeleton during session check
 * @see Requirements 2.6 — FCP within 1.5s on simulated 4G
 */
const AppShellSkeleton: React.FC = () => (
  <div className="app-shell">
    {/* Sidebar placeholder — uses the 260px grid column from critical CSS */}
    <div aria-hidden="true" />
    {/* Main content area with centered spinner */}
    <div className="app-shell-spinner" role="status" aria-label="Loading application">
      <span className="sr-only">Loading...</span>
    </div>
  </div>
);

export default AppShellSkeleton;
