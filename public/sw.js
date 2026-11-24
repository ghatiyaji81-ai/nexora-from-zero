/* NEXORA Service Worker - Static Asset Caching Only
 * 
 * SECURITY MANDATE:
 * - This service worker caches ONLY static assets (JS, CSS, Fonts, Icons, Manifest, Offline fallback).
 * - It NEVER caches authenticated pages, API responses, user tokens, sessions, or private messages.
 * - Non-GET requests are never intercepted.
 * - Navigation requests follow Network-First with fallback to /offline.html on network failure.
 */

const CACHE_NAME = 'nexora-static-v1';
const STATIC_PRECACHE = [
  '/offline.html',
  '/favicon.ico',
  '/nexora-mark.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
];

const STATIC_EXT_REGEX = /\.(js|css|woff2|woff|ttf|png|jpg|jpeg|svg|gif|webp|ico)(\?.*)?$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PRECACHE))
  );
  // Wait for user confirmation before activating the new version
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Only GET requests can be cached
  if (req.method !== 'GET') {
    return;
  }

  // 2. Strict Security Boundary: Never cache API endpoints, Auth, or Private Workspaces
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/connect') ||
    url.pathname.startsWith('/build') ||
    url.pathname.startsWith('/create') ||
    url.pathname.startsWith('/think') ||
    url.pathname.startsWith('/social')
  ) {
    return;
  }

  // 3. Navigation requests (HTML documents)
  // Network first; on failure, serve the calm /offline.html fallback.
  // Note: We deliberately do NOT cache the resulting HTML in runtime cache to prevent storing user state.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match('/offline.html');
      })
    );
    return;
  }

  // 4. Same-origin Static Assets (Static JS chunks, CSS, Fonts, and Image Assets)
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
     url.pathname.startsWith('/fonts/') ||
     STATIC_EXT_REGEX.test(url.pathname))
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // Default: pass through directly
});
