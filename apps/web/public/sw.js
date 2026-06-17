// Service Worker — Al-Saqi Audit Management App
// Implements: precaching, App Shell pattern, network-first API caching,
// cache-first static assets, stale-while-revalidate locale files.

'use strict';

// Cache version — bump to invalidate all caches on deploy
var CACHE_VERSION = 'v1';

// Named caches
var PRECACHE_NAME = 'precache-' + CACHE_VERSION;
var STATIC_CACHE = 'static-' + CACHE_VERSION;
var API_CACHE = 'api-' + CACHE_VERSION;
var LOCALE_CACHE = 'locale-' + CACHE_VERSION;

// Expected caches — used during activate to purge stale caches
var EXPECTED_CACHES = [PRECACHE_NAME, STATIC_CACHE, API_CACHE, LOCALE_CACHE];

// Precache manifest — placeholder injected at build time by precacheManifest plugin (task 7.4)
// Each entry: { url: string, revision: string | null }
// revision is null when the URL already contains a content hash
var PRECACHE_MANIFEST = [
  { url: '/index.html', revision: '__BUILD_HASH__' },
  { url: '/assets/vendor-react.js', revision: '__BUILD_HASH__' },
  { url: '/assets/vendor-ui.js', revision: '__BUILD_HASH__' },
  { url: '/assets/vendor-i18n.js', revision: '__BUILD_HASH__' },
  { url: '/assets/app-entry.js', revision: '__BUILD_HASH__' },
  { url: '/assets/styles.css', revision: '__BUILD_HASH__' },
  { url: '/fonts/tajawal-arabic-400.woff2', revision: null },
  { url: '/fonts/tajawal-arabic-700.woff2', revision: null },
  { url: '/fonts/tajawal-arabic-800.woff2', revision: null }
];

// ---------------------------------------------------------------------------
// Install — precache App Shell assets
// ---------------------------------------------------------------------------
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then(function (cache) {
      var urlsToCache = PRECACHE_MANIFEST.map(function (entry) {
        // Append revision as query param for cache-busting when revision is present
        if (entry.revision) {
          return entry.url + '?__precache_rev=' + entry.revision;
        }
        return entry.url;
      });
      return cache.addAll(urlsToCache);
    }).then(function () {
      // Activate new SW immediately without waiting for old clients to close
      return self.skipWaiting();
    })
  );
});

// ---------------------------------------------------------------------------
// Activate — purge stale caches, claim clients
// ---------------------------------------------------------------------------
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) {
            return EXPECTED_CACHES.indexOf(name) === -1;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ---------------------------------------------------------------------------
// Fetch — route requests to appropriate caching strategy
// ---------------------------------------------------------------------------
self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Strategy 1: Navigation requests → cache-first App Shell pattern
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(function (cached) {
        return cached || fetch(request);
      })
    );
    return;
  }

  // Strategy 2: API GET requests → network-first with 3s timeout
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(networkFirstWithTimeout(request, 3000));
    return;
  }

  // Strategy 3: Static assets (JS, CSS, fonts) → cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategy 4: Locale files → stale-while-revalidate
  if (url.pathname.startsWith('/locales/')) {
    event.respondWith(staleWhileRevalidate(request, LOCALE_CACHE));
    return;
  }
});

// ---------------------------------------------------------------------------
// Cache Strategies
// ---------------------------------------------------------------------------

/**
 * Network-first with timeout fallback to cache.
 * Uses AbortController to enforce the timeout on the network request.
 *
 * @param {Request} request - The fetch request
 * @param {number} timeout - Timeout in milliseconds before falling back to cache
 * @returns {Promise<Response>}
 */
function networkFirstWithTimeout(request, timeout) {
  var controller = new AbortController();
  var timeoutId = setTimeout(function () {
    controller.abort();
  }, timeout);

  return fetch(request, { signal: controller.signal })
    .then(function (response) {
      clearTimeout(timeoutId);
      // Cache successful responses for future offline use
      if (response.ok) {
        var responseClone = response.clone();
        caches.open(API_CACHE).then(function (cache) {
          cache.put(request, responseClone);
        });
      }
      return response;
    })
    .catch(function () {
      clearTimeout(timeoutId);
      // Network failed or timed out — try cache
      return caches.match(request).then(function (cached) {
        if (cached) {
          return cached;
        }
        // No cache available — return offline error response
        return new Response(
          JSON.stringify({ error: 'offline', message: 'Network unavailable and no cached response found.' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      });
    });
}

/**
 * Cache-first strategy — serve from cache, fall back to network and update cache.
 *
 * @param {Request} request - The fetch request
 * @param {string} cacheName - Name of the cache to use
 * @returns {Promise<Response>}
 */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(function (cached) {
    if (cached) {
      return cached;
    }
    return fetch(request).then(function (response) {
      if (response.ok) {
        var responseClone = response.clone();
        caches.open(cacheName).then(function (cache) {
          cache.put(request, responseClone);
        });
      }
      return response;
    });
  });
}

/**
 * Stale-while-revalidate — serve from cache immediately, fetch fresh copy in background.
 *
 * @param {Request} request - The fetch request
 * @param {string} cacheName - Name of the cache to use
 * @returns {Promise<Response>}
 */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      // Always fetch fresh copy in background
      var fetchPromise = fetch(request).then(function (response) {
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
        // Network failure — silently ignore, cached version is still valid
        return cached;
      });

      // Return cached version immediately if available, otherwise wait for network
      return cached || fetchPromise;
    });
  });
}
