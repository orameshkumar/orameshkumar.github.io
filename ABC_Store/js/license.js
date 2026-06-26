/**
 * license.js - License Module for ABC Store
 *
 * HMAC-SHA256 license key validation using Web Crypto API.
 * Stores license in localStorage under 'abc_license_key'.
 * Provides state management and change notifications for other modules.
 */

const License = (function () {
  'use strict';

  var LS_KEY = 'abc_license_key';

  // Cached state
  var _licensed = false;
  var _licenseeName = '';

  // State change listeners
  var _listeners = [];

  // Obfuscated shared secret (ABC_LIC_2025_$t0r3_K3y!)
  var _SECRET = [65,66,67,95,76,73,67,95,50,48,50,53,95,36,116,48,114,51,95,75,51,121,33];

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

      // Must have "n" and "h" properties
      if (!obj || typeof obj.n !== 'string' || typeof obj.h !== 'string') {
        return null;
      }

      // "n" must not be empty or whitespace-only
      if (!obj.n.trim()) {
        return null;
      }

      // Compute HMAC and compare (case-insensitive)
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

  /**
   * Notify all registered listeners of a state change.
   */
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
   * Clears invalid keys.
   * @returns {Promise<void>}
   */
  async function init() {
    var stored = null;
    try {
      stored = localStorage.getItem(LS_KEY);
    } catch (e) {
      // localStorage unavailable — default to unlicensed
    }

    if (stored) {
      var name = await _validate(stored);
      if (name) {
        _licensed = true;
        _licenseeName = name;
      } else {
        // Invalid or tampered key — remove it
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
   * Decodes base64, parses JSON, validates "n" and "h", computes HMAC,
   * stores in localStorage on success.
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
      // Store in localStorage
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
   * Removes key from localStorage and sets state to unlicensed.
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
   * @returns {string} Licensee name or empty string if unlicensed
   */
  function getLicenseeName() {
    return _licenseeName;
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

  // ─── Expose Public API ────────────────────────────────────────────────────────

  return {
    init: init,
    activate: activate,
    deactivate: deactivate,
    isLicensed: isLicensed,
    getLicenseeName: getLicenseeName,
    onStateChange: onStateChange
  };

})();
