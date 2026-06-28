var App = (function () {
  'use strict';
  var currentScreen = 'members-screen';

  async function initApp() {
    try {
      Settings.applyTheme();
      await License.init();
      await DB.init();
      Settings.init();
      initLicenseUI();
      Members.init();
      Contributions.init();
      Monthly.init();
      GuestPlay.init();
      Expenses.init();
      PaymentHistory.init();
      Reports.init();
      WhatsApp.init();
      Backup.init();
      setupTabNavigation();
      Settings.updateAppNameDisplay();
      initDatePickers();
      registerServiceWorker();
      Backup.checkBackupReminder();
    } catch (e) {
      console.error('App init failed:', e);
      alert('Could not initialize app: ' + e.message);
    }
  }

  function initLicenseUI() {
    var activateBtn   = document.getElementById('license-activate-btn');
    var deactivateBtn = document.getElementById('license-deactivate-btn');
    var keyInput      = document.getElementById('license-key-input');
    var statusText    = document.getElementById('license-status-text');
    var errorEl       = document.getElementById('license-error');
    var successEl     = document.getElementById('license-success-msg');
    var banner        = document.getElementById('license-banner');

    function updateLicenseDisplay() {
      var licensed = License.isLicensed();
      var name     = License.getLicenseeName();

      if (statusText) {
        statusText.textContent = licensed
          ? 'Status: Licensed to ' + name
          : 'Status: Unlicensed';
        statusText.style.color = licensed ? 'var(--success, #4caf50)' : 'var(--text2)';
      }
      if (activateBtn)   activateBtn.hidden   = licensed;
      if (deactivateBtn) deactivateBtn.hidden = !licensed;
      if (keyInput)      keyInput.hidden      = licensed;
      if (banner) banner.hidden = licensed;
    }

    if (activateBtn) {
      activateBtn.addEventListener('click', async function () {
        if (errorEl) errorEl.textContent = '';
        if (successEl) successEl.setAttribute('hidden', '');

        var key = keyInput ? keyInput.value.trim() : '';
        var result = await License.activate(key);

        if (result.success) {
          if (successEl) { successEl.textContent = result.message; successEl.removeAttribute('hidden'); }
          if (keyInput) keyInput.value = '';
          updateLicenseDisplay();
        } else {
          if (errorEl) errorEl.textContent = result.message;
        }
      });
    }

    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', function () {
        if (!confirm('Deactivate your license? Restrictions will apply.')) return;
        License.deactivate();
        if (successEl) successEl.setAttribute('hidden', '');
        if (errorEl) errorEl.textContent = '';
        updateLicenseDisplay();
      });
    }

    License.onStateChange(function () { updateLicenseDisplay(); });
    updateLicenseDisplay();
  }

  function navigateToScreen(screenId) {
    document.querySelectorAll('.screen').forEach(function (s) { s.setAttribute('hidden', ''); });
    var target = document.getElementById(screenId);
    if (target) target.removeAttribute('hidden');
    document.querySelectorAll('.nav-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-screen') === screenId);
    });
    currentScreen = screenId;
    refreshScreenData(screenId);
    initDatePickers();
  }

  function refreshScreenData(screenId) {
    switch (screenId) {
      case 'monthly-screen':       if (typeof Monthly       !== 'undefined') Monthly.renderMonthlyList();       break;
      case 'guest-screen':         if (typeof GuestPlay     !== 'undefined') GuestPlay.renderGuestList();       break;
      case 'members-screen':       if (typeof Members       !== 'undefined') Members.renderMemberList();        break;
      case 'contributions-screen': if (typeof Contributions !== 'undefined') Contributions.renderContribList(); break;
      case 'expenses-screen':      if (typeof Expenses      !== 'undefined') Expenses.renderExpenseList();      break;
      case 'history-screen':       if (typeof PaymentHistory!== 'undefined') PaymentHistory.renderHistory();    break;
      case 'reports-screen':       if (typeof Reports       !== 'undefined') Reports.renderActiveReport();      break;
    }
  }

  function setupTabNavigation() {
    document.querySelectorAll('.nav-tab').forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        e.preventDefault();
        var screenId = tab.getAttribute('data-screen');
        if (screenId) navigateToScreen(screenId);
      });
    });
    navigateToScreen(currentScreen);
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(function (reg) { console.log('SW registered:', reg.scope); })
        .catch(function (err) { console.log('SW failed:', err); });
    }
  }

  document.addEventListener('DOMContentLoaded', initApp);
  return { initApp, navigateToScreen };
})();
