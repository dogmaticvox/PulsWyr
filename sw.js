const CACHE_NAME = 'pulswyr-cache-v2';
const API_CACHE_NAME = 'pulswyr-api-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-180x180.png'
];

// Install event: Cache core application shell files
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        console.error('Service Worker: Failed to cache app shell:', error);
      })
  );
});

// Activate event: Clean up old caches and notify clients
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  const cacheWhitelist = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all open clients that a new SW has activated
        return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
          .then(clients => clients.forEach(client =>
            client.postMessage({ type: 'SW_ACTIVATED' })
          ));
      })
  );
});

// Message listener: allow the page to trigger skipWaiting for controlled updates
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event: Handle network requests
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Strategy for API calls: stale-while-revalidate
  // Serve from cache immediately, update cache in the background
  if (requestUrl.hostname === 'api.rss2json.com') {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const networkFetch = fetch(event.request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            console.log('Service Worker: API fetch failed (offline):', event.request.url);
            return cachedResponse; // already have it from the outer scope
          });

          // Return cached immediately if available, otherwise wait for network
          return cachedResponse || networkFetch;
        });
      })
    );
    return;
  }

  // Strategy for App Shell & other static assets: Cache first, then network
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

// Periodic Background Sync: refresh API cache hourly when supported
self.addEventListener('periodicsync', event => {
  if (event.tag === 'feed-refresh') {
    event.waitUntil(refreshCachedFeeds());
  }
});

async function refreshCachedFeeds() {
  const cache = await caches.open(API_CACHE_NAME);
  const keys = await cache.keys();
  return Promise.allSettled(
    keys.map(req =>
      fetch(req).then(res => {
        if (res.ok) cache.put(req, res);
      })
    )
  );
}
