/**
 * Glasstech ERP — Service Worker
 * Strategy: Cache-first for static assets + Vite bundles, Network-first for navigation
 */

const CACHE_NAME  = 'gt-erp-v2';

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

  // Skip non-GET and external API calls
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('googleapis.com')) return;

  // Vite asset bundles (/assets/*.js, /assets/*.css) → Cache first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // JS/CSS/fonts/images → Cache first, fallback network
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
        }).catch(() => caches.match(request));
      })
    );
    return;
  }

  // HTML navigation → Network first, fallback cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        // Cache successful navigation for offline use
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(request) ||
               caches.match('/index.html') ||
               caches.match('/') ||
               new Response(
                 '<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:white;flex-direction:column"><h1 style="font-size:2rem;font-weight:900">GlassTech ERP</h1><p style="color:#94a3b8;margin-top:8px">Offline — Connect to internet to load the app</p><p style="color:#64748b;font-size:12px;margin-top:16px">Your data is safe in local storage</p></body></html>',
                 { headers: { 'Content-Type': 'text/html' } }
               );
      })
    );
    return;
  }
});

// ── Background Sync ──────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'gt-sync-pending') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SYNC_NOW' }));
      })
    );
  }
});
