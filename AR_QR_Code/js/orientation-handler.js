/**
 * Orientation Handler Module
 * Handles device orientation changes and viewport resizes.
 * Re-renders layout within 1 second without losing user state.
 *
 * Responsibilities:
 * - Listen for orientationchange and resize events
 * - Debounce resize events for smooth handling
 * - Resize video elements in the viewer to fill new viewport
 * - Preserve user state (selected animation, generated QR, AR session) across changes
 *
 * Requirements: 10.4
 */

var OrientationHandler = (() => {
  let isInitialized = false;
  let currentPage = null; // 'creator' or 'viewer'
  let resizeHandler = null;

  // Maximum time allowed for layout re-render after orientation change (ms)
  const MAX_RERENDER_TIME_MS = 1000;
  // Debounce delay for resize events (ms)
  const RESIZE_DEBOUNCE_MS = 150;

  /**
   * Initializes the orientation handler for the current page.
   * Detects whether we're on the creator or viewer page and attaches
   * the appropriate event listeners.
   */
  function init() {
    if (isInitialized) return;

    // Detect which page we're on
    if (document.getElementById('ar-scene-container')) {
      currentPage = 'viewer';
    } else if (document.getElementById('animation-gallery')) {
      currentPage = 'creator';
    }

    // Create debounced resize handler using Utils.debounce
    const debounceFn = (typeof Utils !== 'undefined' && Utils.debounce)
      ? Utils.debounce
      : function(fn, delay) {
          let timeoutId;
          return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn(...args), delay);
          };
        };

    resizeHandler = debounceFn(handleResize, RESIZE_DEBOUNCE_MS);

    // Listen for resize events (covers both resize and orientation changes on modern browsers)
    window.addEventListener('resize', resizeHandler);

    // Listen for legacy orientationchange event (some mobile browsers)
    window.addEventListener('orientationchange', handleOrientationChange);

    isInitialized = true;
  }

  /**
   * Handles the orientationchange event.
   * Triggers a layout update after a short delay to allow the browser
   * to settle the new viewport dimensions.
   */
  function handleOrientationChange() {
    // orientationchange fires before the viewport has fully settled,
    // so we wait a short moment then trigger the resize logic
    setTimeout(() => {
      handleResize();
    }, 100);
  }

  /**
   * Main resize handler — called on debounced resize and after orientationchange.
   * Adjusts layout based on the current page without losing user state.
   */
  function handleResize() {
    if (currentPage === 'viewer') {
      handleViewerResize();
    } else if (currentPage === 'creator') {
      handleCreatorResize();
    }
  }

  /**
   * Handles resize for the viewer page.
   * - Resizes video element to fill new viewport dimensions
   * - Preserves active AR session and camera stream
   * - Does NOT stop or restart the camera
   */
  function handleViewerResize() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Resize the AR scene container to fill the viewport
    const sceneContainer = document.getElementById('ar-scene-container');
    if (sceneContainer) {
      sceneContainer.style.width = viewportWidth + 'px';
      sceneContainer.style.height = viewportHeight + 'px';
    }

    // Resize any video element (camera feed) to fill the new viewport
    const videoEl = document.getElementById('ar-camera-feed');
    if (videoEl) {
      videoEl.style.width = viewportWidth + 'px';
      videoEl.style.height = viewportHeight + 'px';
    }

    // Resize A-Frame scene if present
    const aScene = document.querySelector('a-scene');
    if (aScene) {
      aScene.style.width = viewportWidth + 'px';
      aScene.style.height = viewportHeight + 'px';
      // Notify A-Frame to update its renderer size
      if (aScene.renderer) {
        aScene.renderer.setSize(viewportWidth, viewportHeight);
      }
    }
  }

  /**
   * Handles resize for the creator page.
   * - CSS Grid/Flexbox handles most of the reflow automatically
   * - Adjusts preview container proportions if needed
   * - Preserves selected asset, QR code, and all user state
   */
  function handleCreatorResize() {
    // The preview container should resize proportionally
    const previewContainer = document.getElementById('preview-container');
    if (previewContainer) {
      // Ensure preview images scale within new container bounds
      const images = previewContainer.querySelectorAll('img');
      images.forEach((img) => {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
      });
    }

    // Ensure QR code image scales to fit
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) {
      const qrImages = qrContainer.querySelectorAll('img');
      qrImages.forEach((img) => {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
      });
    }
  }

  /**
   * Cleans up event listeners. Call when the module is no longer needed.
   */
  function destroy() {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
    }
    window.removeEventListener('orientationchange', handleOrientationChange);
    isInitialized = false;
    currentPage = null;
    resizeHandler = null;
  }

  /**
   * Returns the detected page type.
   * @returns {string|null} 'creator', 'viewer', or null
   */
  function getPageType() {
    return currentPage;
  }

  /**
   * Returns whether the handler is initialized.
   * @returns {boolean}
   */
  function isReady() {
    return isInitialized;
  }

  return {
    init,
    destroy,
    getPageType,
    isReady,
    // Exposed for testing
    _handleResize: handleResize,
    _handleViewerResize: handleViewerResize,
    _handleCreatorResize: handleCreatorResize,
    _handleOrientationChange: handleOrientationChange
  };
})();

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    OrientationHandler.init();
  });
}

// Export for testing (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrientationHandler;
}
