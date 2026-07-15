/**
 * Zoom Controller Module
 * Handles pinch-to-zoom gestures and button-based zoom for AR assets.
 */

const ZoomController = (() => {
  let currentScale = 1.0;
  let initialDistance = 0;
  let scaleChangeCallback = null;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;

  /**
   * Computes the scale factor from finger distances.
   * Scale = current distance / initial distance.
   * @param {number} initialDist - Initial finger distance (D₀).
   * @param {number} currentDist - Current finger distance (D₁).
   * @returns {number} Scale factor ratio.
   */
  function computeScale(initialDist, currentDist) {
    if (initialDist <= 0) return 1.0;
    return currentDist / initialDist;
  }

  /**
   * Clamps a scale value to the valid range [0.5, 3.0].
   * @param {number} value - Raw scale value.
   * @returns {number} Clamped scale value.
   */
  function clampScale(value) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
  }

  /**
   * Enables pinch-to-zoom touch gesture handling.
   */
  function enablePinchZoom() {
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }

  /**
   * Enables on-screen zoom buttons for non-multi-touch devices.
   */
  function enableButtonZoom() {
    const zoomControls = document.getElementById('zoom-controls');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');

    if (zoomControls) zoomControls.hidden = false;

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        currentScale = clampScale(currentScale + 0.25);
        notifyScaleChange();
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        currentScale = clampScale(currentScale - 0.25);
        notifyScaleChange();
      });
    }
  }

  /**
   * Handles double-tap to reset zoom.
   */
  let lastTap = 0;
  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTap < 300) {
      currentScale = 1.0;
      notifyScaleChange();
    }
    lastTap = now;
  }

  /**
   * Registers callback for scale changes.
   * @param {Function} callback - Called with new scale value.
   */
  function onScaleChange(callback) {
    scaleChangeCallback = callback;
  }

  // --- Touch event handlers ---

  function handleTouchStart(event) {
    if (event.touches.length === 2) {
      event.preventDefault();
      initialDistance = getFingerDistance(event.touches);
    } else if (event.touches.length === 1) {
      handleDoubleTap();
    }
  }

  function handleTouchMove(event) {
    if (event.touches.length === 2 && initialDistance > 0) {
      event.preventDefault();
      const currentDistance = getFingerDistance(event.touches);
      const rawScale = computeScale(initialDistance, currentDistance);
      currentScale = clampScale(rawScale);
      notifyScaleChange();
    }
  }

  function handleTouchEnd(event) {
    if (event.touches.length < 2) {
      initialDistance = 0;
    }
  }

  /**
   * Calculates distance between two touch points.
   */
  function getFingerDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  /**
   * Notifies the registered callback of a scale change.
   */
  function notifyScaleChange() {
    if (scaleChangeCallback) {
      scaleChangeCallback(currentScale);
    }
  }

  /**
   * Gets the current scale.
   * @returns {number}
   */
  function getCurrentScale() {
    return currentScale;
  }

  /**
   * Gets min scale constant.
   * @returns {number}
   */
  function getMinScale() {
    return MIN_SCALE;
  }

  /**
   * Gets max scale constant.
   * @returns {number}
   */
  function getMaxScale() {
    return MAX_SCALE;
  }

  return {
    computeScale,
    clampScale,
    enablePinchZoom,
    enableButtonZoom,
    onScaleChange,
    getCurrentScale,
    getMinScale,
    getMaxScale
  };
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZoomController;
}
