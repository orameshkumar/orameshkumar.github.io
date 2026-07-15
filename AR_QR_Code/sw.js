/**
 * Service Worker - AR QR Code PWA
 * Implements cache-first for app shell, network-first for animation assets.
 */

const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `ar-qr-app-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `ar-qr-assets-${CACHE_VERSION}`;
const MAX_ASSET_CACHE_SIZE = 50;

const APP_SHELL_FILES = [
  './',
  './index.html',
  './viewer.html',
  './css/styles.css',
  './js/animation-library.js',
  './js/creator-interface.js',
  './js/qr-generator.js',
  './js/viewer-interface.js',
  './js/camera-activator.js',
  './js/marker-tracker.js',
  './js/ar-renderer.js',
  './js/zoom-controller.js',
  './js/marker-loss-handler.js',
  './js/service-worker-manager.js',
  './js/utils.js',
  './manifest.json'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL_FILES);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== APP_SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - strategy routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Animation assets use network-first strategy
  if (url.pathname.includes('/assets/')) {
    event.respondWith(networkFirstStrategy(event.request));
  } else {
    // App shell uses cache-first strategy
    event.respondWith(cacheFirstStrategy(event.request));
  }
});

/**
 * Cache-first strategy for app shell resources.
 * Serves from cache if available, falls back to network.
 */
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return offline fallback if available
    if (request.destination === 'document') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline - content not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Network-first strategy for animation assets.
 * Tries network first, caches successful responses, falls back to cache.
 */
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(ASSET_CACHE);
      cache.put(request, networkResponse.clone());
      trimCache(ASSET_CACHE, MAX_ASSET_CACHE_SIZE);
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Asset not available offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Trim cache to a maximum number of entries.
 */
async function trimCache(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxSize) {
    await cache.delete(keys[0]);
    trimCache(cacheName, maxSize);
  }
}
