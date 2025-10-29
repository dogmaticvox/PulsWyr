const CACHE_NAME = 'pulswyr-cache-v1';
const API_CACHE_NAME = 'pulswyr-api-cache-v1';
const urlsToCache = [
  '/', // Cache the root URL if it redirects to dashboard.html or serves it directly
  '/dashboard.html',
  // Add paths to your icons here if you want them cached
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-180x180.png'
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
      .then(() => self.skipWaiting()) // Activate worker immediately
      .catch(error => {
          console.error('Service Worker: Failed to cache app shell:', error);
      })
  );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  const cacheWhitelist = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event: Handle network requests
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Strategy for API calls (Network first, then cache)
  if (requestUrl.hostname === 'api.rss2json.com') {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(cache => {
        return fetch(event.request)
          .then(networkResponse => {
            // If fetch is successful, cache the response
             if (networkResponse.ok) {
                cache.put(event.request, networkResponse.clone());
             }
            return networkResponse;
          })
          .catch(() => {
            // If fetch fails (offline), try to get from cache
            console.log('Service Worker: Fetch failed, serving from API cache:', event.request.url);
            return cache.match(event.request);
          });
      })
    );
  }
  // Strategy for App Shell & other static assets (Cache first, then network)
  else {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          // Return cached response if found
          if (cachedResponse) {
             // console.log('Service Worker: Serving from app cache:', event.request.url);
            return cachedResponse;
          }
          // Otherwise, fetch from network
         // console.log('Service Worker: Fetching from network:', event.request.url);
          return fetch(event.request); // Don't cache assets fetched this way by default
        })
    );
  }
});
