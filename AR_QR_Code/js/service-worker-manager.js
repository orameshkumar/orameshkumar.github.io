/**
 * ServiceWorkerManager - Manages PWA service worker registration and offline state.
 * Provides helper methods for registration, online status, and cache information.
 */
// eslint-disable-next-line no-var
var ServiceWorkerManager = (() => {
  const CACHE_VERSION = 'v1';
  const APP_SHELL_CACHE = `ar-qr-app-shell-${CACHE_VERSION}`;
  const ASSET_CACHE = `ar-qr-assets-${CACHE_VERSION}`;

  let _registration = null;
  let _isOnline = navigator.onLine;
  let _offlineBanner = null;

  /**
   * Register the service worker and set up online/offline listeners.
   * @returns {Promise<ServiceWorkerRegistration|null>}
   */
  async function register() {
    _setupOfflineBanner();
    _setupNetworkListeners();

    if (!('serviceWorker' in navigator)) {
      console.warn('ServiceWorkerManager: Service workers not supported');
      return null;
    }

    try {
      _registration = await navigator.serviceWorker.register('/sw.js');
      console.log('ServiceWorkerManager: Registered with scope', _registration.scope);
      return _registration;
    } catch (error) {
      console.warn('ServiceWorkerManager: Registration failed', error);
      return null;
    }
  }

  /**
   * Cache app shell files programmatically (useful for manual cache warming).
   * In normal operation, the service worker handles this on install.
   * @returns {Promise<boolean>}
   */
  async function cacheAppShell() {
    if (!('caches' in window)) {
      return false;
    }

    const appShellFiles = [
      '/',
      '/index.html',
      '/viewer.html',
      '/css/styles.css',
      '/js/animation-library.js',
      '/js/creator-interface.js',
      '/js/qr-generator.js',
      '/js/viewer-interface.js',
      '/js/camera-activator.js',
      '/js/marker-tracker.js',
      '/js/ar-renderer.js',
      '/js/zoom-controller.js',
      '/js/marker-loss-handler.js',
      '/js/service-worker-manager.js',
      '/js/utils.js',
      '/manifest.json'
    ];

    try {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.addAll(appShellFiles);
      return true;
    } catch (error) {
      console.warn('ServiceWorkerManager: Failed to cache app shell', error);
      return false;
    }
  }

  /**
   * Handle fetch requests with appropriate caching strategies.
   * This is a client-side helper for understanding the strategy;
   * actual fetch interception is done by the service worker (sw.js).
   * 
   * Strategy:
   * - App shell (HTML, CSS, JS): cache-first with network fallback
   * - Animation assets (/assets/): network-first with cache fallback
   * 
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async function handleFetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/assets/')) {
      return _networkFirstStrategy(request);
    }
    return _cacheFirstStrategy(request);
  }

  /**
   * Check if the browser is currently online.
   * @returns {boolean}
   */
  function isOnline() {
    return _isOnline;
  }

  /**
   * Get the status of cached resources.
   * @returns {Promise<{appShellCached: boolean, assetsCached: number, cacheVersion: string}>}
   */
  async function getCacheStatus() {
    if (!('caches' in window)) {
      return { appShellCached: false, assetsCached: 0, cacheVersion: CACHE_VERSION };
    }

    let appShellCached = false;
    let assetsCached = 0;

    try {
      const appShell = await caches.open(APP_SHELL_CACHE);
      const appShellKeys = await appShell.keys();
      appShellCached = appShellKeys.length > 0;
    } catch (e) {
      // Cache not available
    }

    try {
      const assets = await caches.open(ASSET_CACHE);
      const assetKeys = await assets.keys();
      assetsCached = assetKeys.length;
    } catch (e) {
      // Cache not available
    }

    return { appShellCached, assetsCached, cacheVersion: CACHE_VERSION };
  }

  // --- Private helpers ---

  /**
   * Cache-first strategy: serve from cache, fallback to network.
   */
  async function _cacheFirstStrategy(request) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(APP_SHELL_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return new Response('Offline - content not available', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  }

  /**
   * Network-first strategy: try network, fallback to cache.
   */
  async function _networkFirstStrategy(request) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }
      return new Response('Asset not available offline', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  }

  /**
   * Create the offline banner element and append to the DOM.
   */
  function _setupOfflineBanner() {
    if (document.getElementById('offline-banner')) {
      _offlineBanner = document.getElementById('offline-banner');
      return;
    }

    _offlineBanner = document.createElement('div');
    _offlineBanner.id = 'offline-banner';
    _offlineBanner.className = 'offline-banner';
    _offlineBanner.setAttribute('role', 'alert');
    _offlineBanner.setAttribute('aria-live', 'polite');
    _offlineBanner.innerHTML = `
      <p class="offline-banner-text">You are offline. New AR experiences require a network connection.</p>
    `;
    _offlineBanner.hidden = true;
    document.body.appendChild(_offlineBanner);

    // Show immediately if already offline
    if (!navigator.onLine) {
      _showOfflineBanner();
    }
  }

  /**
   * Set up network state change listeners.
   */
  function _setupNetworkListeners() {
    window.addEventListener('online', () => {
      _isOnline = true;
      _hideOfflineBanner();
    });

    window.addEventListener('offline', () => {
      _isOnline = false;
      _showOfflineBanner();
    });
  }

  function _showOfflineBanner() {
    if (_offlineBanner) {
      _offlineBanner.hidden = false;
    }
  }

  function _hideOfflineBanner() {
    if (_offlineBanner) {
      _offlineBanner.hidden = true;
    }
  }

  return {
    register,
    cacheAppShell,
    handleFetch,
    isOnline,
    getCacheStatus
  };
})();

// Export for module usage (if module environment available)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServiceWorkerManager;
}
