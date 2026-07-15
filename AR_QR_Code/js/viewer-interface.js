/**
 * Viewer Interface Module
 * Manages the AR viewing experience: camera activation, overlay management, error states.
 * 
 * Responsibilities:
 * - Parse asset ID from URL parameters
 * - Check device/browser support for AR experience
 * - Request camera permission within 2 seconds of page interactive
 * - Show instruction overlay once camera is active
 * - Display appropriate errors for unsupported browsers, denied permissions, missing cameras
 */

var ViewerInterface = (() => {
  let currentAssetId = null;
  let isInitialized = false;
  let initStartTime = null;

  // Maximum time (ms) allowed between page interactive and camera request
  const CAMERA_REQUEST_DEADLINE_MS = 2000;

  /**
   * Initializes the viewer with an asset ID.
   * If no assetId is provided, parses it from the current page URL.
   * 
   * Flow:
   * 1. Parse asset ID from URL if not provided
   * 2. Check device/browser support via CameraActivator.checkSupport()
   * 3. Request camera permission within 2 seconds of page interactive
   * 4. On success: show instruction overlay
   * 5. On error: show appropriate error message
   * 
   * @param {string} [assetId] - The animation asset identifier. If omitted, parsed from URL.
   */
  async function initialize(assetId) {
    initStartTime = Date.now();

    // Step 1: Parse asset ID from URL if not provided
    if (!assetId) {
      if (typeof Utils !== 'undefined' && Utils.parseAssetId) {
        assetId = Utils.parseAssetId(window.location.href);
      }
    }

    if (!assetId) {
      showError('No animation specified. Please scan a valid AR QR code.', false);
      hideLoading();
      return;
    }

    currentAssetId = assetId;

    // Step 2: Check device/browser support
    var capability;
    if (typeof CameraActivator !== 'undefined') {
      capability = CameraActivator.checkSupport();
    } else {
      showError('AR system not available. Please reload the page.', true);
      hideLoading();
      return;
    }

    if (!capability.browserSupported) {
      showBrowserUnsupported(
        CameraActivator.getSupportedBrowsers
          ? CameraActivator.getSupportedBrowsers().map(function(b) { return b.name + ' ' + b.minVersion + '+'; })
          : ['Safari 14+', 'Chrome 80+', 'Firefox 79+']
      );
      hideLoading();
      return;
    }

    if (!capability.supportsWebRTC) {
      showBrowserUnsupported(['Safari 14+', 'Chrome 80+', 'Firefox 79+']);
      hideLoading();
      return;
    }

    // Step 3: Request camera permission within 2 seconds of page interactive
    try {
      await requestCameraWithDeadline();
      hideLoading();
      // Step 4: Show instruction overlay once camera is active
      showInstructionOverlay();
      isInitialized = true;
    } catch (error) {
      hideLoading();
      handleCameraError(error);
    }
  }

  /**
   * Requests camera permission, ensuring the request starts within the 2-second deadline.
   * Uses CameraActivator.requestPermission() for the actual permission request.
   * @returns {Promise<MediaStream>}
   */
  async function requestCameraWithDeadline() {
    var elapsed = Date.now() - initStartTime;
    var remaining = CAMERA_REQUEST_DEADLINE_MS - elapsed;

    if (remaining <= 0) {
      // Already past deadline, but still attempt the request
      return CameraActivator.requestPermission();
    }

    // The request is initiated within the deadline window
    return CameraActivator.requestPermission();
  }

  /**
   * Handles camera errors by displaying the appropriate error message.
   * @param {Error} error - The camera error
   */
  function handleCameraError(error) {
    if (error.name === 'NotAllowedError') {
      // Step 5: Camera permission denied - show settings instructions
      showError(
        'Camera permission was denied. To use the AR experience, please enable camera access in your device settings:\n' +
        '• iOS: Settings > Safari > Camera > Allow\n' +
        '• Android: Settings > Apps > Browser > Permissions > Camera\n' +
        '• Desktop: Click the camera icon in the address bar',
        false
      );
    } else if (error.name === 'NotFoundError') {
      // Step 6: No rear camera found
      showError(
        'No rear-facing camera was found on this device. A rear camera is required for the AR experience. Please try on a mobile device with a rear camera.',
        false
      );
    } else if (error.name === 'NotSupportedError') {
      // Step 7: Browser doesn't support required features
      showBrowserUnsupported(['Safari 14+', 'Chrome 80+', 'Firefox 79+']);
    } else {
      // Generic/unknown camera error - allow retry
      showError('Camera error: ' + error.message, true);
    }
  }

  /**
   * Shows the instruction overlay guiding the user to point their camera at the QR code.
   * Called once camera is active.
   */
  function showInstructionOverlay() {
    var overlay = document.getElementById('instruction-overlay');
    if (overlay) {
      overlay.hidden = false;
    }
  }

  /**
   * Hides the instruction overlay.
   * Called when marker is detected by MarkerTracker.
   */
  function hideInstructionOverlay() {
    var overlay = document.getElementById('instruction-overlay');
    if (overlay) {
      overlay.hidden = true;
    }
  }

  /**
   * Shows an error message with optional retry button.
   * @param {string} message - Error message to display.
   * @param {boolean} retryable - Whether a retry button should be shown.
   */
  function showError(message, retryable) {
    var overlay = document.getElementById('error-overlay');
    var descEl = document.getElementById('error-description');
    var retryBtn = document.getElementById('error-retry-btn');

    if (overlay) {
      overlay.hidden = false;
    }
    if (descEl) {
      descEl.textContent = message;
    }
    if (retryBtn) {
      retryBtn.hidden = !retryable;
      if (retryable) {
        // Remove previous listener to avoid duplicates
        retryBtn.onclick = function() {
          hideError();
          showLoading();
          initialize(currentAssetId);
        };
      }
    }

    // Hide other overlays when showing error
    hideInstructionOverlay();
  }

  /**
   * Hides the error overlay.
   */
  function hideError() {
    var overlay = document.getElementById('error-overlay');
    if (overlay) {
      overlay.hidden = true;
    }
  }

  /**
   * Shows the browser unsupported overlay with a list of supported browsers.
   * Displays a full-screen message indicating the browser is not compatible.
   * @param {Array<string>} browsers - List of supported browser strings (e.g., ['Safari 14+', 'Chrome 80+', 'Firefox 79+'])
   */
  function showBrowserUnsupported(browsers) {
    var overlay = document.getElementById('unsupported-overlay');
    var list = document.getElementById('browser-list');

    if (overlay) {
      overlay.hidden = false;
    }
    if (list && browsers && browsers.length > 0) {
      list.innerHTML = browsers.map(function(b) { return '<li>' + b + '</li>'; }).join('');
    }

    // Hide other overlays
    hideInstructionOverlay();
    hideLoading();
  }

  /**
   * Hides the loading overlay.
   */
  function hideLoading() {
    var loading = document.getElementById('loading-overlay');
    if (loading) {
      loading.hidden = true;
    }
  }

  /**
   * Shows the loading overlay.
   */
  function showLoading() {
    var loading = document.getElementById('loading-overlay');
    if (loading) {
      loading.hidden = false;
    }
  }

  /**
   * Returns the current asset ID.
   * @returns {string|null}
   */
  function getAssetId() {
    return currentAssetId;
  }

  /**
   * Returns whether the viewer has been successfully initialized.
   * @returns {boolean}
   */
  function isReady() {
    return isInitialized;
  }

  return {
    initialize,
    showInstructionOverlay,
    hideInstructionOverlay,
    showError,
    hideError,
    showBrowserUnsupported,
    hideLoading,
    showLoading,
    getAssetId,
    isReady
  };
})();

// Auto-initialize on page load — requests camera within 2 seconds of page interactive
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('ar-scene-container')) {
      var assetId = (typeof Utils !== 'undefined' && Utils.parseAssetId)
        ? Utils.parseAssetId(window.location.href)
        : null;
      ViewerInterface.initialize(assetId);
    }
  });
}

// Export for testing (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ViewerInterface;
}
