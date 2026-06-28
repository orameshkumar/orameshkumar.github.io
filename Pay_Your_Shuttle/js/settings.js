const Settings = (function () {
  'use strict';
  const KEYS = {
    APP_NAME:          'pys_app_name',
    UPI_ID:            'pys_upi_id',
    THEME:             'pys_theme',
    BACKUP_FREQ:       'pys_backup_freq',
    LAST_BACKUP:       'pys_last_backup',
    DEFAULT_GUEST_FEE: 'pys_default_guest_fee'
  };
  const DEFAULTS = {
    APP_NAME:          'Pay Your Shuttle',
    THEME:             'dark',  // 'dark' | 'light' | 'forest' | 'sunset'
    BACKUP_FREQ:       7,
    DEFAULT_GUEST_FEE: 50
  };

  function get(key, def) {
    try { var v = localStorage.getItem(key); return (v !== null && v !== '') ? v : def; }
    catch (e) { return def; }
  }
  function set(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  function getAppName()            { return get(KEYS.APP_NAME, DEFAULTS.APP_NAME); }
  function setAppName(v)           { set(KEYS.APP_NAME, (v || '').trim() || DEFAULTS.APP_NAME); }
  function getUpiId()              { return get(KEYS.UPI_ID, ''); }
  function setUpiId(v)             { set(KEYS.UPI_ID, (v || '').trim()); }
  function getTheme()              { return get(KEYS.THEME, DEFAULTS.THEME); }
  function setTheme(v)             { set(KEYS.THEME, v); applyTheme(v); }
  function getBackupFrequency()    { return parseInt(get(KEYS.BACKUP_FREQ, DEFAULTS.BACKUP_FREQ), 10) || 0; }
  function setBackupFrequency(v)   { set(KEYS.BACKUP_FREQ, String(v)); }
  function getLastBackup()         { return get(KEYS.LAST_BACKUP, ''); }
  function setLastBackup(v)        { set(KEYS.LAST_BACKUP, v); }
  function getDefaultGuestFee()    { return parseFloat(get(KEYS.DEFAULT_GUEST_FEE, DEFAULTS.DEFAULT_GUEST_FEE)) || 50; }
  function setDefaultGuestFee(v)   { set(KEYS.DEFAULT_GUEST_FEE, String(parseFloat(v) || 50)); }

  var _themeColors = {
    dark:   '#1e1e1e',
    light:  '#1565c0',
    forest: '#1b5e3a',
    sunset: '#b85e0e'
  };

  function applyTheme(theme) {
    if (!theme) theme = getTheme();
    if (theme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', _themeColors[theme] || '#1e1e1e');
  }

  function getAllSettings() {
    var result = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.startsWith('pys_')) result[key] = localStorage.getItem(key);
      }
    } catch (e) {}
    return result;
  }

  function restoreSettings(obj) {
    if (!obj) return;
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) { try { localStorage.setItem(key, obj[key]); } catch (e) {} }
    }
  }

  function init() {
    applyTheme();
    var appNameInput    = document.getElementById('settings-app-name');
    var upiIdInput      = document.getElementById('settings-upi-id');
    var guestFeeInput   = document.getElementById('settings-default-guest-fee');
    var themeToggle     = document.getElementById('theme-toggle');
    var freqSelect      = document.getElementById('backup-frequency');
    var saveBtn         = document.getElementById('settings-save-btn');

    if (appNameInput)  appNameInput.value  = getAppName();
    if (upiIdInput)    upiIdInput.value    = getUpiId();
    if (guestFeeInput) guestFeeInput.value = getDefaultGuestFee();
    // themeToggle is now a <select> with id="theme-select"
    var themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.value = getTheme();
      themeSelect.addEventListener('change', function () { setTheme(themeSelect.value); });
    }
    // keep legacy toggle support if it exists
    if (themeToggle) {
      themeToggle.checked = getTheme() === 'dark';
      themeToggle.addEventListener('change', function () { setTheme(themeToggle.checked ? 'dark' : 'light'); });
    }
    if (freqSelect) {
      freqSelect.value = String(getBackupFrequency());
      freqSelect.addEventListener('change', function () { setBackupFrequency(parseInt(freqSelect.value, 10)); });
    }
    if (saveBtn) saveBtn.addEventListener('click', function (e) { e.preventDefault(); save(); });
    updateAppNameDisplay();
  }

  function save() {
    var appNameInput  = document.getElementById('settings-app-name');
    var upiIdInput    = document.getElementById('settings-upi-id');
    var guestFeeInput = document.getElementById('settings-default-guest-fee');
    var errorEl       = document.getElementById('settings-error');
    var msgEl         = document.getElementById('settings-save-msg');
    if (errorEl) errorEl.textContent = '';

    var upiVal = upiIdInput ? upiIdInput.value.trim() : '';
    if (!upiVal)            { if (errorEl) errorEl.textContent = 'UPI ID is required.'; return; }
    if (upiVal.length > 45) { if (errorEl) errorEl.textContent = 'UPI ID must be 45 characters or less.'; return; }

    var appVal = appNameInput ? appNameInput.value.trim() : '';
    if (appVal.length > 50) { if (errorEl) errorEl.textContent = 'App name must be 50 characters or less.'; return; }

    var guestFeeVal = parseFloat(guestFeeInput ? guestFeeInput.value : 50) || 50;
    if (guestFeeVal <= 0)   { if (errorEl) errorEl.textContent = 'Default guest fee must be greater than zero.'; return; }

    setAppName(appVal);
    setUpiId(upiVal);
    setDefaultGuestFee(guestFeeVal);
    updateAppNameDisplay();

    if (msgEl) { msgEl.removeAttribute('hidden'); setTimeout(function () { msgEl.setAttribute('hidden', ''); }, 3000); }
  }

  function updateAppNameDisplay() {
    var header = document.getElementById('app-name-header');
    if (header) header.textContent = getAppName();
    document.title = getAppName();
  }

  return {
    init, save,
    getAppName, setAppName,
    getUpiId, setUpiId,
    getTheme, setTheme,
    getBackupFrequency, setBackupFrequency,
    getLastBackup, setLastBackup,
    getDefaultGuestFee, setDefaultGuestFee,
    applyTheme, updateAppNameDisplay,
    getAllSettings, restoreSettings
  };
})();
