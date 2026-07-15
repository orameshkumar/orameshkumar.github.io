/**
 * Utility functions for AR QR Code application.
 */

const Utils = (() => {
  /**
   * Truncates a name to maxLength characters, appending "…" if truncated.
   * @param {string} name - The name to truncate.
   * @param {number} maxLength - Maximum length before truncation (default 50).
   * @returns {string} The original or truncated name.
   */
  function truncateName(name, maxLength = 50) {
    if (typeof name !== 'string') return '';
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + '…';
  }

  /**
   * Builds an AR experience URL for a given asset ID.
   * @param {string} assetId - The animation asset identifier.
   * @returns {string} The full viewer URL with asset ID parameter.
   */
  function buildExperienceUrl(assetId) {
    // Use the current page's directory as base to support subdirectory deployment
    const currentPath = window.location.pathname;
    const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    const baseUrl = `${window.location.origin}${basePath}viewer.html`;
    const url = new URL(baseUrl);
    url.searchParams.set('id', assetId);
    return url.toString();
  }

  /**
   * Parses the asset ID from a URL's search parameters.
   * @param {string} url - The URL to parse.
   * @returns {string|null} The asset ID or null if not found.
   */
  function parseAssetId(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.searchParams.get('id') || null;
    } catch (e) {
      // Try to parse as relative URL
      try {
        const parsedUrl = new URL(url, window.location.origin);
        return parsedUrl.searchParams.get('id') || null;
      } catch (e2) {
        return null;
      }
    }
  }

  /**
   * Generates a simple UUID v4.
   * @returns {string} A UUID string.
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Debounce a function call.
   * @param {Function} fn - The function to debounce.
   * @param {number} delay - Delay in milliseconds.
   * @returns {Function} Debounced function.
   */
  function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  return {
    truncateName,
    buildExperienceUrl,
    parseAssetId,
    generateUUID,
    debounce
  };
})();

// Export for testing (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
