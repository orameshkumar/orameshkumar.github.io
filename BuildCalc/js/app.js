/**
 * app.js - App Module (Main Controller) for BuildCalc
 *
 * Orchestrates initialization, navigation, theme, and unit management.
 * Initializes DB and Config before all tab modules.
 *
 * Dependencies: db.js, config.js, clients.js, projects.js, estimation.js, reports.js, settings.js
 */
'use strict';

const App = (function () {
  var currentUnit = 'imperial';
  var currentTheme = 'dark';

  // ─── Initialization ──────────────────────────────────────────────────────

  function init() {
    // Load theme immediately (before anything else to prevent flash)
    _loadTheme();

    // Register service worker (only on http/https, not file://)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js')
        .then(function (reg) { console.log('SW registered:', reg.scope); })
        .catch(function (err) { console.error('SW registration failed:', err); });
    }

    // Initialize DB → Config → Modules
    DB.init()
      .then(function () {
        return Config.init();
      })
      .then(function () {
        return License.init();
      })
      .then(function () {
        // Initialize all tab modules
        Clients.init();
        Projects.init();
        Estimation.init();
        Reports.init();
        Settings.init();
      })
      .catch(function (err) {
        console.error('App initialization failed:', err);
      });

    // Bind bottom nav
    var navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        navigateTo(tab.getAttribute('data-screen'));
      });
    });

    // Default screen
    navigateTo('clients-screen');
  }

  // ─── Navigation ──────────────────────────────────────────────────────────

  function navigateTo(screenId) {
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function (s) { s.hidden = true; });

    var target = document.getElementById(screenId);
    if (target) { target.hidden = false; }

    // Update active tab
    var navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(function (tab) {
      tab.classList.remove('active');
      tab.removeAttribute('aria-current');
      if (tab.getAttribute('data-screen') === screenId) {
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
      }
    });

    // Refresh data when navigating to certain screens
    if (screenId === 'clients-screen' && Clients.renderList) {
      Clients.renderList();
    } else if (screenId === 'projects-screen' && Projects.renderList) {
      Projects.renderList();
    } else if (screenId === 'reports-screen') {
      // Re-populate report dropdowns when navigating to reports
      var reportClientSelect = document.getElementById('report-client-select');
      var reportProjectSelect = document.getElementById('report-project-select');
      if (reportClientSelect) {
        DB.getAllClients().then(function (clients) {
          clients.sort(function (a, b) {
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          });
          var html = '<option value="">All Clients</option>';
          clients.forEach(function (client) {
            html += '<option value="' + client.id + '">' + escapeHtml(client.name) + '</option>';
          });
          reportClientSelect.innerHTML = html;
        });
      }
      if (reportProjectSelect) {
        DB.getAllProjects().then(function (projects) {
          projects.sort(function (a, b) {
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          });
          var html = '<option value="">All Projects</option>';
          projects.forEach(function (project) {
            html += '<option value="' + project.id + '">' + escapeHtml(project.name) + '</option>';
          });
          reportProjectSelect.innerHTML = html;
        });
      }
    }
  }

  // ─── Unit Management ─────────────────────────────────────────────────────

  function getUnit() { return currentUnit; }

  function setUnit(unit) {
    currentUnit = unit;
    document.dispatchEvent(new CustomEvent('unitchange', { detail: { unit: unit } }));
  }

  // ─── Theme Management ────────────────────────────────────────────────────

  function getTheme() { return currentTheme; }

  function setTheme(theme) {
    currentTheme = theme;
    if (theme === 'dark') {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
    try { localStorage.setItem('buildcalc_theme', theme); } catch (e) {}
  }

  function _loadTheme() {
    try {
      var saved = localStorage.getItem('buildcalc_theme');
      if (saved === 'dark' || saved === 'light') {
        currentTheme = saved;
      }
    } catch (e) {}
    setTheme(currentTheme);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', init);

  return {
    init: init,
    navigateTo: navigateTo,
    getUnit: getUnit,
    setUnit: setUnit,
    getTheme: getTheme,
    setTheme: setTheme
  };
})();
