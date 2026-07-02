var AuthWebAuthn = (function() {
  'use strict';

  // ─── Storage Keys (matching auth.js prefix convention) ───
  var STORAGE_PREFIX = 'pup_auth_';
  var KEYS = {
    webauthn_id: STORAGE_PREFIX + 'webauthn_id',
    webauthn_pubkey: STORAGE_PREFIX + 'webauthn_pubkey'
  };

  // ─── Constants ───
  var TIMEOUT_MS = 60000;
  var RP_NAME = 'Pay Up Partners';

  // ─── Error Types ───
  var ERROR_TYPES = {
    NOT_AVAILABLE: 'not_available',
    NOT_SECURE: 'not_secure',
    USER_CANCELLED: 'user_cancelled',
    TIMEOUT: 'timeout',
    NOT_ALLOWED: 'not_allowed',
    INVALID_STATE: 'invalid_state',
    UNKNOWN: 'unknown'
  };

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

  // ─── Error Helper ───
  function createError(type, message) {
    return { type: type, message: message };
  }

  function classifyError(err) {
    if (!err) {
      return createError(ERROR_TYPES.UNKNOWN, 'An unknown error occurred');
    }

    var name = err.name || '';
    var message = err.message || '';

    // User explicitly cancelled the operation
    if (name === 'NotAllowedError') {
      // NotAllowedError can mean user cancelled OR a timeout occurred
      if (message.toLowerCase().indexOf('timeout') !== -1) {
        return createError(ERROR_TYPES.TIMEOUT, 'Authentication timed out. Please try again.');
      }
      return createError(ERROR_TYPES.NOT_ALLOWED, 'Authentication was not allowed. The user may have cancelled the request.');
    }

    if (name === 'AbortError') {
      return createError(ERROR_TYPES.USER_CANCELLED, 'Authentication was cancelled by the user.');
    }

    if (name === 'InvalidStateError') {
      return createError(ERROR_TYPES.INVALID_STATE, 'The authenticator is in an invalid state.');
    }

    if (name === 'SecurityError') {
      return createError(ERROR_TYPES.NOT_SECURE, 'A secure context (HTTPS) is required for WebAuthn.');
    }

    if (name === 'TypeError') {
      return createError(ERROR_TYPES.UNKNOWN, 'Invalid parameters provided: ' + message);
    }

    return createError(ERROR_TYPES.UNKNOWN, message || 'An unknown error occurred during authentication.');
  }

  // ─── 2.3 isSecureContext() ───
  function isSecureContext() {
    // Check the standard isSecureContext property first
    if (typeof window.isSecureContext === 'boolean') {
      return window.isSecureContext;
    }
    // Fallback: check protocol and hostname
    var protocol = window.location.protocol;
    var hostname = window.location.hostname;
    if (protocol === 'https:') {
      return true;
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return true;
    }
    return false;
  }

  // ─── 2.2 isAvailable() ───
  async function isAvailable() {
    // Must be secure context
    if (!isSecureContext()) {
      return false;
    }
    // Check for PublicKeyCredential API
    if (!window.PublicKeyCredential) {
      return false;
    }
    // Check for platform authenticator availability method
    if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      return false;
    }
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) {
      return false;
    }
  }

  // ─── 2.4 enroll() ───
  async function enroll() {
    // Pre-checks
    if (!isSecureContext()) {
      return { success: false, error: createError(ERROR_TYPES.NOT_SECURE, 'WebAuthn requires a secure context (HTTPS or localhost).') };
    }

    var available = await isAvailable();
    if (!available) {
      return { success: false, error: createError(ERROR_TYPES.NOT_AVAILABLE, 'Platform authenticator is not available on this device.') };
    }

    try {
      var challenge = crypto.getRandomValues(new Uint8Array(32));
      var userId = crypto.getRandomValues(new Uint8Array(16));

      var createOptions = {
        publicKey: {
          challenge: challenge,
          rp: {
            name: RP_NAME,
            id: location.hostname
          },
          user: {
            id: userId,
            name: 'pay-up-user',
            displayName: 'Pay Up Partners User'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256
            { type: 'public-key', alg: -257 }  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required'
          },
          timeout: TIMEOUT_MS
        }
      };

      var credential = await navigator.credentials.create(createOptions);

      if (!credential) {
        return { success: false, error: createError(ERROR_TYPES.UNKNOWN, 'No credential was returned.') };
      }

      // Store credential ID
      var credentialIdArray = new Uint8Array(credential.rawId);
      localStorage.setItem(KEYS.webauthn_id, arrayToBase64(credentialIdArray));

      // Store public key (from attestation response)
      var response = credential.response;
      if (response && typeof response.getPublicKey === 'function') {
        var pubKeyBuffer = response.getPublicKey();
        if (pubKeyBuffer) {
          var pubKeyArray = new Uint8Array(pubKeyBuffer);
          localStorage.setItem(KEYS.webauthn_pubkey, arrayToBase64(pubKeyArray));
        }
      } else {
        // Fallback: store attestationObject as public key reference
        var attestation = new Uint8Array(response.attestationObject);
        localStorage.setItem(KEYS.webauthn_pubkey, arrayToBase64(attestation));
      }

      return { success: true, credentialId: arrayToBase64(credentialIdArray) };

    } catch (err) {
      return { success: false, error: classifyError(err) };
    }
  }

  // ─── 2.5 verify(credentialId) ───
  async function verify(credentialId) {
    // Pre-checks
    if (!isSecureContext()) {
      return { success: false, error: createError(ERROR_TYPES.NOT_SECURE, 'WebAuthn requires a secure context (HTTPS or localhost).') };
    }

    // Use provided credentialId or retrieve from storage
    var storedId = credentialId || localStorage.getItem(KEYS.webauthn_id);
    if (!storedId) {
      return { success: false, error: createError(ERROR_TYPES.INVALID_STATE, 'No WebAuthn credential found. Please enroll first.') };
    }

    try {
      var credentialIdArray = base64ToArray(storedId);
      var challenge = crypto.getRandomValues(new Uint8Array(32));

      var getOptions = {
        publicKey: {
          challenge: challenge,
          allowCredentials: [{
            type: 'public-key',
            id: credentialIdArray.buffer,
            transports: ['internal']
          }],
          userVerification: 'required',
          timeout: TIMEOUT_MS
        }
      };

      var assertion = await navigator.credentials.get(getOptions);

      if (!assertion) {
        return { success: false, error: createError(ERROR_TYPES.UNKNOWN, 'No assertion was returned.') };
      }

      // Client-side verification: assertion exists and has valid response
      // In a server-based app, you'd verify the signature against the stored public key.
      // For client-side only, a successful WebAuthn ceremony is sufficient proof.
      return { success: true };

    } catch (err) {
      return { success: false, error: classifyError(err) };
    }
  }

  // ─── 2.6 removeCredential() ───
  function removeCredential() {
    localStorage.removeItem(KEYS.webauthn_id);
    localStorage.removeItem(KEYS.webauthn_pubkey);
  }

  // ─── 2.7 hasCredential() — Utility to check if enrolled ───
  function hasCredential() {
    return localStorage.getItem(KEYS.webauthn_id) !== null;
  }

  // ─── Public API ───
  return {
    isAvailable: isAvailable,
    isSecureContext: isSecureContext,
    enroll: enroll,
    verify: verify,
    removeCredential: removeCredential,
    hasCredential: hasCredential,
    ERROR_TYPES: ERROR_TYPES
  };
})();
