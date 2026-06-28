/**
 * license.js - License Module for Pay Your Shuttle
 *
 * HMAC-SHA256 license key validation using Web Crypto API.
 * Stores license in localStorage under 'pys_license_key'.
 * Enforces restrictions when unlicensed:
 *   - Maximum 20 members
 *   - Monthly fee cannot exceed ₹1000
 */

const License = (function () {
  'use strict';

  var LS_KEY = 'pys_license_key';

  // Restrictions for unlicensed usage
  var MAX_MEMBERS_UNLICENSED = 20;
  var MAX_MONTHLY_FEE_UNLICENSED = 1000;

  // Cached state
  var _licensed = false;
  var _licenseeName = '';

  // State change listeners
  var _listeners = [];

  // Obfuscated shared secret (PayYourShuttle)
  var _SECRET = [80,97,121,89,111,117,114,83,104,117,116,116,108,101];

  /**
   * Decode the secret character code array to string.
   * @returns {string} The HMAC secret key
   */
  function _getSecret() {
    return _SECRET.map(function (c) { return String.fromCharCode(c); }).join('');
  }

  // ─── HMAC-SHA256 via Web Crypto API ───────────────────────────────────────────

  /**
   * Compute HMAC-SHA256 of a message using the app secret.
   * @param {string} message - The message to sign
   * @returns {Promise<string>} Lowercase hex string of the HMAC
   */
  async function _hmacHex(message) {
    var secret = _getSecret();
    var enc = new TextEncoder();
    var keyData = enc.encode(secret);
    var msgData = enc.encode(message);

    var cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    var sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    var bytes = new Uint8Array(sig);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += ('0' + bytes[i].toString(16)).slice(-2);
    }
    return hex;
  }

  // ─── Internal Validation ──────────────────────────────────────────────────────

  /**
   * Validate a license key string.
   * @param {string} keyStr - Base64-encoded license key
   * @returns {Promise<string|null>} Licensee name if valid, null otherwise
   */
  async function _validate(keyStr) {
    try {
      var json = atob(keyStr);
      var obj = JSON.parse(json);

      if (!obj || typeof obj.n !== 'string' || typeof obj.h !== 'string') {
        return null;
      }

      if (!obj.n.trim()) {
        return null;
      }

      var computed = await _hmacHex(obj.n);
      if (computed.toLowerCase() === obj.h.toLowerCase()) {
        return obj.n;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // ─── State Change Notification ────────────────────────────────────────────────

  function _notifyListeners() {
    for (var i = 0; i < _listeners.length; i++) {
      try {
        _listeners[i](_licensed, _licenseeName);
      } catch (e) {
        console.error('License: listener error', e);
      }
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Initialize the License module.
   * Reads stored key from localStorage, re-validates, sets internal state.
   * @returns {Promise<void>}
   */
  async function init() {
    var stored = null;
    try {
      stored = localStorage.getItem(LS_KEY);
    } catch (e) {}

    if (stored) {
      var name = await _validate(stored);
      if (name) {
        _licensed = true;
        _licenseeName = name;
      } else {
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        _licensed = false;
        _licenseeName = '';
      }
    } else {
      _licensed = false;
      _licenseeName = '';
    }

    _notifyListeners();
  }

  /**
   * Activate a license key.
   * @param {string} keyString - The license key string to activate
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async function activate(keyString) {
    if (!keyString || !keyString.trim()) {
      return { success: false, message: 'Please enter a license key.' };
    }

    keyString = keyString.trim();

    var name = await _validate(keyString);
    if (name) {
      try {
        localStorage.setItem(LS_KEY, keyString);
      } catch (e) {
        return { success: false, message: 'Failed to store license key. Storage may be unavailable.' };
      }

      _licensed = true;
      _licenseeName = name;
      _notifyListeners();
      return { success: true, message: 'License activated for: ' + name };
    }

    return { success: false, message: 'Invalid license key. Please check and try again.' };
  }

  /**
   * Deactivate the current license.
   */
  function deactivate() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    _licensed = false;
    _licenseeName = '';
    _notifyListeners();
  }

  /**
   * Check if the application is currently licensed.
   * @returns {boolean}
   */
  function isLicensed() {
    return _licensed;
  }

  /**
   * Get the current licensee name.
   * @returns {string}
   */
  function getLicenseeName() {
    return _licenseeName;
  }

  /**
   * Get the maximum allowed members for unlicensed usage.
   * @returns {number}
   */
  function getMaxMembers() {
    return MAX_MEMBERS_UNLICENSED;
  }

  /**
   * Get the maximum allowed monthly fee for unlicensed usage.
   * @returns {number}
   */
  function getMaxMonthlyFee() {
    return MAX_MONTHLY_FEE_UNLICENSED;
  }

  /**
   * Check if adding a new member is allowed (unlicensed: max 20).
   * @param {number} currentCount - Current number of members
   * @returns {boolean}
   */
  function canAddMember(currentCount) {
    if (_licensed) return true;
    return currentCount < MAX_MEMBERS_UNLICENSED;
  }

  /**
   * Check if a monthly fee amount is allowed (unlicensed: max ₹1000).
   * @param {number} fee - The fee amount to validate
   * @returns {boolean}
   */
  function canSetMonthlyFee(fee) {
    if (_licensed) return true;
    return fee <= MAX_MONTHLY_FEE_UNLICENSED;
  }

  /**
   * Register a callback to be invoked on license state changes.
   * Callback receives (isLicensed: boolean, licenseeName: string).
   * @param {Function} callback
   */
  function onStateChange(callback) {
    if (typeof callback === 'function') {
      _listeners.push(callback);
    }
  }

  return {
    init: init,
    activate: activate,
    deactivate: deactivate,
    isLicensed: isLicensed,
    getLicenseeName: getLicenseeName,
    getMaxMembers: getMaxMembers,
    getMaxMonthlyFee: getMaxMonthlyFee,
    canAddMember: canAddMember,
    canSetMonthlyFee: canSetMonthlyFee,
    onStateChange: onStateChange
  };

})();
