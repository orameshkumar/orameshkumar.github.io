/**
 * license.js - License Module for BuildCalc
 *
 * HMAC-SHA256 license key validation using Web Crypto API.
 * Stores license in localStorage under 'buildcalc_license_key'.
 * Free tier limits: 2 clients, 2 projects per client.
 *
 * Dependencies: none (standalone module)
 */
'use strict';

const License = (function () {
  var LS_KEY = 'buildcalc_license_key';
  var CLIENT_LIMIT = 2;
  var PROJECTS_PER_CLIENT_LIMIT = 2;

  // Cached state
  var _licensed = false;
  var _licenseeName = '';

  // App-specific secret: BuildCalc
  var _SECRET = [66,117,105,108,100,67,97,108,99];

  function _getSecret() {
    return _SECRET.map(function (c) { return String.fromCharCode(c); }).join('');
  }

  // ─── HMAC-SHA256 via Web Crypto API ───────────────────────────────────────

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

  // ─── Validate ─────────────────────────────────────────────────────────────

  async function _validate(keyStr) {
    try {
      var json = atob(keyStr);
      var obj = JSON.parse(json);
      if (!obj || typeof obj.n !== 'string' || typeof obj.h !== 'string') return null;
      if (!obj.n.trim()) return null;
      var computed = await _hmacHex(obj.n);
      if (computed.toLowerCase() === obj.h.toLowerCase()) {
        return obj.n;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ─── Public: init ─────────────────────────────────────────────────────────

  async function init() {
    // crypto.subtle is only available on secure origins (https/localhost)
    // On file:// protocol, skip validation and default to unlicensed
    if (!crypto || !crypto.subtle) {
      _licensed = false;
      _licenseeName = '';
      return;
    }

    var stored = null;
    try { stored = localStorage.getItem(LS_KEY); } catch (e) {}

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
  }

  // ─── Public: activate ─────────────────────────────────────────────────────

  async function activate(keyString) {
    if (!crypto || !crypto.subtle) {
      return { success: false, message: 'License activation requires HTTPS or localhost. Please use a local server.' };
    }
    if (!keyString || !keyString.trim()) {
      return { success: false, message: 'Please enter a license key.' };
    }
    keyString = keyString.trim();
    var name = await _validate(keyString);
    if (name) {
      try { localStorage.setItem(LS_KEY, keyString); } catch (e) {
        return { success: false, message: 'Failed to store license key.' };
      }
      _licensed = true;
      _licenseeName = name;
      _notifyListeners();
      return { success: true, message: 'License activated for: ' + name };
    }
    return { success: false, message: 'Invalid license key. Please check and try again.' };
  }

  // ─── Public: deactivate ───────────────────────────────────────────────────

  function deactivate() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    _licensed = false;
    _licenseeName = '';
    _notifyListeners();
  }

  // ─── Public: isLicensed ───────────────────────────────────────────────────

  function isLicensed() {
    return _licensed;
  }

  function getLicenseeName() {
    return _licenseeName;
  }

  // ─── Public: limit checks ─────────────────────────────────────────────────

  var _listeners = [];

  function onStateChange(callback) {
    if (typeof callback === 'function') {
      _listeners.push(callback);
    }
  }

  function _notifyListeners() {
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](_licensed, _licenseeName); } catch (e) {}
    }
  }

  function getClientLimit() {
    return CLIENT_LIMIT;
  }

  function getProjectsPerClientLimit() {
    return PROJECTS_PER_CLIENT_LIMIT;
  }

  /**
   * Check if user can add another client.
   * Queries DB for current count. Returns Promise<boolean>.
   * Shows alert if limit reached.
   */
  function canAddClient() {
    if (_licensed) return Promise.resolve(true);
    return DB.getAllClients().then(function (clients) {
      if (clients.length >= CLIENT_LIMIT) {
        alert('You have reached the limit of ' + CLIENT_LIMIT + ' clients.\n\nPlease obtain a license key to add unlimited clients.\nGo to Settings → License to activate.');
        return false;
      }
      return true;
    });
  }

  /**
   * Check if user can add another project for a given client.
   * Queries DB for current count. Returns Promise<boolean>.
   * Shows alert if limit reached.
   * @param {string} clientId
   */
  function canAddProject(clientId) {
    if (_licensed) return Promise.resolve(true);
    return DB.getProjectsByClient(clientId).then(function (projects) {
      if (projects.length >= PROJECTS_PER_CLIENT_LIMIT) {
        alert('You have reached the limit of ' + PROJECTS_PER_CLIENT_LIMIT + ' projects per client.\n\nPlease obtain a license key to add unlimited projects.\nGo to Settings → License to activate.');
        return false;
      }
      return true;
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    init: init,
    activate: activate,
    deactivate: deactivate,
    isLicensed: isLicensed,
    getLicenseeName: getLicenseeName,
    onStateChange: onStateChange,
    getClientLimit: getClientLimit,
    getProjectsPerClientLimit: getProjectsPerClientLimit,
    canAddClient: canAddClient,
    canAddProject: canAddProject
  };
})();
