// RakshaSetu Service Worker (Production PWA Offline Engine)
const CACHE_NAME = 'rakshasetu-core-v3.3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './auth/callback.html',
  './auth/reset-password.html',
  './manifest.webmanifest',
  './css/variables.css',
  './css/reset.css',
  './css/components.css',
  './css/app.css',
  './js/app.js',
  './js/realtime-service.js',
  './js/auth-service.js',
  './js/supabase-client.js',
  './js/store.js',
  './js/api-client.js',
  './js/language-service.js',
  './js/network-manager.js',
  './js/offline-storage.js',
  './js/emergency-sos.js',
  './js/safety-assistant.js',
  './js/safety-map.js',
  './js/alerts-manager.js',
  './js/health-guide.js',
  './js/family-safety.js',
  './js/resource-requests.js',
  './js/core/index.js',
  './js/core/location-service.js',
  './js/core/connectivity-service.js',
  './js/core/offline-queue.js',
  './js/core/communication-fallback.js',
  './js/core/sync-manager.js',
  './js/core/safety-guidance-service.js',
  './js/core/risk-data-service.js',
  './js/core/route-service.js',
  './js/core/satellite-service.js',
  './js/core/heartbeat-service.js',
  './js/core/low-data-ping.js',
  './i18n/index.js',
  './i18n/en.js',
  './i18n/hi.js',
  './i18n/as.js',
  './i18n/bn.js',
  './i18n/brx.js',
  './i18n/doi.js',
  './i18n/gu.js',
  './i18n/kn.js',
  './i18n/ks.js',
  './i18n/kok.js',
  './i18n/mai.js',
  './i18n/ml.js',
  './i18n/mni.js',
  './i18n/mr.js',
  './i18n/ne.js',
  './i18n/or.js',
  './i18n/pa.js',
  './i18n/sa.js',
  './i18n/sat.js',
  './i18n/sd.js',
  './i18n/ta.js',
  './i18n/te.js',
  './i18n/ur.js',
  './assets/icons/app-icon.svg',
  './assets/data/regional-packages.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[RakshaSetu SW] Precaching offline core assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[RakshaSetu SW] Purging old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never intercept non-GET or browser extension schemes
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // Network-first for HTML / navigation requests and JavaScript files to prevent stale code while preserving offline capability
  const isHtmlOrNav = event.request.mode === 'navigate' ||
                      event.request.url.endsWith('/') ||
                      event.request.url.includes('/index.html');
  const isJs = event.request.url.includes('/js/') || event.request.url.endsWith('.js');

  if (isHtmlOrNav || isJs) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(res => res || (isHtmlOrNav ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached asset immediately, revalidate in background if online
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Offline */});
        return cachedResponse;
      }

      // Network fallback
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Return offline fallback if HTML requested
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
