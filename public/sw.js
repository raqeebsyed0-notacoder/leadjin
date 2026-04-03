/**
 * LEADJIN Service Worker
 * Strategy:
 *  - API calls (/api/*): Network-first, fallback to cache
 *  - Static assets (JS, CSS, fonts, images): Cache-first
 *  - HTML navigation: Network-first with offline fallback
 */

const CACHE_VERSION = 'leadjin-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('leadjin-') && key !== STATIC_CACHE && key !== API_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API routes: Network-first, cache for offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE, 10000));
    return;
  }

  // Static assets: Cache-first
  if (/\.(js|css|woff2?|png|svg|jpg|ico)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML navigation: Network-first with offline fallback
  event.respondWith(networkFirstWithOffline(request));
});

// ── Background Sync ────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-leads') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client => client.postMessage({ type: 'SW_SYNC_REQUEST' }))
      )
    );
  }
});

// ── Strategy Helpers ───────────────────────────────────────────────────────

async function networkFirst(request, cacheName, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    clearTimeout(timeout);
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ error: 'Offline — cached data unavailable', cached: false }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstWithOffline(request) {
  try {
    return await fetch(request);
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      '<!DOCTYPE html><html><head><title>LEADJIN — Offline</title><style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;color:#fff;text-align:center}h1{font-size:2rem;font-weight:300;letter-spacing:.1em}p{opacity:.5;font-size:.875rem}</style></head><body><h1>LEADJIN</h1><p>You are offline. Please reconnect to continue.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
