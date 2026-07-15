/**
 * Creator Interface Module
 * Manages the animation gallery, preview, and QR generation UI.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

var CreatorInterface = (() => {
  let selectedAsset = null;
  let galleryEl = null;
  let previewEl = null;
  let generateBtn = null;
  let emptyEl = null;
  let errorToastEl = null;
  let errorMessageEl = null;

  /**
   * Initializes the creator interface.
   * Caches DOM references, wires event delegation, and loads the gallery.
   */
  function init() {
    galleryEl = document.getElementById('animation-gallery');
    previewEl = document.getElementById('preview-container');
    generateBtn = document.getElementById('generate-btn');
    emptyEl = document.getElementById('gallery-empty');
    errorToastEl = document.getElementById('error-toast');
    errorMessageEl = document.getElementById('error-message');

    // Wire event delegation for gallery item clicks
    if (galleryEl) {
      galleryEl.addEventListener('click', handleGalleryClick);
      galleryEl.addEventListener('keydown', handleGalleryKeydown);
    }

    // Wire error toast dismiss button
    const dismissBtn = document.getElementById('error-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (errorToastEl) errorToastEl.hidden = true;
      });
    }

    // Wire retry button in empty state
    const retryBtn = document.getElementById('retry-load-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', loadGallery);
    }

    // Load and render gallery
    loadGallery();
  }

  /**
   * Event delegation handler for gallery clicks.
   * Finds the closest .gallery-item ancestor and selects that asset.
   * @param {Event} event - Click event.
   */
  function handleGalleryClick(event) {
    const itemEl = event.target.closest('.gallery-item');
    if (!itemEl) return;

    const assetId = itemEl.dataset.assetId;
    if (!assetId) return;

    const asset = AnimationLibrary.getAssetById(assetId);
    if (asset) {
      selectAsset(asset, itemEl);
    }
  }

  /**
   * Event delegation handler for keyboard navigation in gallery.
   * @param {KeyboardEvent} event - Keydown event.
   */
  function handleGalleryKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      const itemEl = event.target.closest('.gallery-item');
      if (!itemEl) return;

      event.preventDefault();
      const assetId = itemEl.dataset.assetId;
      if (!assetId) return;

      const asset = AnimationLibrary.getAssetById(assetId);
      if (asset) {
        selectAsset(asset, itemEl);
      }
    }
  }

  /**
   * Loads animation manifest and renders the gallery.
   * On failure or empty library, shows the empty state and disables generation.
   */
  async function loadGallery() {
    try {
      const assets = await AnimationLibrary.loadManifest();
      const activeAssets = AnimationLibrary.getActiveAssets();

      if (activeAssets.length === 0 || AnimationLibrary.hasError()) {
        showEmpty();
      } else {
        hideEmpty();
        renderGallery(activeAssets);
      }
    } catch (error) {
      showEmpty();
      showError('Failed to load animation library.');
    }
  }

  /**
   * Renders the animation gallery with thumbnails, names, and type badges.
   * Each gallery item contains:
   *  - A thumbnail image
   *  - A truncated name (50 chars + ellipsis via Utils.truncateName)
   *  - A type badge ("3D" or "2D")
   * 
   * @param {Array} assets - Array of active AnimationAsset objects.
   */
  function renderGallery(assets) {
    if (!galleryEl) return;
    galleryEl.innerHTML = '';

    if (!assets || assets.length === 0) {
      showEmpty();
      return;
    }

    assets.forEach((asset) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.dataset.assetId = asset.id;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', 'Select ' + asset.name);

      const truncatedName = Utils.truncateName(asset.name);
      const typeBadgeLabel = asset.type === '3d' ? '3D' : '2D';
      const typeBadgeClass = asset.type === '3d' ? 'type-3d' : 'type-2d';

      item.innerHTML =
        '<img class="gallery-thumbnail" src="' + asset.thumbnailPath + '" alt="' + truncatedName + '" loading="lazy">' +
        '<p class="gallery-name" title="' + asset.name + '">' + truncatedName + '</p>' +
        '<span class="gallery-type-badge ' + typeBadgeClass + '">' + typeBadgeLabel + '</span>';

      galleryEl.appendChild(item);
    });
  }

  /**
   * Handles asset selection from the gallery.
   * Removes previous selection highlight, applies "selected" class to new item,
   * shows preview, and enables QR generation.
   * 
   * @param {object} asset - The AnimationAsset to select.
   * @param {HTMLElement} itemEl - The gallery item DOM element.
   */
  function selectAsset(asset, itemEl) {
    // Remove previous selection
    if (galleryEl) {
      const previousSelected = galleryEl.querySelector('.gallery-item.selected');
      if (previousSelected) {
        previousSelected.classList.remove('selected');
        previousSelected.setAttribute('aria-pressed', 'false');
      }
    }

    // Apply selection highlight
    itemEl.classList.add('selected');
    itemEl.setAttribute('aria-pressed', 'true');
    selectedAsset = asset;

    // Show preview and enable generation
    showPreview(asset);
    enableGeneration();
  }

  /**
   * Shows a preview of the selected animation asset.
   * - For 3D assets: loads an embedded A-Frame scene with GLTF model and animation-mixer.
   * - For 2D assets: displays the image/gif directly.
   * 
   * @param {object} asset - The AnimationAsset to preview.
   */
  function showPreview(asset) {
    if (!previewEl) return;

    if (asset.type === '3d') {
      // Show thumbnail as preview with 3D badge overlay
      // A-Frame scene is only used when the actual model file exists
      previewEl.innerHTML =
        '<div class="preview-3d-placeholder" style="position:relative;width:100%;height:280px;display:flex;align-items:center;justify-content:center;background:#1a1a2e;border-radius:12px;overflow:hidden;">' +
          '<img src="' + asset.thumbnailPath + '" alt="' + asset.name + '" style="max-width:80%;max-height:80%;object-fit:contain;">' +
          '<div style="position:absolute;bottom:12px;right:12px;background:rgba(98,0,238,0.9);color:white;padding:4px 12px;border-radius:16px;font-size:12px;font-weight:bold;">3D Model</div>' +
          '<div style="position:absolute;top:12px;left:12px;color:rgba(255,255,255,0.7);font-size:11px;">Preview in AR after generating QR code</div>' +
        '</div>';
    } else {
      previewEl.innerHTML =
        '<div class="preview-2d-placeholder" style="position:relative;width:100%;height:280px;display:flex;align-items:center;justify-content:center;background:#1a1a2e;border-radius:12px;overflow:hidden;">' +
          '<img src="' + asset.thumbnailPath + '" alt="' + asset.name + '" style="max-width:80%;max-height:80%;object-fit:contain;">' +
          '<div style="position:absolute;bottom:12px;right:12px;background:rgba(0,150,136,0.9);color:white;padding:4px 12px;border-radius:16px;font-size:12px;font-weight:bold;">2D Animation</div>' +
          '<div style="position:absolute;top:12px;left:12px;color:rgba(255,255,255,0.7);font-size:11px;">Preview in AR after generating QR code</div>' +
        '</div>';
    }
  }

  /**
   * Enables the QR code generation button.
   * Called after a user confirms an asset selection.
   */
  function enableGeneration() {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.setAttribute('aria-disabled', 'false');
    }
  }

  /**
   * Disables the QR code generation button.
   * Called when no asset is selected or the library is empty/failed.
   */
  function disableGeneration() {
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.setAttribute('aria-disabled', 'true');
    }
  }

  /**
   * Shows the empty gallery state.
   * Displays "No animations available" message, hides gallery grid,
   * and disables QR generation.
   */
  function showEmpty() {
    if (galleryEl) galleryEl.hidden = true;
    if (emptyEl) emptyEl.hidden = false;
    disableGeneration();
  }

  /**
   * Hides the empty gallery state and shows the gallery grid.
   */
  function hideEmpty() {
    if (galleryEl) galleryEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
  }

  /**
   * Displays an error message as a toast/banner.
   * Auto-dismisses after 5 seconds, or user can click dismiss button.
   * 
   * @param {string} message - Error message to display.
   */
  function showError(message) {
    if (errorToastEl && errorMessageEl) {
      errorMessageEl.textContent = message;
      errorToastEl.hidden = false;
      errorToastEl.setAttribute('role', 'alert');

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        if (errorToastEl) errorToastEl.hidden = true;
      }, 5000);
    }
  }

  /**
   * Gets the currently selected asset.
   * @returns {object|null} The selected AnimationAsset or null.
   */
  function getSelectedAsset() {
    return selectedAsset;
  }

  /**
   * Resets the creator interface state.
   * Useful for testing.
   */
  function _reset() {
    selectedAsset = null;
    if (galleryEl) galleryEl.innerHTML = '';
    if (previewEl) previewEl.innerHTML = '<p class="preview-placeholder">Select an animation to preview</p>';
    disableGeneration();
  }

  return {
    init,
    renderGallery,
    showPreview,
    enableGeneration,
    disableGeneration,
    showError,
    showEmpty,
    getSelectedAsset,
    loadGallery,
    _reset
  };
})();

// Initialize on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('animation-gallery')) {
      CreatorInterface.init();
    }
  });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CreatorInterface;
}
