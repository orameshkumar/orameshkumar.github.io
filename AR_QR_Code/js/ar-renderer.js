/**
 * AR Renderer Module
 * Places and updates animation assets relative to marker position using A-Frame.
 * Supports GLTF/GLB models (up to 50K polygons) and 2D animated images (up to 4096x4096).
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

const ARRenderer = (() => {
  // Constants
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;
  const DEFAULT_SCALE = 1.0;
  const MAX_POLYGONS_3D = 50000;
  const MAX_IMAGE_DIMENSION = 4096;

  // State
  let currentEntity = null;
  let currentScale = DEFAULT_SCALE;
  let currentPosition = { x: 0, y: 0, z: 0 };
  let currentOrientation = { x: 0, y: 0, z: 0, w: 1 };
  let animationPlaying = false;
  let currentAsset = null;
  let markerEl = null;
  let sceneEl = null;
  let errorOverlayVisible = false;

  /**
   * Initializes the renderer with references to the A-Frame scene and marker.
   * @param {HTMLElement} scene - The A-Frame scene element.
   * @param {HTMLElement} marker - The a-marker element.
   */
  function init(scene, marker) {
    sceneEl = scene;
    markerEl = marker;
  }

  /**
   * Loads an AnimationAsset and configures the entity accordingly.
   * For 3D assets: creates <a-entity gltf-model="url(...)"> with animation-mixer.
   * For 2D assets: creates <a-image src="..."> on a plane at the marker position.
   * @param {object} asset - AnimationAsset object with id, name, type, format, filePath, metadata.
   * @returns {boolean} True if asset loaded successfully, false otherwise.
   */
  function loadAsset(asset) {
    if (!asset || !asset.filePath) {
      showLoadError();
      return false;
    }

    currentAsset = asset;

    // Remove existing entity if present
    if (currentEntity && currentEntity.parentNode) {
      currentEntity.parentNode.removeChild(currentEntity);
    }

    try {
      if (asset.type === '3d') {
        currentEntity = _create3DEntity(asset);
      } else if (asset.type === '2d') {
        currentEntity = _create2DEntity(asset);
      } else {
        showLoadError();
        return false;
      }

      // Attach entity to marker or scene
      const parent = markerEl || sceneEl;
      if (parent && currentEntity) {
        parent.appendChild(currentEntity);
      }

      // Set initial transforms
      _applyPosition(currentPosition);
      _applyOrientation(currentOrientation);
      _applyScale(currentScale);

      // Listen for model load errors
      if (currentEntity) {
        currentEntity.addEventListener('model-error', (evt) => {
          const src = asset.filePath || 'unknown';
          console.error('ARRenderer: model-error for', src, evt && evt.detail);
          showLoadError();
        });
        currentEntity.addEventListener('model-loaded', () => {
          console.log('ARRenderer: model loaded successfully for', asset.filePath);
        });
      }

      return true;
    } catch (error) {
      console.error('ARRenderer: Error loading asset', error);
      showLoadError();
      return false;
    }
  }

  /**
   * Creates an A-Frame entity for a 3D GLTF/GLB model.
   * @param {object} asset - The 3D animation asset.
   * @returns {HTMLElement} The created A-Frame entity element.
   */
  function _create3DEntity(asset) {
    const el = document.createElement('a-entity');
    el.setAttribute('gltf-model', `url(${asset.filePath})`);
    el.setAttribute('class', 'ar-animation-entity');
    el.setAttribute('visible', 'true');
    return el;
  }

  /**
   * Creates an A-Frame image entity for a 2D animated asset.
   * @param {object} asset - The 2D animation asset.
   * @returns {HTMLElement} The created A-Frame image element.
   */
  function _create2DEntity(asset) {
    const el = document.createElement('a-image');
    el.setAttribute('src', asset.filePath);
    el.setAttribute('class', 'ar-animation-entity');
    el.setAttribute('visible', 'true');
    el.setAttribute('material', 'opacity: 1.0; transparent: true');

    // Set dimensions based on metadata if available
    if (asset.metadata && asset.metadata.dimensions) {
      const { width, height } = asset.metadata.dimensions;
      // Normalize to reasonable AR scale (1 unit = ~1 meter in A-Frame)
      const maxDim = Math.max(width, height);
      const normalizedWidth = width / maxDim;
      const normalizedHeight = height / maxDim;
      el.setAttribute('width', normalizedWidth.toString());
      el.setAttribute('height', normalizedHeight.toString());
    } else {
      el.setAttribute('width', '1');
      el.setAttribute('height', '1');
    }

    return el;
  }

  /**
   * Places an animation asset at the detected marker position.
   * @param {object} position - { x, y, z } position.
   * @param {object} orientation - { x, y, z, w } quaternion.
   */
  function placeAsset(position, orientation) {
    currentPosition = { ...position };
    currentOrientation = { ...orientation };
    _applyPosition(currentPosition);
    _applyOrientation(currentOrientation);
  }

  /**
   * Updates asset position each frame (30fps+).
   * @param {object} position - Updated position.
   * @param {object} orientation - Updated orientation.
   */
  function updatePosition(position, orientation) {
    currentPosition = { ...position };
    currentOrientation = { ...orientation };
    _applyPosition(currentPosition);
    _applyOrientation(currentOrientation);
  }

  /**
   * Sets the asset scale. Position is NOT changed (Property 7: Zoom preserves anchor position).
   * Scale is clamped between MIN_SCALE (0.5) and MAX_SCALE (3.0).
   * @param {number} factor - Scale factor (0.5 to 3.0).
   */
  function setScale(factor) {
    // Clamp scale to valid range
    const clampedFactor = Math.max(MIN_SCALE, Math.min(MAX_SCALE, factor));
    currentScale = clampedFactor;
    _applyScale(clampedFactor);
  }

  /**
   * Resets scale to 1.0 (original size).
   */
  function resetScale() {
    setScale(DEFAULT_SCALE);
  }

  /**
   * Applies a scale factor to the asset, preserving position.
   * This is a pure function for property testing.
   * @param {object} state - { position, scale }
   * @returns {object} Updated state with new scale, same position.
   */
  function applyScale(state) {
    return {
      position: { ...state.position },
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale))
    };
  }

  /**
   * Starts animation playback in a continuous loop.
   * For 3D models: sets animation-mixer with loop:repeat.
   * For 2D assets: the browser handles GIF/APNG/WebP animation natively.
   */
  function startAnimation() {
    animationPlaying = true;
    if (currentEntity) {
      if (currentAsset && currentAsset.type === '3d') {
        currentEntity.setAttribute('animation-mixer', 'clip: *; loop: repeat; clampWhenFinished: false');
      }
      // 2D animated images (GIF, APNG, WebP) loop natively in the browser
    }
  }

  /**
   * Stops animation playback.
   */
  function stopAnimation() {
    animationPlaying = false;
    if (currentEntity && currentAsset && currentAsset.type === '3d') {
      currentEntity.removeAttribute('animation-mixer');
    }
  }

  /**
   * Fades out the asset over a given duration.
   * Animates opacity from 1.0 to 0.0 over the given duration (ms).
   * @param {number} duration - Fade duration in milliseconds.
   */
  function fadeOut(duration) {
    if (currentEntity) {
      // Remove any existing opacity animation first
      currentEntity.removeAttribute('animation__opacity');
      currentEntity.setAttribute('animation__opacity', {
        property: 'material.opacity',
        from: 1.0,
        to: 0.0,
        dur: duration,
        easing: 'linear'
      });
    }
  }

  /**
   * Restores asset to full opacity immediately.
   * Sets opacity to 1.0 without animation.
   */
  function fadeIn() {
    if (currentEntity) {
      // Remove any active fade animation
      currentEntity.removeAttribute('animation__opacity');
      // Immediately set full opacity
      currentEntity.setAttribute('material', 'opacity', 1.0);
    }
  }

  /**
   * Shows an error when asset fails to load.
   * Displays an overlay message "Could not load animation" with a retry button.
   */
  function showLoadError() {
    errorOverlayVisible = true;
    console.error('ARRenderer: Failed to load animation asset');

    // Try to display the error overlay in the viewer HTML
    const errorOverlay = document.getElementById('error-overlay');
    const errorTitle = document.getElementById('error-title');
    const errorDescription = document.getElementById('error-description');
    const retryBtn = document.getElementById('error-retry-btn');

    if (errorOverlay) {
      errorOverlay.hidden = false;
      if (errorTitle) {
        errorTitle.textContent = 'Could not load animation';
      }
      if (errorDescription) {
        errorDescription.textContent = 'The animation asset could not be loaded. Please check your connection and try again.';
      }
      if (retryBtn) {
        retryBtn.hidden = false;
        retryBtn.onclick = () => {
          hideLoadError();
          if (currentAsset) {
            loadAsset(currentAsset);
          }
        };
      }
    }
  }

  /**
   * Hides the load error overlay.
   */
  function hideLoadError() {
    errorOverlayVisible = false;
    const errorOverlay = document.getElementById('error-overlay');
    if (errorOverlay) {
      errorOverlay.hidden = true;
    }
  }

  /**
   * Returns whether the error overlay is visible.
   * @returns {boolean}
   */
  function isErrorVisible() {
    return errorOverlayVisible;
  }

  /**
   * Gets current position.
   * @returns {object} Current position { x, y, z }.
   */
  function getPosition() {
    return { ...currentPosition };
  }

  /**
   * Gets current scale.
   * @returns {number} Current scale factor.
   */
  function getScale() {
    return currentScale;
  }

  /**
   * Gets current orientation.
   * @returns {object} Current orientation { x, y, z, w }.
   */
  function getOrientation() {
    return { ...currentOrientation };
  }

  /**
   * Returns whether animation is currently playing.
   * @returns {boolean}
   */
  function isAnimationPlaying() {
    return animationPlaying;
  }

  /**
   * Gets the current entity element.
   * @returns {HTMLElement|null}
   */
  function getEntity() {
    return currentEntity;
  }

  /**
   * Sets the A-Frame entity reference directly (for testing or external control).
   * @param {HTMLElement} entity - A-Frame entity element.
   */
  function setEntity(entity) {
    currentEntity = entity;
  }

  /**
   * Removes the current entity from the scene and resets state.
   */
  function dispose() {
    if (currentEntity && currentEntity.parentNode) {
      currentEntity.parentNode.removeChild(currentEntity);
    }
    currentEntity = null;
    currentAsset = null;
    currentScale = DEFAULT_SCALE;
    currentPosition = { x: 0, y: 0, z: 0 };
    currentOrientation = { x: 0, y: 0, z: 0, w: 1 };
    animationPlaying = false;
    errorOverlayVisible = false;
  }

  // ---- Internal helpers ----

  /**
   * Applies position to the current entity.
   * @param {object} pos - { x, y, z }
   */
  function _applyPosition(pos) {
    if (currentEntity) {
      currentEntity.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
    }
  }

  /**
   * Applies orientation (quaternion) to the current entity.
   * A-Frame uses Euler angles (degrees), so we convert quaternion to Euler.
   * @param {object} quat - { x, y, z, w }
   */
  function _applyOrientation(quat) {
    if (currentEntity) {
      // Convert quaternion to Euler angles (in degrees)
      const euler = _quaternionToEuler(quat);
      currentEntity.setAttribute('rotation', `${euler.x} ${euler.y} ${euler.z}`);
    }
  }

  /**
   * Applies scale to the current entity.
   * @param {number} factor - Scale factor.
   */
  function _applyScale(factor) {
    if (currentEntity) {
      currentEntity.setAttribute('scale', `${factor} ${factor} ${factor}`);
    }
  }

  /**
   * Converts quaternion { x, y, z, w } to Euler angles { x, y, z } in degrees.
   * Uses standard aerospace rotation sequence (XYZ).
   * @param {object} q - Quaternion { x, y, z, w }.
   * @returns {object} Euler angles in degrees { x, y, z }.
   */
  function _quaternionToEuler(q) {
    const { x, y, z, w } = q;

    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch;
    if (Math.abs(sinp) >= 1) {
      pitch = Math.sign(sinp) * (Math.PI / 2); // Gimbal lock
    } else {
      pitch = Math.asin(sinp);
    }

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    // Convert radians to degrees
    const toDeg = 180 / Math.PI;
    return {
      x: roll * toDeg,
      y: pitch * toDeg,
      z: yaw * toDeg
    };
  }

  return {
    init,
    loadAsset,
    placeAsset,
    updatePosition,
    setScale,
    resetScale,
    applyScale,
    startAnimation,
    stopAnimation,
    fadeOut,
    fadeIn,
    showLoadError,
    hideLoadError,
    isErrorVisible,
    getPosition,
    getScale,
    getOrientation,
    isAnimationPlaying,
    getEntity,
    setEntity,
    dispose,
    // Expose constants for testing
    MIN_SCALE,
    MAX_SCALE,
    DEFAULT_SCALE,
    MAX_POLYGONS_3D,
    MAX_IMAGE_DIMENSION
  };
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ARRenderer;
}
