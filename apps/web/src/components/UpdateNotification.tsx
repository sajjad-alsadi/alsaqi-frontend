import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * UpdateNotification
 *
 * A non-intrusive toast notification that appears when a new service worker
 * version activates. Listens for the 'sw:updated' CustomEvent dispatched by
 * registerServiceWorker() and shows a banner prompting the user to refresh.
 *
 * Design: Matches the project design system (teal primary, rounded-xl, shadows).
 * Supports RTL layout via logical properties (inset-inline-end, etc.).
 *
 * Validates: Requirements 5.5
 */
export function UpdateNotification() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setVisible(true);
    window.addEventListener('sw:updated', handleUpdate);
    return () => window.removeEventListener('sw:updated', handleUpdate);
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 end-4 z-[9999] animate-fade-in-up"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-center gap-3 bg-[var(--color-card)] border border-[var(--color-border-soft)] rounded-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] max-w-sm">
        {/* Icon */}
        <div className="w-9 h-9 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
          <RefreshCw size={18} className="text-[var(--color-primary)]" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-main)] leading-tight">
            A new version is available.
          </p>
          <button
            onClick={handleRefresh}
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors mt-0.5 cursor-pointer underline-offset-2 hover:underline"
          >
            Refresh to update.
          </button>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--color-bg-soft)] transition-colors cursor-pointer"
          aria-label="Dismiss update notification"
        >
          <X size={14} className="text-[var(--color-text-muted)]" />
        </button>
      </div>
    </div>
  );
}

export default UpdateNotification;
