/**
 * GlassTech ERP — Service Worker v4
 * Strategy: NETWORK-FIRST for app code (JS/CSS) + navigation, cache-first only
 * for truly-immutable media (images/fonts). Supabase/Anthropic = network only.
 *
 * WHY v4 (2026-07-15): v3 served JS/CSS **cache-first** with a static cache
 * name, so once a bundle was cached the SW kept serving the OLD app forever —
 * hard-refresh + "clear cache" do NOT evict a service-worker cache, so every
 * code deploy silently never reached the browser ("same issue" on fixes that
 * were actually shipped). Network-first guarantees the latest code loads while
 * online; the cache is now only an OFFLINE fallback. Bumping the cache name
 * purges the stale v3 assets on activate.
 */

const CACHE_NAME    = 'gt-erp-v4';
const FACTORY_CACHE = 'gt-factory-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate — purge every cache except the current ones ──────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FACTORY_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Allow the page to force an immediate SW takeover ──────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Network-first helper: fresh when online, cached copy only as offline fallback.
const networkFirst = (request) =>
  fetch(request)
    .then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
      }
      return res;
    })
    .catch(() => caches.match(request).then(c => c || caches.match('/index.html')));

// ── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Supabase / Anthropic API — network only, never cache
  if (url.hostname.includes('supabase.co') || url.hostname.includes('anthropic.com')) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Navigation (index.html) — network first
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // App code (JS/CSS) — NETWORK FIRST so new deploys always load when online
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Immutable media (images/fonts) — cache first, long TTL
  if (url.pathname.match(/\.(svg|png|jpg|jpeg|webp|ico|woff2?|ttf|otf)$/)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      }))
    );
    return;
  }

  // Default — network first, cache fallback
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ── Push Notifications (for future use) ──────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json().catch(() => ({ title: 'GlassTech ERP', body: event.data.text() }));
  event.waitUntil(
    data.then(d =>
      self.registration.showNotification(d.title || 'GlassTech ERP', {
        body:  d.body  || '',
        icon:  '/icon.svg',
        badge: '/icon.svg',
        tag:   d.tag   || 'glasstech-erp',
        data:  d.url   || '/',
      })
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data || '/')
  );
});
