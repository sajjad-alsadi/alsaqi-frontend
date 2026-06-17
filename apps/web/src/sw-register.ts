/**
 * Service Worker Registration
 *
 * Registers the service worker and listens for updates.
 * When a new worker activates, dispatches a 'sw:updated' CustomEvent
 * so the UI can notify the user about available updates.
 *
 * Validates: Requirements 5.5
 */

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // Notify the application that a new version is available
          window.dispatchEvent(new CustomEvent('sw:updated'));
        }
      });
    });
  } catch (error) {
    // Registration failure is non-fatal — app works without SW caching.
    // Logged for observability but does not interrupt user experience.
    console.warn('[SW] Registration failed:', error);
  }
}
