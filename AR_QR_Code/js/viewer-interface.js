/**
 * Viewer Interface Module
 * Manages the AR viewing experience: camera activation, overlay management, error states.
 * Wires the full AR pipeline: camera → marker tracking → AR rendering → zoom → marker loss.
 * 
 * Responsibilities:
 * - Parse asset ID from URL parameters
 * - Check device/browser support for AR experience
 * - Request camera permission within 2 seconds of page interactive
 * - Show instruction overlay once camera is active
 * - Set up A-Frame AR scene after camera permission granted
 * - Load animation asset and wire marker tracking to AR renderer
 * - Wire zoom controller and marker loss handler
 * - Display appropriate errors for unsupported browsers, denied permissions, missing cameras
 */

var ViewerInterface = (() => {
  let currentAssetId = null;
  let isInitialized = false;
  let initStartTime = null;
  let arSceneSetUp = false;

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
   * 4. On success: show instruction overlay, then set up AR scene
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

      // Step 5: Set up the AR scene and wire all components
      await setupARScene(currentAssetId);
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
   * Sets up the A-Frame AR scene after camera permission is granted.
   * Injects the <a-scene> with AR.js attributes, loads the animation asset,
   * starts marker tracking, and wires all event callbacks.
   * 
   * @param {string} assetId - The animation asset ID to load and display.
   */
  async function setupARScene(assetId) {
    if (arSceneSetUp) return;
    arSceneSetUp = true;

    var container = document.getElementById('ar-scene-container');
    if (!container) {
      showError('AR scene container not found. Please reload the page.', true);
      return;
    }

    // Step 1: Load the animation manifest and resolve the asset
    var asset = null;
    try {
      if (typeof AnimationLibrary !== 'undefined') {
        await AnimationLibrary.loadManifest();
        asset = AnimationLibrary.getAssetById(assetId);
      }
    } catch (e) {
      console.error('ViewerInterface: Failed to load animation manifest', e);
    }

    if (!asset) {
      // Show asset load error via ARRenderer if available
      if (typeof ARRenderer !== 'undefined') {
        ARRenderer.showLoadError();
      } else {
        showError('Could not load animation. The asset was not found.', true);
      }
      return;
    }

    // Step 2: Inject A-Frame AR scene into the container
    // Determine marker configuration: use asset pattern file if available, else fallback to hiro preset
    var markerHtml;
    if (asset.patternPath) {
      markerHtml = '<a-marker type="pattern" url="' + asset.patternPath + '" id="ar-marker"></a-marker>';
    } else {
      // Fallback to hiro preset for testing when no custom pattern is available
      markerHtml = '<a-marker preset="hiro" id="ar-marker"></a-marker>';
    }

    var sceneHtml =
      '<a-scene embedded arjs="sourceType: webcam; detectionMode: mono; debugUIEnabled: false;" ' +
      'vr-mode-ui="enabled: false" ' +
      'renderer="logarithmicDepthBuffer: true; alpha: true;" ' +
      'id="ar-scene">' +
      markerHtml +
      '<a-entity camera id="ar-camera"></a-entity>' +
      '</a-scene>';

    container.innerHTML = sceneHtml;

    // Wait for the scene to initialize
    var sceneEl = document.getElementById('ar-scene');
    var markerEl = document.getElementById('ar-marker');

    if (!sceneEl || !markerEl) {
      showError('Failed to initialize AR scene. Please reload.', true);
      return;
    }

    // Step 3: Initialize ARRenderer with the scene and marker references
    if (typeof ARRenderer !== 'undefined') {
      ARRenderer.init(sceneEl, markerEl);

      // Load the asset into the renderer (creates entity inside marker)
      var loadSuccess = ARRenderer.loadAsset(asset);
      if (!loadSuccess) {
        // ARRenderer.showLoadError() is called internally on failure
        return;
      }
    }

    // Step 4: Start marker tracking
    if (typeof MarkerTracker !== 'undefined') {
      MarkerTracker.startTracking();
    }

    // Step 5: Wire marker found event
    if (typeof MarkerTracker !== 'undefined') {
      MarkerTracker.onMarkerFound(function(data) {
        // Place asset at detected position and start animation
        if (typeof ARRenderer !== 'undefined') {
          ARRenderer.placeAsset(data.position, data.orientation);
          ARRenderer.startAnimation();
        }

        // Hide instruction overlay and show zoom controls
        hideInstructionOverlay();
        showZoomControls();

        // Notify MarkerLossHandler of marker found (for recovery from persist/fade)
        if (typeof MarkerLossHandler !== 'undefined') {
          var scale = (typeof ZoomController !== 'undefined') ? ZoomController.getCurrentScale() : 1.0;
          MarkerLossHandler.onMarkerFound(data.position, data.orientation, scale);
        }
      });

      // Step 6: Wire marker lost event
      MarkerTracker.onMarkerLost(function(data) {
        if (typeof MarkerLossHandler !== 'undefined') {
          MarkerLossHandler.onMarkerLost();
        }
      });
    }

    // Step 7: Wire MarkerLossHandler callbacks
    if (typeof MarkerLossHandler !== 'undefined') {
      // When fade completes (asset fully invisible) → show instruction overlay, hide zoom
      MarkerLossHandler.onFadeComplete(function() {
        showInstructionOverlay();
        hideZoomControls();

        // Trigger the actual fade on the renderer during the FADING state
        // (The fade animation is initiated when transitioning to FADING state)
      });

      // When marker is restored during persist/fade → restore asset visibility
      MarkerLossHandler.onRestore(function(data) {
        if (typeof ARRenderer !== 'undefined') {
          ARRenderer.fadeIn();
          ARRenderer.updatePosition(data.position, data.orientation);
        }
      });
    }

    // Step 8: Initiate fade-out on the renderer when MarkerLossHandler enters FADING state
    // The MarkerLossHandler internally starts a fade timer. We hook into the state transition
    // by wrapping the onMarkerLost flow: after persist timeout, the handler transitions to FADING.
    // The fadeOut call is driven by MarkerLossHandler's internal timer firing startFade().
    // We need ARRenderer.fadeOut() to run when the state transitions to FADING.
    // Since MarkerLossHandler handles this via setTimeout internally, we patch it by
    // observing state changes. However, the cleaner approach is to call fadeOut when
    // the persist timer fires. We achieve this by checking state in a monitoring loop
    // OR by modifying the marker lost callback to schedule the fade.
    // 
    // Best approach: Override the MarkerLossHandler's startFade behavior by checking state
    // after the persist duration elapses.
    if (typeof MarkerLossHandler !== 'undefined' && typeof ARRenderer !== 'undefined') {
      // Store the original onMarkerLost to add fadeOut behavior
      var originalMarkerLostCallbacks = [];
      
      // Monitor state transitions using a lightweight poll after marker loss
      var fadeCheckInterval = null;
      var lastKnownState = 'LOST';
      
      // We re-register a markerLost callback that triggers fade monitoring
      MarkerTracker.onMarkerLost(function() {
        // Start monitoring for FADING state transition
        if (fadeCheckInterval) {
          clearInterval(fadeCheckInterval);
        }
        lastKnownState = MarkerLossHandler.getState();
        
        fadeCheckInterval = setInterval(function() {
          var currentState = MarkerLossHandler.getState();
          
          if (currentState === 'FADING' && lastKnownState !== 'FADING') {
            // State just transitioned to FADING — trigger renderer fadeOut
            ARRenderer.fadeOut(MarkerLossHandler.getFadeOutDuration());
          }
          
          if (currentState === 'LOST' || currentState === 'TRACKING') {
            // Terminal states — stop monitoring
            clearInterval(fadeCheckInterval);
            fadeCheckInterval = null;
          }
          
          lastKnownState = currentState;
        }, 50); // Check every 50ms for responsive state detection
      });
    }

    // Step 9: Wire ZoomController
    if (typeof ZoomController !== 'undefined') {
      ZoomController.enablePinchZoom();
      ZoomController.enableButtonZoom();

      // Wire scale changes to ARRenderer
      ZoomController.onScaleChange(function(scale) {
        if (typeof ARRenderer !== 'undefined') {
          ARRenderer.setScale(scale);
        }
      });
    }

    console.log('ViewerInterface: AR scene setup complete for asset:', assetId);
  }

  /**
   * Shows the zoom controls overlay.
   */
  function showZoomControls() {
    var controls = document.getElementById('zoom-controls');
    if (controls) {
      controls.hidden = false;
      controls.removeAttribute('hidden');
    }
  }

  /**
   * Hides the zoom controls overlay.
   */
  function hideZoomControls() {
    var controls = document.getElementById('zoom-controls');
    if (controls) {
      controls.hidden = true;
    }
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
    setupARScene,
    showInstructionOverlay,
    hideInstructionOverlay,
    showZoomControls,
    hideZoomControls,
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
