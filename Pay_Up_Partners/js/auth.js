var Auth = (function() {
  'use strict';

  // ─── Constants ───
  var STORAGE_PREFIX = 'pup_auth_';
  var MIN_PASSWORD_LENGTH = 4;
  var DEFAULT_TIMEOUT_MINUTES = 5;
  var PBKDF2_ITERATIONS = 100000;
  var SESSION_CHECK_INTERVAL = 10000; // 10 seconds

  // ─── Storage Keys ───
  var KEYS = {
    hash: STORAGE_PREFIX + 'hash',
    salt: STORAGE_PREFIX + 'salt',
    webauthn_id: STORAGE_PREFIX + 'webauthn_id',
    webauthn_pubkey: STORAGE_PREFIX + 'webauthn_pubkey',
    biometric_enabled: STORAGE_PREFIX + 'biometric_enabled',
    timeout: STORAGE_PREFIX + 'timeout',
    version: STORAGE_PREFIX + 'version'
  };

  // ─── State ───
  var _isUnlocked = false;
  var _sessionTimer = null;
  var _lastActivity = Date.now();
  var _onLockCallback = null;
  var _activityBound = false;

  // ─── Utility: Base64 encode/decode for Uint8Array ───
  function arrayToBase64(arr) {
    var binary = '';
    for (var i = 0; i < arr.length; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
  }

  function base64ToArray(base64) {
    var binary = atob(base64);
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      arr[i] = binary.charCodeAt(i);
    }
    return arr;
  }

  // ─── SHA-256 Fallback (for browsers without Web Crypto) ───
  function sha256Fallback(message) {
    // Simple SHA-256 implementation for fallback
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }

    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);

    // Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    // Round constants
    var k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    // Pre-processing: convert string to UTF-8 bytes
    var bytes = [];
    for (var i = 0; i < message.length; i++) {
      var code = message.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }

    var lengthBits = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) {
      bytes.push(0);
    }
    // Append length as 64-bit big-endian
    for (var s = 56; s >= 0; s -= 8) {
      bytes.push((lengthBits / mathPow(2, s)) & 0xff);
    }

    // Process each 512-bit block
    for (var offset = 0; offset < bytes.length; offset += 64) {
      var w = [];
      for (var j = 0; j < 16; j++) {
        w[j] = (bytes[offset + j * 4] << 24) | (bytes[offset + j * 4 + 1] << 16) |
                (bytes[offset + j * 4 + 2] << 8) | bytes[offset + j * 4 + 3];
      }
      for (var j = 16; j < 64; j++) {
        var s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }

      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

      for (var j = 0; j < 64; j++) {
        var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
        var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;

        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }

      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }

    // Convert hash to Uint8Array (32 bytes)
    var hashArray = new Uint8Array(32);
    var hashes = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (var i = 0; i < 8; i++) {
      hashArray[i * 4] = (hashes[i] >>> 24) & 0xff;
      hashArray[i * 4 + 1] = (hashes[i] >>> 16) & 0xff;
      hashArray[i * 4 + 2] = (hashes[i] >>> 8) & 0xff;
      hashArray[i * 4 + 3] = hashes[i] & 0xff;
    }
    return hashArray;
  }

  // ─── Password Hashing (PBKDF2 with SHA-256 fallback) ───
  async function hashPassword(password, salt) {
    if (window.crypto && window.crypto.subtle) {
      // PBKDF2 path via Web Crypto API
      var encoder = new TextEncoder();
      var keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      var bits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: PBKDF2_ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );
      return new Uint8Array(bits);
    } else {
      // Fallback: SHA-256 for older browsers without Web Crypto
      var saltBase64 = arrayToBase64(salt);
      return sha256Fallback(password + saltBase64);
    }
  }

  // ─── Set Password ───
  async function setPassword(password) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: 'Password must be at least ' + MIN_PASSWORD_LENGTH + ' characters' };
    }

    // Generate random 16-byte salt
    var salt = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      crypto.getRandomValues(salt);
    } else {
      for (var i = 0; i < 16; i++) {
        salt[i] = Math.floor(Math.random() * 256);
      }
    }

    var hash = await hashPassword(password, salt);

    // Store in localStorage
    localStorage.setItem(KEYS.hash, arrayToBase64(hash));
    localStorage.setItem(KEYS.salt, arrayToBase64(salt));
    localStorage.setItem(KEYS.version, '1');

    return { success: true };
  }

  // ─── Verify Password ───
  async function verifyPassword(password) {
    var storedHash = localStorage.getItem(KEYS.hash);
    var storedSalt = localStorage.getItem(KEYS.salt);

    if (!storedHash || !storedSalt) {
      return false;
    }

    var salt = base64ToArray(storedSalt);
    var derivedHash = await hashPassword(password, salt);
    var expectedHash = base64ToArray(storedHash);

    // Constant-time comparison
    if (derivedHash.length !== expectedHash.length) return false;
    var diff = 0;
    for (var i = 0; i < derivedHash.length; i++) {
      diff |= derivedHash[i] ^ expectedHash[i];
    }
    return diff === 0;
  }

  // ─── Change Password ───
  async function changePassword(currentPassword, newPassword) {
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: 'New password must be at least ' + MIN_PASSWORD_LENGTH + ' characters' };
    }

    var currentValid = await verifyPassword(currentPassword);
    if (!currentValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    return await setPassword(newPassword);
  }

  // ─── Setup Check ───
  function isSetup() {
    return localStorage.getItem(KEYS.hash) !== null;
  }

  // ─── Lock State Management ───
  function isLocked() {
    return !_isUnlocked;
  }

  function unlock() {
    _isUnlocked = true;
  }

  function lock() {
    _isUnlocked = false;
    stopSessionTimer();
    if (typeof _onLockCallback === 'function') {
      _onLockCallback();
    }
  }

  // ─── Timeout Preference ───
  function getTimeoutMinutes() {
    var stored = localStorage.getItem(KEYS.timeout);
    if (stored !== null) {
      var parsed = parseInt(stored, 10);
      return isNaN(parsed) ? DEFAULT_TIMEOUT_MINUTES : parsed;
    }
    return DEFAULT_TIMEOUT_MINUTES;
  }

  function setTimeoutMinutes(minutes) {
    var value = parseInt(minutes, 10);
    if (isNaN(value) || value < 0) {
      value = DEFAULT_TIMEOUT_MINUTES;
    }
    localStorage.setItem(KEYS.timeout, value.toString());
  }

  // ─── Biometric Preference ───
  function isBiometricEnabled() {
    return localStorage.getItem(KEYS.biometric_enabled) === 'true';
  }

  function setBiometricEnabled(enabled) {
    localStorage.setItem(KEYS.biometric_enabled, enabled ? 'true' : 'false');
  }

  // ─── Activity Tracking ───
  function _resetActivity() {
    _lastActivity = Date.now();
  }

  function _bindActivityListeners() {
    if (_activityBound) return;
    ['click', 'touchstart', 'keydown'].forEach(function(event) {
      document.addEventListener(event, _resetActivity, { passive: true });
    });
    _activityBound = true;
  }

  function _unbindActivityListeners() {
    if (!_activityBound) return;
    ['click', 'touchstart', 'keydown'].forEach(function(event) {
      document.removeEventListener(event, _resetActivity);
    });
    _activityBound = false;
  }

  // ─── Visibility Change Handler ───
  function _onVisibilityChange() {
    if (document.hidden && _isUnlocked) {
      var timeoutMs = getTimeoutMinutes() * 60 * 1000;
      if (timeoutMs === 0) return; // "Never" setting
      // Accelerate timeout: set last activity to (timeout - 60s) ago
      // so the app locks within ~60 seconds of being backgrounded
      _lastActivity = Date.now() - (timeoutMs - 60000);
    }
  }

  // ─── Session Timer ───
  function startSessionTimer() {
    var timeoutMs = getTimeoutMinutes() * 60 * 1000;
    if (timeoutMs === 0) return; // "Never" setting — no timer

    _lastActivity = Date.now();
    stopSessionTimer();

    _sessionTimer = setInterval(function() {
      if (Date.now() - _lastActivity > timeoutMs) {
        lock();
      }
    }, SESSION_CHECK_INTERVAL);

    // Bind activity listeners
    _bindActivityListeners();

    // Bind visibility change
    document.addEventListener('visibilitychange', _onVisibilityChange);
  }

  function stopSessionTimer() {
    if (_sessionTimer) {
      clearInterval(_sessionTimer);
      _sessionTimer = null;
    }
    _unbindActivityListeners();
    document.removeEventListener('visibilitychange', _onVisibilityChange);
  }

  // ─── Init ───
  function init(options) {
    options = options || {};
    if (typeof options.onLock === 'function') {
      _onLockCallback = options.onLock;
    }
    // Ensure version key exists if setup is complete
    if (isSetup() && !localStorage.getItem(KEYS.version)) {
      localStorage.setItem(KEYS.version, '1');
    }
    // Start in locked state
    _isUnlocked = false;
  }

  // ─── Public API ───
  return {
    init: init,
    isSetup: isSetup,
    isLocked: isLocked,
    unlock: unlock,
    lock: lock,
    verifyPassword: verifyPassword,
    setPassword: setPassword,
    changePassword: changePassword,
    getTimeoutMinutes: getTimeoutMinutes,
    setTimeoutMinutes: setTimeoutMinutes,
    isBiometricEnabled: isBiometricEnabled,
    setBiometricEnabled: setBiometricEnabled,
    startSessionTimer: startSessionTimer,
    stopSessionTimer: stopSessionTimer
  };
})();
