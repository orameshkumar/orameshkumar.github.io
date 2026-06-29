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
  var _dbReady = false;   // set to true after full init chain completes

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
        CAD.init();
        Workforce.init();
        Schedule.init();
        Procurement.init();

        // Wire inner tabs and navigate — must be INSIDE .then() so DB is ready
        _dbReady = true;
        _initInnerTabs();
        navigateTo('projects-screen');
      })
      .catch(function (err) {
        var app = document.getElementById('app') || document.body;
        app.innerHTML = '<div style="padding:2rem;font-family:sans-serif;color:#c00">' +
          '<h2>BuildCalc failed to start</h2><p>' + err.message + '</p>' +
          '<p>If opening as a local file, try: right-click index.html → Open with Chrome, or use a local server.</p></div>';
      });

    // Bind bottom nav (safe to do synchronously — just attaches listeners)
    var navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        navigateTo(tab.getAttribute('data-screen'));
      });
    });
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

    // Refresh data when navigating — only after DB is fully ready
    if (!_dbReady) return;

    // Refresh the currently active inner panel of the target screen
    var targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      var activeBtn = targetScreen.querySelector('.inner-tab-btn.active');
      if (activeBtn) {
        _onInnerTabActivate(activeBtn.getAttribute('data-inner-tab'));
      } else if (screenId === 'estimation-screen') {
        if (Estimation && Estimation.renderCategories) Estimation.renderCategories();
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


  // ─── Inner Tab Wiring ────────────────────────────────────────────────────

  function _initInnerTabs() {
    // Panels are pre-set in HTML (active=visible, inactive=display:none).
    // Just bind click handlers.
    document.querySelectorAll('.inner-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panelId   = btn.getAttribute('data-inner-tab');
        var tabBar    = btn.parentElement;      // .module-tabs div
        var container = tabBar.parentElement;   // .screen section

        // Update button active state
        tabBar.querySelectorAll('.inner-tab-btn').forEach(function (b) {
          b.classList.remove('active');
          b.removeAttribute('aria-selected');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        // Show target panel, hide siblings
        container.querySelectorAll('.inner-tab-panel').forEach(function (p) {
          p.style.display = (p.id === panelId) ? 'block' : 'none';
        });

        // Refresh data
        if (_dbReady) _onInnerTabActivate(panelId);
      });
    });
  }

  function _onInnerTabActivate(panelId) {
    if (panelId === 'cad-panel') {
      if (CAD && CAD.updateProjectNotice) CAD.updateProjectNotice();
    } else if (panelId === 'reports-panel') {
      var rcs = document.getElementById('report-client-select');
      var rps = document.getElementById('report-project-select');
      if (rcs) DB.getAllClients().then(function(cl) {
        cl.sort(function(a,b){return a.name.localeCompare(b.name);});
        var h = '<option value="">All Clients</option>';
        cl.forEach(function(c){ h += '<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>'; });
        rcs.innerHTML = h;
      });
      if (rps) DB.getAllProjects().then(function(pr) {
        pr.sort(function(a,b){return a.name.localeCompare(b.name);});
        var h = '<option value="">All Projects</option>';
        pr.forEach(function(p){ h += '<option value="'+p.id+'">'+escapeHtml(p.name)+'</option>'; });
        rps.innerHTML = h;
      });
    } else if (panelId === 'schedule-panel') {
      if (Schedule && Schedule.refresh) Schedule.refresh();
    } else if (panelId === 'procurement-panel') {
      if (Procurement && Procurement.refresh) Procurement.refresh();
    } else if (panelId === 'clients-panel') {
      if (Clients && Clients.renderList) Clients.renderList();
    } else if (panelId === 'projects-panel') {
      if (Projects && Projects.renderList) Projects.renderList();
    } else if (panelId === 'estimate-panel') {
      if (Estimation && Estimation.renderCategories) Estimation.renderCategories();
    } else if (panelId === 'workers-panel') {
      if (Workforce && Workforce.renderList) Workforce.renderList();
    }
  }

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', init);

  // ── Global project context setter ───────────────────────────────────────
  function setProjectContext(projectId) {
    if (typeof Estimation  !== 'undefined') Estimation.setProject(projectId);
    if (typeof CAD         !== 'undefined') CAD.setProject(projectId);
    if (typeof Schedule    !== 'undefined') Schedule.setProject(projectId);
    if (typeof Procurement !== 'undefined') Procurement.setProject(projectId);
    // Sync all inline no-project selectors to the chosen project
    document.querySelectorAll('.no-project-select').forEach(function(sel) {
      sel.value = projectId;
    });
  }

  return {
    init: init,
    navigateTo: navigateTo,
    setProjectContext: setProjectContext,
    getUnit: getUnit,
    setUnit: setUnit,
    getTheme: getTheme,
    setTheme: setTheme
  };
})();
