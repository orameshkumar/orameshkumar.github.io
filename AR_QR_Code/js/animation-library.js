/**
 * Animation Library Module
 * Manages loading, filtering, and validation of animation assets.
 * 
 * Requirements: 1.1, 1.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

var AnimationLibrary = (() => {
  let manifest = null;
  let assets = [];
  let loadError = null;

  const SUPPORTED_FORMATS = ['gltf', 'glb', 'gif', 'apng', 'webp'];
  const MAX_FILE_SIZE = 5242880; // 5MB in bytes

  /**
   * Loads the animation manifest from the server.
   * Fetches assets/animations.json and returns the array of AnimationAsset objects.
   * On failure, returns an empty array and sets an internal error state.
   * @returns {Promise<Array>} Array of AnimationAsset objects.
   */
  async function loadManifest() {
    try {
      const response = await fetch('assets/animations.json');
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.status}`);
      }
      manifest = await response.json();
      assets = manifest.assets || [];
      loadError = null;
      return assets;
    } catch (error) {
      loadError = error.message || 'Unknown error loading manifest';
      assets = [];
      manifest = null;
      console.error('AnimationLibrary: Failed to load manifest', error);
      return [];
    }
  }

  /**
   * Gets an asset by its unique ID.
   * Works for both active and inactive assets — the viewer needs this
   * to resolve deactivated assets that have existing QR codes.
   * @param {string} id - The asset identifier.
   * @returns {object|null} The asset object or null if not found.
   */
  function getAssetById(id) {
    return assets.find((asset) => asset.id === id) || null;
  }

  /**
   * Gets assets filtered by type.
   * @param {string} type - '3d' or '2d'.
   * @returns {Array} Filtered assets matching the given type.
   */
  function getAssetsByType(type) {
    return assets.filter((asset) => asset.type === type);
  }

  /**
   * Gets only active assets (available for new QR generation).
   * Inactive/deactivated assets are excluded from the gallery
   * but remain accessible via getAssetById for existing QR codes.
   * @returns {Array} Active assets where active === true.
   */
  function getActiveAssets() {
    return assets.filter((asset) => asset.active === true);
  }

  /**
   * Validates a file/asset against format and size constraints.
   * Checks:
   *  - name is present
   *  - thumbnailPath is present
   *  - format is in supported set {gltf, glb, gif, apng, webp}
   *  - fileSize does not exceed 5,242,880 bytes (5MB)
   * 
   * @param {object} file - Object with properties: name, format, fileSize, thumbnailPath
   * @returns {object} Validation result: { valid: true } or { valid: false, error: string }
   */
  function validateAsset(file) {
    if (!file || typeof file !== 'object') {
      return { valid: false, error: 'invalid input' };
    }

    if (!file.name || (typeof file.name === 'string' && file.name.trim() === '')) {
      return { valid: false, error: 'missing name' };
    }

    if (!file.thumbnailPath || (typeof file.thumbnailPath === 'string' && file.thumbnailPath.trim() === '')) {
      return { valid: false, error: 'missing thumbnail' };
    }

    const format = (file.format || '').toLowerCase();
    if (!SUPPORTED_FORMATS.includes(format)) {
      return { valid: false, error: 'unsupported format' };
    }

    const fileSize = typeof file.fileSize === 'number' ? file.fileSize : NaN;
    if (isNaN(fileSize) || fileSize > MAX_FILE_SIZE) {
      return { valid: false, error: 'file size exceeded' };
    }

    return { valid: true };
  }

  /**
   * Returns the current load error message if any.
   * @returns {string|null} Error message or null if no error.
   */
  function getLoadError() {
    return loadError;
  }

  /**
   * Returns whether the library is in an error state.
   * @returns {boolean} True if the last load attempt failed.
   */
  function hasError() {
    return loadError !== null;
  }

  /**
   * Allows manually setting assets (useful for testing or pre-loading).
   * @param {Array} assetList - Array of AnimationAsset objects.
   */
  function _setAssets(assetList) {
    assets = assetList || [];
  }

  /**
   * Resets the library state (useful for testing).
   */
  function _reset() {
    manifest = null;
    assets = [];
    loadError = null;
  }

  return {
    loadManifest,
    getAssetById,
    getAssetsByType,
    getActiveAssets,
    validateAsset,
    getLoadError,
    hasError,
    _setAssets,
    _reset,
    SUPPORTED_FORMATS,
    MAX_FILE_SIZE
  };
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnimationLibrary;
}
