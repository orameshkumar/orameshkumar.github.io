/**
 * settings.js - Settings Module for ABC Provisional Store
 *
 * Stores and retrieves store name, UPI payment settings from localStorage.
 * Provides UPI QR code generation after bill finalization.
 * Updates app header/title with store name.
 */

const Settings = (function () {
  'use strict';

  const STORAGE_KEY = 'abcstore_upi_settings';
  const DEFAULT_STORE_NAME = 'ABC Store';

  // ─── License Section ─────────────────────────────────────────────────────────

  /**
   * Render (or re-render) the license status section at the top of the settings screen.
   * Shows activation form when unlicensed, licensee info when licensed.
   */
  function _renderLicenseSection() {
    var settingsScreen = document.getElementById('settings-screen');
    if (!settingsScreen) return;

    var screenContent = settingsScreen.querySelector('.screen-content');
    if (!screenContent) return;

    // Remove existing license section if present
    var existing = document.getElementById('license-section');
    if (existing) existing.remove();

    var section = document.createElement('div');
    section.id = 'license-section';
    section.style.cssText = 'margin-bottom:20px;padding:16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);';

    var licensed = License.isLicensed();
    var name = License.getLicenseeName();

    if (licensed) {
      section.innerHTML =
        '<p id="license-status" style="font-size:1rem;font-weight:600;margin:0 0 12px 0;color:var(--color-success);">✅ Licensed to: ' + _escapeHtml(name) + '</p>' +
        '<p id="license-error" style="color:var(--color-danger);font-size:0.8rem;margin:0 0 8px 0;display:none;"></p>' +
        '<p id="license-success-msg" style="color:var(--color-success);font-size:0.8rem;margin:0 0 8px 0;display:none;"></p>' +
        '<button id="license-remove-btn" class="btn-secondary" style="width:100%;">Remove License</button>';
    } else {
      section.innerHTML =
        '<p id="license-status" style="font-size:1rem;font-weight:600;margin:0 0 12px 0;color:var(--color-warning);">🔒 Unlicensed — Features are limited</p>' +
        '<p id="license-error" style="color:var(--color-danger);font-size:0.8rem;margin:0 0 8px 0;display:none;"></p>' +
        '<p id="license-success-msg" style="color:var(--color-success);font-size:0.8rem;margin:0 0 8px 0;display:none;"></p>' +
        '<div class="form-group" style="margin-bottom:8px;">' +
          '<input type="text" id="license-key-input" maxlength="500" placeholder="Enter license key" autocomplete="off" style="width:100%;box-sizing:border-box;">' +
        '</div>' +
        '<button id="license-activate-btn" class="btn-primary" style="width:100%;">Activate</button>';
    }

    // Insert at the top of screen-content (before first child)
    screenContent.insertBefore(section, screenContent.firstChild);

    // Attach event listeners
    _attachLicenseListeners();
  }

  /**
   * Attach event listeners to license section buttons.
   */
  function _attachLicenseListeners() {
    var activateBtn = document.getElementById('license-activate-btn');
    if (activateBtn) {
      activateBtn.addEventListener('click', _handleActivate);
    }

    var removeBtn = document.getElementById('license-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', _handleRemoveLicense);
    }
  }

  /**
   * Handle Activate button click.
   * Validates input, calls License.activate(), and updates UI.
   */
  async function _handleActivate() {
    var input = document.getElementById('license-key-input');
    var errorEl = document.getElementById('license-error');
    var successEl = document.getElementById('license-success-msg');

    // Hide previous messages
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';

    if (!input || !input.value.trim()) {
      if (errorEl) {
        errorEl.textContent = 'Please enter a license key.';
        errorEl.style.display = 'block';
      }
      return;
    }

    var result = await License.activate(input.value.trim());

    if (result.success) {
      // Show success message briefly, then re-render
      _renderLicenseSection();
      var successMsg = document.getElementById('license-success-msg');
      if (successMsg) {
        successMsg.textContent = result.message;
        successMsg.style.display = 'block';
        setTimeout(function () {
          if (successMsg) successMsg.style.display = 'none';
        }, 3000);
      }
    } else {
      // Show error, retain input value
      if (errorEl) {
        errorEl.textContent = result.message;
        errorEl.style.display = 'block';
      }
    }
  }

  /**
   * Handle Remove License button click.
   * Shows confirmation dialog, deactivates on confirm.
   */
  function _handleRemoveLicense() {
    var confirmed = confirm('Remove license? Features will be limited.');
    if (confirmed) {
      License.deactivate();
      _renderLicenseSection();
    }
  }

  /**
   * Escape HTML entities to prevent XSS in licensee name display.
   * @param {string} str - Raw string
   * @returns {string} HTML-safe string
   */
  function _escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── Initialization ─────────────────────────────────────────────────────────

  /**
   * Initialize the Settings module.
   * Loads saved settings into the form, sets up save button,
   * and applies store name to the UI. Also renders the license section.
   */
  function init() {
    var saveBtn = document.getElementById('upi-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveSettings);
    }

    // Load existing settings into form
    loadSettingsIntoForm();

    // Apply store name to UI
    applyStoreName();

    // Render license section at the top of settings
    _renderLicenseSection();

    // Register listener for license state changes to update UI dynamically
    License.onStateChange(function () {
      _renderLicenseSection();
    });
  }

  // ─── Store Name ─────────────────────────────────────────────────────────────

  /**
   * Get the store name from settings, or return default.
   * @returns {string} Store name
   */
  function getStoreName() {
    var settings = getSettings();
    return (settings && settings.storeName) ? settings.storeName : DEFAULT_STORE_NAME;
  }

  /**
   * Apply store name to all relevant UI elements:
   * - App header title
   * - Page title (browser tab)
   */
  function applyStoreName() {
    var name = getStoreName();

    // Update header banner
    var titleEl = document.querySelector('.app-title');
    if (titleEl) {
      titleEl.textContent = name;
    }

    // Update browser tab title
    document.title = name;
  }

  // ─── Load / Save ────────────────────────────────────────────────────────────

  /**
   * Get saved settings from localStorage.
   * @returns {Object|null} { storeName, upiId, payeeName, merchantCode } or null
   */
  function getSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Settings: Failed to read settings', e);
    }
    return null;
  }

  /**
   * Save settings from form to localStorage.
   */
  function saveSettings() {
    var storeName = document.getElementById('store-name-input');
    var upiId = document.getElementById('upi-id-input');
    var payeeName = document.getElementById('upi-name-input');
    var merchantCode = document.getElementById('upi-merchant-code-input');
    var msg = document.getElementById('upi-save-msg');

    var settings = {
      storeName: storeName ? storeName.value.trim() : DEFAULT_STORE_NAME,
      upiId: upiId ? upiId.value.trim() : '',
      payeeName: payeeName ? payeeName.value.trim() : '',
      merchantCode: merchantCode ? merchantCode.value.trim() : ''
    };

    // Store name defaults if left empty
    if (!settings.storeName) {
      settings.storeName = DEFAULT_STORE_NAME;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

      // Apply store name immediately
      applyStoreName();

      if (msg) {
        msg.style.display = 'block';
        setTimeout(function () { msg.style.display = 'none'; }, 3000);
      }
    } catch (e) {
      console.error('Settings: Failed to save', e);
      alert('Failed to save settings.');
    }
  }

  /**
   * Load saved settings into the form inputs.
   */
  function loadSettingsIntoForm() {
    var settings = getSettings();

    var storeName = document.getElementById('store-name-input');
    var upiId = document.getElementById('upi-id-input');
    var payeeName = document.getElementById('upi-name-input');
    var merchantCode = document.getElementById('upi-merchant-code-input');

    if (storeName) storeName.value = (settings && settings.storeName) ? settings.storeName : DEFAULT_STORE_NAME;
    if (upiId) upiId.value = (settings && settings.upiId) ? settings.upiId : '';
    if (payeeName) payeeName.value = (settings && settings.payeeName) ? settings.payeeName : '';
    if (merchantCode) merchantCode.value = (settings && settings.merchantCode) ? settings.merchantCode : '';
  }

  // ─── UPI QR Code Generation ─────────────────────────────────────────────────

  /**
   * Generate a UPI payment URL string.
   * @param {number} amount - Bill total amount
   * @param {string} billNumber - Bill number for the transaction note
   * @returns {string|null} UPI URL string, or null if UPI not configured
   */
  function generateUpiUrl(amount, billNumber) {
    var settings = getSettings();
    if (!settings || !settings.upiId) return null;

    var params = [];
    params.push('pa=' + encodeURIComponent(settings.upiId));

    if (settings.payeeName) {
      params.push('pn=' + encodeURIComponent(settings.payeeName));
    }

    params.push('am=' + amount.toFixed(2));
    params.push('cu=INR');
    params.push('tn=' + encodeURIComponent('Bill: ' + billNumber));

    if (settings.merchantCode) {
      params.push('mc=' + encodeURIComponent(settings.merchantCode));
    }

    return 'upi://pay?' + params.join('&');
  }

  /**
   * Show a QR code modal for UPI payment after bill finalization.
   * @param {number} amount - Bill total
   * @param {string} billNumber - Bill number
   */
  function showPaymentQR(amount, billNumber) {
    var upiUrl = generateUpiUrl(amount, billNumber);
    if (!upiUrl) return;

    var storeName = getStoreName();

    var existing = document.getElementById('upi-qr-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'upi-qr-modal';
    overlay.className = 'modal-overlay';

    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-labelledby="qr-modal-title" aria-modal="true">' +
        '<div class="modal-header">' +
          '<h2 class="modal-title" id="qr-modal-title">' + storeName + ' - Payment</h2>' +
          '<button class="modal-close" id="qr-modal-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal-body" style="text-align:center;">' +
          '<p style="font-size:0.875rem;color:#5f6368;margin-bottom:8px;">Scan to pay for ' + billNumber + '</p>' +
          '<p style="font-size:1.5rem;font-weight:700;color:#202124;margin-bottom:12px;">₹' + amount.toFixed(2) + '</p>' +
          '<div id="upi-qr-canvas-container" style="display:inline-block;padding:12px;background:#fff;border-radius:8px;border:1px solid #dadce0;"></div>' +
          '<p style="font-size:0.75rem;color:#5f6368;margin-top:8px;word-break:break-all;">' + upiUrl + '</p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn-primary" id="qr-modal-done" style="flex:1;">Done</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var container = document.getElementById('upi-qr-canvas-container');
    if (container && typeof QRCode !== 'undefined') {
      QRCode.toCanvas(container, upiUrl, { width: 200, margin: 2 }, function (error) {
        if (error) {
          console.error('QR generation failed:', error);
          container.innerHTML = '<p style="color:#ea4335;font-size:0.8rem;">QR generation failed</p>';
        }
      });
    } else if (container) {
      container.innerHTML = '<p style="color:#ea4335;font-size:0.8rem;">QR library not loaded</p>';
    }

    requestAnimationFrame(function () {
      overlay.classList.add('active');
    });

    document.getElementById('qr-modal-close').addEventListener('click', function () {
      closeQrModal(overlay);
    });
    document.getElementById('qr-modal-done').addEventListener('click', function () {
      closeQrModal(overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeQrModal(overlay);
    });
  }

  function closeQrModal(overlay) {
    overlay.classList.remove('active');
    setTimeout(function () {
      if (overlay.parentNode) overlay.remove();
    }, 300);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    init: init,
    getSettings: getSettings,
    getStoreName: getStoreName,
    generateUpiUrl: generateUpiUrl,
    showPaymentQR: showPaymentQR
  };

})();
