/**
 * Marker Loss Handler Module
 * Implements a state machine for graceful marker loss handling.
 * States: TRACKING → PERSISTING → FADING → LOST
 */

const MarkerLossHandler = (() => {
  const PERSIST_DURATION = 3000; // 3 seconds
  const FADE_OUT_DURATION = 1000; // 1 second

  let state = 'LOST';
  let lastPosition = { x: 0, y: 0, z: 0 };
  let lastOrientation = { x: 0, y: 0, z: 0, w: 1 };
  let lastScale = 1.0;
  let lostTimestamp = null;
  let persistTimer = null;
  let fadeTimer = null;
  let onFadeCompleteCallback = null;
  let onRestoreCallback = null;

  /**
   * Called when the marker is detected (found or re-found).
   * @param {object} position - New marker position.
   * @param {object} orientation - New marker orientation.
   * @param {number} scale - Current scale.
   */
  function onMarkerFound(position, orientation, scale) {
    clearTimers();

    const previousState = state;
    state = 'TRACKING';
    lastPosition = { ...position };
    lastOrientation = { ...orientation };
    lastScale = scale !== undefined ? scale : lastScale;
    lostTimestamp = null;

    if (previousState === 'PERSISTING' || previousState === 'FADING') {
      if (onRestoreCallback) {
        onRestoreCallback({
          position: { ...lastPosition },
          orientation: { ...lastOrientation },
          scale: lastScale,
          opacity: 1.0
        });
      }
    }
  }

  /**
   * Called when the marker is lost from view.
   */
  function onMarkerLost() {
    if (state !== 'TRACKING') return;

    state = 'PERSISTING';
    lostTimestamp = Date.now();

    // Start 3-second persist timer
    persistTimer = setTimeout(() => {
      if (state === 'PERSISTING') {
        state = 'FADING';
        startFade();
      }
    }, PERSIST_DURATION);
  }

  /**
   * Starts the fade-out animation.
   */
  function startFade() {
    fadeTimer = setTimeout(() => {
      if (state === 'FADING') {
        state = 'LOST';
        if (onFadeCompleteCallback) {
          onFadeCompleteCallback();
        }
      }
    }, FADE_OUT_DURATION);
  }

  /**
   * Computes opacity based on elapsed time during FADING state.
   * Linear decrease from 1.0 to 0.0 over fadeOutDuration.
   * @param {number} elapsedTime - Time elapsed since fade started (ms).
   * @returns {number} Opacity value between 0.0 and 1.0.
   */
  function computeOpacity(elapsedTime) {
    if (elapsedTime <= 0) return 1.0;
    if (elapsedTime >= FADE_OUT_DURATION) return 0.0;
    return 1.0 - (elapsedTime / FADE_OUT_DURATION);
  }

  /**
   * Registers callback for when fade completes (asset fully invisible).
   * @param {Function} callback
   */
  function onFadeComplete(callback) {
    onFadeCompleteCallback = callback;
  }

  /**
   * Registers callback for when marker is restored during persist/fade.
   * @param {Function} callback
   */
  function onRestore(callback) {
    onRestoreCallback = callback;
  }

  /**
   * Gets the current state.
   * @returns {string} Current tracking state.
   */
  function getState() {
    return state;
  }

  /**
   * Gets the current marker state snapshot.
   * @returns {object} MarkerState object.
   */
  function getMarkerState() {
    return {
      state,
      lastPosition: { ...lastPosition },
      lastOrientation: { ...lastOrientation },
      lastScale,
      lostTimestamp
    };
  }

  /**
   * Gets the persist duration constant.
   * @returns {number} Duration in ms.
   */
  function getPersistDuration() {
    return PERSIST_DURATION;
  }

  /**
   * Gets the fade-out duration constant.
   * @returns {number} Duration in ms.
   */
  function getFadeOutDuration() {
    return FADE_OUT_DURATION;
  }

  /**
   * Clears all active timers.
   */
  function clearTimers() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  /**
   * Resets state (for testing or re-initialization).
   */
  function reset() {
    clearTimers();
    state = 'LOST';
    lastPosition = { x: 0, y: 0, z: 0 };
    lastOrientation = { x: 0, y: 0, z: 0, w: 1 };
    lastScale = 1.0;
    lostTimestamp = null;
  }

  return {
    onMarkerFound,
    onMarkerLost,
    computeOpacity,
    onFadeComplete,
    onRestore,
    getState,
    getMarkerState,
    getPersistDuration,
    getFadeOutDuration,
    reset
  };
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkerLossHandler;
}
