var App = (function () {
  'use strict';
  var currentScreen = 'members-screen';

  async function initApp() {
    try {
      Settings.applyTheme();
      await DB.init();
      Settings.init();
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
