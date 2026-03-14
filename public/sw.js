/**
 * Glasstech ERP — Service Worker
 * Strategy: Cache-first for assets, Network-first for API
 */

const CACHE_NAME  = 'gt-erp-v1';
const OFFLINE_URL = '/offline.html';

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/index.html',
  '/index.css',
  '/icon.svg',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Supabase API calls (always network)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('googleapis.com')) return;

  // JS/CSS/fonts → Cache first, fallback network
  if (
    request.destination === 'script'  ||
    request.destination === 'style'   ||
    request.destination === 'font'    ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML navigation → Network first, fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/index.html') ||
               caches.match('/') ||
               new Response('<h1>Offline</h1><p>Connect to internet to use the app.</p>', {
                 headers: { 'Content-Type': 'text/html' }
               });
      })
    );
    return;
  }
});

// ── Background Sync (retry failed Supabase pushes) ───────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'gt-sync-pending') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SYNC_NOW' }));
      })
    );
  }
});
