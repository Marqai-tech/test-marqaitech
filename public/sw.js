// 3Boxes HRMS Service Worker v1.1
// Enables offline support and auto-updates for the PWA.
// v1.1 — Task 58: bump cache version to force-clear any stale cached
// bundles / login page states that could cause "Failed to fetch" errors
// on the login API for super admin (or any other role).

const CACHE_NAME = '3boxes-hrms-v5';
const STATIC_ASSETS = [
  '/login',
  '/icon.png',
  '/apple-icon.png',
  '/favicon.ico',
  '/icons/favicon-32x32.png',
  '/icons/favicon-16x16.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[3Boxes SW] Installing service worker v1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[3Boxes SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[3Boxes SW] Some assets failed to cache:', err);
        // Don't fail install if some assets can't be cached
        return Promise.resolve();
      });
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log(`[3Boxes SW] Activating service worker ${CACHE_NAME}...`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[3Boxes SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Do not call clients.claim(). Taking control mid-load makes Chrome
  // replace the page with "This page couldn't load".
});

// Fetch event - network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Never intercept page loads. A failed or empty service-worker response
  // makes Chrome show "This page couldn't load".
  if (request.mode === 'navigate' || request.destination === 'document') return;

  // Skip API calls and authentication - always use network
  if (url.pathname.startsWith('/api/')) return;

  // Skip Next.js bundles and data requests
  if (url.pathname.startsWith('/_next/')) return;

  // For static assets - cache first, network fallback
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cache, but also update cache in background
          fetch(request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, response);
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }
        // Not in cache, fetch from network
        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[3Boxes SW] Cache cleared');
    });
  }
});
