/**
 * Zoom Controller Module
 * Handles pinch-to-zoom gestures, button-based zoom, and double-tap reset for AR assets.
 * Scaling only changes the scale attribute — position coordinates are never modified.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 10.3
 */

const ZoomController = (() => {
  // Constants
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;
  const DEFAULT_SCALE = 1.0;
  const BUTTON_STEP = 0.25;
  const DOUBLE_TAP_TIME = 300; // ms
  const DOUBLE_TAP_RADIUS = 30; // px
  const THROTTLE_INTERVAL = 33; // ~30fps (1000/30 ≈ 33ms)

  // State
  let currentScale = DEFAULT_SCALE;
  let scaleAtGestureStart = DEFAULT_SCALE;
  let initialDistance = 0;
  let scaleChangeCallback = null;
  let lastNotifyTime = 0;
  let throttleTimer = null;

  // Double-tap state
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  // Track whether listeners are attached (for cleanup/testing)
  let pinchZoomEnabled = false;
  let buttonZoomEnabled = false;

  /**
   * Computes the scale factor from finger distances.
   * Pure function: returns currentDistance / initialDistance.
   * @param {number} initialDist - Initial finger distance (D₀). Must be > 0.
   * @param {number} currentDist - Current finger distance (D₁).
   * @returns {number} Scale factor ratio (D₁ / D₀). Returns 1.0 if initialDist <= 0.
   */
  function computeScale(initialDist, currentDist) {
    if (initialDist <= 0) return 1.0;
    return currentDist / initialDist;
  }

  /**
   * Clamps a scale value to the valid range [0.5, 3.0].
   * Pure function: returns Math.max(0.5, Math.min(3.0, value)).
   * @param {number} value - Raw scale value.
   * @returns {number} Clamped scale value within [MIN_SCALE, MAX_SCALE].
   */
  function clampScale(value) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
  }

  /**
   * Enables pinch-to-zoom touch gesture handling.
   * Attaches touchstart, touchmove, touchend event listeners.
   * Scale factor = (current distance / initial distance) * scale at gesture start.
   * Clamping is applied before emitting scale change.
   */
  function enablePinchZoom() {
    if (pinchZoomEnabled) return;
    pinchZoomEnabled = true;

    document.addEventListener('touchstart', _handleTouchStart, { passive: false });
    document.addEventListener('touchmove', _handleTouchMove, { passive: false });
    document.addEventListener('touchend', _handleTouchEnd, { passive: true });
  }

  /**
   * Enables on-screen zoom buttons for non-multi-touch devices.
   * Renders +/- buttons with ≥44x44px touch targets at bottom-right of the AR view.
   * Each click changes scale by ±0.25 step, clamped to [0.5, 3.0].
   */
  function enableButtonZoom() {
    if (buttonZoomEnabled) return;
    buttonZoomEnabled = true;

    let zoomControls = document.getElementById('zoom-controls');
    let zoomInBtn = document.getElementById('zoom-in-btn');
    let zoomOutBtn = document.getElementById('zoom-out-btn');

    // Create buttons if DOM elements don't exist
    if (!zoomControls) {
      zoomControls = document.createElement('div');
      zoomControls.id = 'zoom-controls';
      zoomControls.className = 'zoom-controls';
      zoomControls.style.position = 'fixed';
      zoomControls.style.right = '16px';
      zoomControls.style.bottom = '16px';
      zoomControls.style.display = 'flex';
      zoomControls.style.flexDirection = 'column';
      zoomControls.style.gap = '8px';
      zoomControls.style.zIndex = '50';

      zoomInBtn = document.createElement('button');
      zoomInBtn.id = 'zoom-in-btn';
      zoomInBtn.className = 'zoom-btn zoom-in';
      zoomInBtn.setAttribute('aria-label', 'Zoom in');
      zoomInBtn.textContent = '+';
      zoomInBtn.style.width = '44px';
      zoomInBtn.style.height = '44px';
      zoomInBtn.style.minWidth = '44px';
      zoomInBtn.style.minHeight = '44px';
      zoomInBtn.style.border = 'none';
      zoomInBtn.style.borderRadius = '50%';
      zoomInBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
      zoomInBtn.style.fontSize = '1.5rem';
      zoomInBtn.style.fontWeight = 'bold';
      zoomInBtn.style.cursor = 'pointer';
      zoomInBtn.style.display = 'flex';
      zoomInBtn.style.alignItems = 'center';
      zoomInBtn.style.justifyContent = 'center';

      zoomOutBtn = document.createElement('button');
      zoomOutBtn.id = 'zoom-out-btn';
      zoomOutBtn.className = 'zoom-btn zoom-out';
      zoomOutBtn.setAttribute('aria-label', 'Zoom out');
      zoomOutBtn.textContent = '\u2212'; // minus sign
      zoomOutBtn.style.width = '44px';
      zoomOutBtn.style.height = '44px';
      zoomOutBtn.style.minWidth = '44px';
      zoomOutBtn.style.minHeight = '44px';
      zoomOutBtn.style.border = 'none';
      zoomOutBtn.style.borderRadius = '50%';
      zoomOutBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
      zoomOutBtn.style.fontSize = '1.5rem';
      zoomOutBtn.style.fontWeight = 'bold';
      zoomOutBtn.style.cursor = 'pointer';
      zoomOutBtn.style.display = 'flex';
      zoomOutBtn.style.alignItems = 'center';
      zoomOutBtn.style.justifyContent = 'center';

      zoomControls.appendChild(zoomInBtn);
      zoomControls.appendChild(zoomOutBtn);
      document.body.appendChild(zoomControls);
    }

    // Show zoom controls
    zoomControls.hidden = false;
    zoomControls.removeAttribute('hidden');

    // Attach click handlers
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', _handleZoomIn);
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', _handleZoomOut);
    }
  }

  /**
   * Registers a callback for scale changes.
   * The callback receives the new scale value at 30fps+ rate.
   * @param {Function} callback - Called with new scale value (number).
   */
  function onScaleChange(callback) {
    scaleChangeCallback = callback;
  }

  /**
   * Gets the current scale value.
   * @returns {number} Current scale factor.
   */
  function getCurrentScale() {
    return currentScale;
  }

  /**
   * Gets the minimum scale constant.
   * @returns {number} MIN_SCALE (0.5).
   */
  function getMinScale() {
    return MIN_SCALE;
  }

  /**
   * Gets the maximum scale constant.
   * @returns {number} MAX_SCALE (3.0).
   */
  function getMaxScale() {
    return MAX_SCALE;
  }

  /**
   * Resets the controller state (useful for testing or re-initialization).
   */
  function reset() {
    currentScale = DEFAULT_SCALE;
    scaleAtGestureStart = DEFAULT_SCALE;
    initialDistance = 0;
    lastTapTime = 0;
    lastTapX = 0;
    lastTapY = 0;
    lastNotifyTime = 0;
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
  }

  /**
   * Disables pinch zoom listeners.
   */
  function disablePinchZoom() {
    if (!pinchZoomEnabled) return;
    pinchZoomEnabled = false;
    document.removeEventListener('touchstart', _handleTouchStart);
    document.removeEventListener('touchmove', _handleTouchMove);
    document.removeEventListener('touchend', _handleTouchEnd);
  }

  /**
   * Disables button zoom.
   */
  function disableButtonZoom() {
    if (!buttonZoomEnabled) return;
    buttonZoomEnabled = false;
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    if (zoomInBtn) zoomInBtn.removeEventListener('click', _handleZoomIn);
    if (zoomOutBtn) zoomOutBtn.removeEventListener('click', _handleZoomOut);
  }

  // ---- Internal: Touch Event Handlers ----

  /**
   * Handles touchstart events.
   * - Two fingers: begin pinch gesture, record initial distance and current scale.
   * - One finger: check for double-tap to reset.
   * @param {TouchEvent} event
   */
  function _handleTouchStart(event) {
    if (event.touches.length === 2) {
      event.preventDefault();
      initialDistance = _getFingerDistance(event.touches);
      scaleAtGestureStart = currentScale;
    } else if (event.touches.length === 1) {
      _detectDoubleTap(event.touches[0]);
    }
  }

  /**
   * Handles touchmove events during pinch gesture.
   * Scale factor = (current distance / initial distance) * scaleAtGestureStart.
   * @param {TouchEvent} event
   */
  function _handleTouchMove(event) {
    if (event.touches.length === 2 && initialDistance > 0) {
      event.preventDefault();
      const currentDistance = _getFingerDistance(event.touches);
      const ratio = computeScale(initialDistance, currentDistance);
      const rawScale = ratio * scaleAtGestureStart;
      currentScale = clampScale(rawScale);
      _throttledNotify();
    }
  }

  /**
   * Handles touchend events.
   * Resets pinch gesture state when fewer than 2 fingers remain.
   * @param {TouchEvent} event
   */
  function _handleTouchEnd(event) {
    if (event.touches.length < 2) {
      initialDistance = 0;
      // Final notify to ensure last scale value is reported
      _notifyScaleChange();
    }
  }

  // ---- Internal: Button Handlers ----

  /**
   * Handles zoom in button click. Increases scale by BUTTON_STEP.
   */
  function _handleZoomIn() {
    currentScale = clampScale(currentScale + BUTTON_STEP);
    _notifyScaleChange();
  }

  /**
   * Handles zoom out button click. Decreases scale by BUTTON_STEP.
   */
  function _handleZoomOut() {
    currentScale = clampScale(currentScale - BUTTON_STEP);
    _notifyScaleChange();
  }

  // ---- Internal: Double-Tap Detection ----

  /**
   * Detects double-tap gestures.
   * Two taps within 300ms and within 30px radius resets scale to 1.0.
   * @param {Touch} touch - The touch point from the event.
   */
  function _detectDoubleTap(touch) {
    const now = Date.now();
    const x = touch.clientX;
    const y = touch.clientY;

    const timeDelta = now - lastTapTime;
    const dx = x - lastTapX;
    const dy = y - lastTapY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (timeDelta < DOUBLE_TAP_TIME && distance < DOUBLE_TAP_RADIUS) {
      // Double-tap detected — reset scale to 1.0
      currentScale = DEFAULT_SCALE;
      _notifyScaleChange();
      // Reset tap state to prevent triple-tap triggering
      lastTapTime = 0;
      lastTapX = 0;
      lastTapY = 0;
    } else {
      // Record this tap for potential double-tap
      lastTapTime = now;
      lastTapX = x;
      lastTapY = y;
    }
  }

  // ---- Internal: Utilities ----

  /**
   * Calculates the Euclidean distance between two touch points.
   * Uses the Pythagorean theorem: sqrt((x2-x1)² + (y2-y1)²).
   * @param {TouchList} touches - List with at least 2 touch points.
   * @returns {number} Distance in pixels between the two touch points.
   */
  function _getFingerDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Notifies the registered callback of a scale change immediately.
   */
  function _notifyScaleChange() {
    lastNotifyTime = Date.now();
    if (scaleChangeCallback) {
      scaleChangeCallback(currentScale);
    }
  }

  /**
   * Throttled notification to maintain ~30fps+ update rate during gestures.
   * Ensures no more than one notification per THROTTLE_INTERVAL (33ms).
   */
  function _throttledNotify() {
    const now = Date.now();
    const elapsed = now - lastNotifyTime;

    if (elapsed >= THROTTLE_INTERVAL) {
      _notifyScaleChange();
    } else {
      // Schedule notification for remaining time
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          _notifyScaleChange();
        }, THROTTLE_INTERVAL - elapsed);
      }
    }
  }

  // Public API
  return {
    computeScale,
    clampScale,
    enablePinchZoom,
    disablePinchZoom,
    enableButtonZoom,
    disableButtonZoom,
    onScaleChange,
    getCurrentScale,
    getMinScale,
    getMaxScale,
    reset,
    // Expose constants for testing
    MIN_SCALE,
    MAX_SCALE,
    DEFAULT_SCALE,
    BUTTON_STEP,
    DOUBLE_TAP_TIME,
    DOUBLE_TAP_RADIUS
  };
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZoomController;
}
