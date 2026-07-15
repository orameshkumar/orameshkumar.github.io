/**
 * Marker Tracker Module
 * Configures AR.js pattern marker detection and manages tracking events.
 * Wraps A-Frame/AR.js marker system and exposes a clean event-based API.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const MarkerTracker = (() => {
  // Configuration
  const CONFIG = {
    scanRate: 15, // minimum 15 scans/second (AR.js default is ~60Hz, exceeds this)
    minMarkerArea: 0.05, // 5% of camera view — markers smaller than this are ignored
    detectionMode: 'mono', // single camera mono detection
    matrixCodeType: '3x3', // pattern matrix type
    patternRatio: 0.5, // ratio of pattern to marker (AR.js default)
    maxDetectionRate: 60, // AR.js runs at up to 60Hz
  };

  // Internal state
  let isTracking = false;
  let markerFoundCallbacks = [];
  let markerLostCallbacks = [];
  let activeMarkerElement = null; // The first detected marker element (only track one)
  let lastPosition = null;
  let lastOrientation = null;
  let markerElement = null;
  let boundMarkerFoundHandler = null;
  let boundMarkerLostHandler = null;

  /**
   * Checks if a marker is large enough to be detectable.
   * Markers occupying less than 5% of camera view are considered undetectable.
   *
   * @param {number} markerAreaPercent - Area of the marker as a fraction of camera view (0-1).
   * @returns {boolean} True if the marker area meets the minimum threshold.
   */
  function isMarkerDetectable(markerAreaPercent) {
    return typeof markerAreaPercent === 'number' &&
      !isNaN(markerAreaPercent) &&
      markerAreaPercent >= CONFIG.minMarkerArea;
  }

  /**
   * Extracts position from an A-Frame marker element's object3D.
   * @param {object} markerEl - The A-Frame marker element.
   * @returns {{ x: number, y: number, z: number }}
   */
  function extractPosition(markerEl) {
    if (markerEl && markerEl.object3D) {
      const pos = markerEl.object3D.position;
      return { x: pos.x, y: pos.y, z: pos.z };
    }
    return { x: 0, y: 0, z: 0 };
  }

  /**
   * Extracts orientation (quaternion) from an A-Frame marker element's object3D.
   * @param {object} markerEl - The A-Frame marker element.
   * @returns {{ x: number, y: number, z: number, w: number }}
   */
  function extractOrientation(markerEl) {
    if (markerEl && markerEl.object3D) {
      const quat = markerEl.object3D.quaternion;
      return { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
    }
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  /**
   * Handles the A-Frame marker 'markerFound' event.
   * Only tracks the first detected marker — ignores subsequent markers.
   * Filters out markers below minimum area threshold.
   *
   * @param {Event} event - The A-Frame markerFound event.
   */
  function handleMarkerFound(event) {
    if (!isTracking) return;

    // Track only the first detected marker when multiples are visible
    if (activeMarkerElement !== null) return;

    const markerEl = event.target || event.currentTarget;

    // Check marker area if available (5% minimum of camera view)
    const markerArea = (event.detail && typeof event.detail.area === 'number')
      ? event.detail.area
      : 1; // Default to 1 (100%) if area not provided by event

    if (!isMarkerDetectable(markerArea)) {
      return; // Marker too small to track reliably
    }

    // Set as the active tracked marker
    activeMarkerElement = markerEl;

    // Extract position and orientation from the marker's 3D object
    const position = extractPosition(markerEl);
    const orientation = extractOrientation(markerEl);

    // Store last known position/orientation
    lastPosition = position;
    lastOrientation = orientation;

    // Emit markerFound event to all registered callbacks
    const eventData = { position, orientation };
    markerFoundCallbacks.forEach(callback => {
      try {
        callback(eventData);
      } catch (e) {
        console.error('MarkerTracker: Error in markerFound callback:', e);
      }
    });
  }

  /**
   * Handles the A-Frame marker 'markerLost' event.
   * Only processes loss for the currently tracked marker.
   *
   * @param {Event} event - The A-Frame markerLost event.
   */
  function handleMarkerLost(event) {
    if (!isTracking) return;

    const markerEl = event.target || event.currentTarget;

    // Only process loss for the active tracked marker
    if (activeMarkerElement !== markerEl && activeMarkerElement !== null) return;

    // Emit markerLost event with last known position and orientation
    const eventData = {
      lastPosition: lastPosition || { x: 0, y: 0, z: 0 },
      lastOrientation: lastOrientation || { x: 0, y: 0, z: 0, w: 1 },
    };

    // Clear active marker so a new one can be detected
    activeMarkerElement = null;

    markerLostCallbacks.forEach(callback => {
      try {
        callback(eventData);
      } catch (e) {
        console.error('MarkerTracker: Error in markerLost callback:', e);
      }
    });
  }

  /**
   * Starts marker tracking via AR.js.
   * Attaches event listeners to the A-Frame marker element.
   * AR.js ARToolKit handles the actual computer vision detection loop.
   */
  function startTracking() {
    if (isTracking) return;

    isTracking = true;
    activeMarkerElement = null;
    lastPosition = null;
    lastOrientation = null;

    // Bind event handlers to A-Frame marker elements in the scene
    bindMarkerEvents();

    console.log('MarkerTracker: Tracking started (scan rate >= ' + CONFIG.scanRate + ' Hz)');
  }

  /**
   * Stops marker tracking and removes event listeners.
   */
  function stopTracking() {
    if (!isTracking) return;

    isTracking = false;
    activeMarkerElement = null;

    // Unbind event handlers from A-Frame marker elements
    unbindMarkerEvents();

    console.log('MarkerTracker: Tracking stopped');
  }

  /**
   * Binds markerFound/markerLost event listeners to A-Frame marker elements.
   * Looks for <a-marker> elements in the scene.
   */
  function bindMarkerEvents() {
    // Create bound handlers so we can remove them later
    boundMarkerFoundHandler = handleMarkerFound.bind(null);
    boundMarkerLostHandler = handleMarkerLost.bind(null);

    // Find all <a-marker> elements in the document
    if (typeof document !== 'undefined') {
      const markers = document.querySelectorAll('a-marker');
      markers.forEach(marker => {
        marker.addEventListener('markerFound', boundMarkerFoundHandler);
        marker.addEventListener('markerLost', boundMarkerLostHandler);
      });

      // Also check for dynamically added markers in the AR scene container
      const sceneContainer = document.getElementById('ar-scene-container');
      if (sceneContainer) {
        const sceneMarkers = sceneContainer.querySelectorAll('a-marker');
        sceneMarkers.forEach(marker => {
          // Avoid double-binding
          if (!markers.length || !Array.from(markers).includes(marker)) {
            marker.addEventListener('markerFound', boundMarkerFoundHandler);
            marker.addEventListener('markerLost', boundMarkerLostHandler);
          }
        });
      }
    }
  }

  /**
   * Unbinds markerFound/markerLost event listeners from A-Frame marker elements.
   */
  function unbindMarkerEvents() {
    if (typeof document !== 'undefined' && boundMarkerFoundHandler && boundMarkerLostHandler) {
      const markers = document.querySelectorAll('a-marker');
      markers.forEach(marker => {
        marker.removeEventListener('markerFound', boundMarkerFoundHandler);
        marker.removeEventListener('markerLost', boundMarkerLostHandler);
      });
    }
    boundMarkerFoundHandler = null;
    boundMarkerLostHandler = null;
  }

  /**
   * Registers a callback for when a marker is found.
   * The callback receives an object with { position: {x,y,z}, orientation: {x,y,z,w} }.
   *
   * @param {Function} callback - Called with event data on marker detection.
   * @returns {Function} Unsubscribe function to remove the callback.
   */
  function onMarkerFound(callback) {
    if (typeof callback === 'function') {
      markerFoundCallbacks.push(callback);
    }
    // Return unsubscribe function
    return () => {
      markerFoundCallbacks = markerFoundCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Registers a callback for when the marker is lost.
   * The callback receives an object with { lastPosition, lastOrientation }.
   *
   * @param {Function} callback - Called when marker leaves camera view.
   * @returns {Function} Unsubscribe function to remove the callback.
   */
  function onMarkerLost(callback) {
    if (typeof callback === 'function') {
      markerLostCallbacks.push(callback);
    }
    // Return unsubscribe function
    return () => {
      markerLostCallbacks = markerLostCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Returns the AR.js/ARToolKit configuration used by this tracker.
   * These settings are applied to the <a-scene> element's arjs attribute.
   *
   * @returns {object} Configuration object for AR.js setup.
   */
  function getARConfig() {
    return {
      sourceType: 'webcam',
      detectionMode: CONFIG.detectionMode,
      matrixCodeType: CONFIG.matrixCodeType,
      patternRatio: CONFIG.patternRatio,
      maxDetectionRate: CONFIG.maxDetectionRate,
      canvasWidth: 640,
      canvasHeight: 480,
    };
  }

  /**
   * Returns whether tracking is active.
   * @returns {boolean}
   */
  function getIsTracking() {
    return isTracking;
  }

  /**
   * Gets the scan rate configuration.
   * @returns {number} Minimum scans per second.
   */
  function getScanRate() {
    return CONFIG.scanRate;
  }

  /**
   * Gets the minimum marker area threshold.
   * @returns {number} Area as fraction of view (0-1).
   */
  function getMinMarkerArea() {
    return CONFIG.minMarkerArea;
  }

  /**
   * Gets the last known marker position.
   * @returns {{ x: number, y: number, z: number } | null}
   */
  function getLastPosition() {
    return lastPosition;
  }

  /**
   * Gets the last known marker orientation.
   * @returns {{ x: number, y: number, z: number, w: number } | null}
   */
  function getLastOrientation() {
    return lastOrientation;
  }

  /**
   * Checks if a marker is currently being actively tracked.
   * @returns {boolean}
   */
  function hasActiveMarker() {
    return activeMarkerElement !== null;
  }

  /**
   * Resets the tracker state (useful for testing and re-initialization).
   */
  function reset() {
    isTracking = false;
    activeMarkerElement = null;
    lastPosition = null;
    lastOrientation = null;
    markerFoundCallbacks = [];
    markerLostCallbacks = [];
    unbindMarkerEvents();
  }

  return {
    startTracking,
    stopTracking,
    onMarkerFound,
    onMarkerLost,
    handleMarkerFound,
    handleMarkerLost,
    isMarkerDetectable,
    getIsTracking,
    getScanRate,
    getMinMarkerArea,
    getARConfig,
    getLastPosition,
    getLastOrientation,
    hasActiveMarker,
    extractPosition,
    extractOrientation,
    reset,
  };
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkerTracker;
}
