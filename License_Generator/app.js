(function() {
  'use strict';

  // --- Theme Engine ---
  var THEME_KEY = 'license_gen_theme';
  var VALID_THEMES = ['dark', 'light', 'purple'];
  var DEFAULT_THEME = 'dark';

  function _getStoredTheme() {
    try {
      var stored = localStorage.getItem(THEME_KEY);
      if (stored && VALID_THEMES.indexOf(stored) !== -1) {
        return stored;
      }
    } catch (e) { /* localStorage unavailable */ }
    return DEFAULT_THEME;
  }

  function _setStoredTheme(themeId) {
    try {
      localStorage.setItem(THEME_KEY, themeId);
    } catch (e) { /* fail silently */ }
  }

  function _applyTheme(themeId) {
    if (VALID_THEMES.indexOf(themeId) === -1) {
      themeId = DEFAULT_THEME;
    }
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-purple');
    document.body.classList.add('theme-' + themeId);
    _setStoredTheme(themeId);

    // Update meta theme-color for mobile browsers
    var metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      var bgColors = { dark: '#1e1e1e', light: '#f5f5f5', purple: '#1a0033' };
      metaThemeColor.setAttribute('content', bgColors[themeId]);
    }
  }

  // Apply stored theme immediately on load
  _applyTheme(_getStoredTheme());

  // --- Constants ---
  var STORAGE_KEY = 'license_gen_apps';
  var DEFAULT_APPS = [
    { name: "Pay Up Partners", secret: [80,85,80,95,76,73,67,95,50,48,50,53,95,36,101,99,114,51,116,95,75,51,121,33] },
    { name: "ABC Store", secret: [65,66,67,95,76,73,67,95,50,48,50,53,95,36,116,48,114,51,95,75,51,121,33] }
  ];

  // Protected app names that cannot be modified or deleted (case-insensitive)
  var PROTECTED_APPS = ["pay up partners", "abc store"];

  // --- Registry Functions ---

  function _loadRegistry() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function _saveRegistry(registry) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
    } catch (e) {
      console.error('Failed to save app registry:', e);
    }
  }

  function _seedDefaults() {
    _saveRegistry(DEFAULT_APPS.slice());
    return DEFAULT_APPS.slice();
  }

  function _getRegistry() {
    var registry = _loadRegistry();
    if (!registry || registry.length === 0) {
      registry = _seedDefaults();
    }
    return registry;
  }

  function _populateAppDropdown() {
    var select = document.getElementById('app-select');
    if (!select) return;
    var registry = _getRegistry();
    select.innerHTML = '';
    for (var i = 0; i < registry.length; i++) {
      var option = document.createElement('option');
      option.value = i;
      option.textContent = registry[i].name;
      select.appendChild(option);
    }
  }

  function _addApp(name, secretStr) {
    if (!name || !name.trim()) {
      alert('Please enter an application name.');
      return false;
    }
    if (!secretStr || !secretStr.trim()) {
      alert('Please enter a secret string.');
      return false;
    }
    name = name.trim();
    secretStr = secretStr.trim();

    // Check for duplicate app name (case-insensitive)
    var registry = _getRegistry();
    var nameLower = name.toLowerCase();
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].name.toLowerCase() === nameLower) {
        alert('An application named "' + registry[i].name + '" already exists. Please use a different name.');
        return false;
      }
    }

    var secretArray = secretStr.split('').map(function(c) { return c.charCodeAt(0); });
    registry.push({ name: name, secret: secretArray });
    _saveRegistry(registry);
    _populateAppDropdown();
    // Select the newly added app
    var select = document.getElementById('app-select');
    if (select) select.value = registry.length - 1;
    return true;
  }

  function _removeApp(index) {
    var registry = _getRegistry();
    if (index < 0 || index >= registry.length) return false;
    var appName = registry[index].name;

    // Prevent deletion of protected apps
    if (PROTECTED_APPS.indexOf(appName.toLowerCase()) !== -1) {
      alert('"' + appName + '" is a protected application and cannot be removed.');
      return false;
    }

    if (!confirm('Remove "' + appName + '" from the registry?')) return false;
    registry.splice(index, 1);
    if (registry.length === 0) {
      registry = _seedDefaults();
    } else {
      _saveRegistry(registry);
    }
    _populateAppDropdown();
    return true;
  }

  // --- HMAC-SHA256 via Web Crypto API ---

  function _getSecretFromCodes(codes) {
    return codes.map(function(c) { return String.fromCharCode(c); }).join('');
  }

  async function hmacHex(message, secretCodes) {
    var secret = _getSecretFromCodes(secretCodes);
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

  // --- Generate License Key ---

  async function generateLicense(name, secretCodes) {
    var hash = await hmacHex(name, secretCodes);
    var payload = JSON.stringify({ n: name, h: hash });
    return btoa(payload);
  }

  // --- History Manager ---

  var HISTORY_KEY = 'license_gen_history';
  var MAX_HISTORY = 500;

  function _loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.warn('Corrupted history data in localStorage:', e);
      return [];
    }
  }

  function _saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      return true;
    } catch (e) {
      return false;
    }
  }

  function _addHistoryEntry(appName, userName, licenseKey) {
    var entry = {
      appName: appName,
      userName: userName,
      licenseKey: licenseKey,
      timestamp: new Date().toISOString()
    };
    var history = _loadHistory();
    if (history.length >= MAX_HISTORY) {
      // Remove oldest entry (earliest timestamp)
      var oldestIndex = 0;
      for (var i = 1; i < history.length; i++) {
        if (history[i].timestamp < history[oldestIndex].timestamp) {
          oldestIndex = i;
        }
      }
      history.splice(oldestIndex, 1);
    }
    history.push(entry);
    return _saveHistory(history);
  }

  function _deleteHistoryEntry(index) {
    var history = _loadHistory();
    if (index < 0 || index >= history.length) return false;
    history.splice(index, 1);
    return _saveHistory(history);
  }

  function _clearAppHistory(appName) {
    var history = _loadHistory();
    var filtered = history.filter(function(entry) {
      return entry.appName !== appName;
    });
    return _saveHistory(filtered);
  }

  function _getGroupedHistory() {
    var history = _loadHistory();
    var groups = {};
    for (var i = 0; i < history.length; i++) {
      var entry = history[i];
      if (!groups[entry.appName]) {
        groups[entry.appName] = [];
      }
      groups[entry.appName].push(entry);
    }
    // Sort entries within each group by timestamp descending (newest first)
    var appNames = Object.keys(groups);
    for (var j = 0; j < appNames.length; j++) {
      groups[appNames[j]].sort(function(a, b) {
        return a.timestamp < b.timestamp ? 1 : (a.timestamp > b.timestamp ? -1 : 0);
      });
    }
    // Sort groups alphabetically by appName (case-insensitive)
    appNames.sort(function(a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    var sorted = {};
    for (var k = 0; k < appNames.length; k++) {
      sorted[appNames[k]] = groups[appNames[k]];
    }
    return sorted;
  }

  function _formatDate(isoString) {
    var d = new Date(isoString);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var day = String(d.getDate()).padStart(2, '0');
    return day + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function _truncateKey(key) {
    if (key.length <= 20) return key;
    return key.substring(0, 20) + '\u2026';
  }

  function _showToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'success');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, type === 'error' ? 3000 : 2000);
  }

  // --- Tab Controller ---

  function _switchTab(tabId) {
    var tabs = document.querySelectorAll('[role="tab"]');
    var panels = document.querySelectorAll('[role="tabpanel"]');
    var targetTab = null;

    // Deactivate all tabs
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.remove('active');
      tabs[i].setAttribute('aria-selected', 'false');
      tabs[i].setAttribute('tabindex', '-1');
      if (tabs[i].getAttribute('aria-controls') === tabId) {
        targetTab = tabs[i];
      }
    }

    // Hide all panels
    for (var j = 0; j < panels.length; j++) {
      panels[j].setAttribute('hidden', '');
    }

    // Activate target tab
    if (targetTab) {
      targetTab.classList.add('active');
      targetTab.setAttribute('aria-selected', 'true');
      targetTab.setAttribute('tabindex', '0');
    }

    // Show target panel
    var targetPanel = document.getElementById(tabId);
    if (!targetPanel) return;
    targetPanel.removeAttribute('hidden');

    // If switching to history tab, refresh the history display
    if (tabId === 'panel-history') {
      if (typeof _renderHistory === 'function') _renderHistory();
    }
  }

  function _handleTabKeydown(e) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    var currentIndex = tabs.indexOf(e.currentTarget);
    var newIndex;

    if (e.key === 'ArrowLeft') {
      newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = tabs.length - 1;
      tabs[newIndex].focus();
    } else if (e.key === 'ArrowRight') {
      newIndex = currentIndex + 1;
      if (newIndex >= tabs.length) newIndex = 0;
      tabs[newIndex].focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      var panelId = e.currentTarget.getAttribute('aria-controls');
      _switchTab(panelId);
    }
  }

  function _initTabs() {
    var tabs = document.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function() {
        var panelId = this.getAttribute('aria-controls');
        _switchTab(panelId);
      });
      tabs[i].addEventListener('keydown', _handleTabKeydown);
    }
  }

  // --- History Renderer ---

  function _renderHistory() {
    var historyList = document.querySelector('.history-list');
    var historyEmpty = document.querySelector('.history-empty');
    if (!historyList || !historyEmpty) return;

    var grouped = _getGroupedHistory();
    var appNames = Object.keys(grouped);

    if (appNames.length === 0) {
      historyEmpty.style.display = '';
      historyList.style.display = 'none';
      return;
    }

    historyEmpty.style.display = 'none';
    historyList.style.display = '';
    historyList.innerHTML = '';

    for (var i = 0; i < appNames.length; i++) {
      var groupEl = _renderAppGroup(appNames[i], grouped[appNames[i]]);
      historyList.appendChild(groupEl);
    }
  }

  function _renderAppGroup(appName, entries) {
    var group = document.createElement('div');
    group.className = 'history-group';

    var header = document.createElement('div');
    header.className = 'history-group-header';

    var heading = document.createElement('h3');
    heading.textContent = appName;
    header.appendChild(heading);

    var clearBtn = document.createElement('button');
    clearBtn.className = 'btn-danger btn-small';
    clearBtn.textContent = 'Clear All';
    clearBtn.addEventListener('click', function() {
      _clearAllForApp(appName);
    });
    header.appendChild(clearBtn);

    group.appendChild(header);

    var fullHistory = _loadHistory();

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      // Find the global index by matching timestamp + appName + userName
      var globalIndex = -1;
      for (var j = 0; j < fullHistory.length; j++) {
        if (fullHistory[j].timestamp === entry.timestamp &&
            fullHistory[j].appName === entry.appName &&
            fullHistory[j].userName === entry.userName) {
          globalIndex = j;
          break;
        }
      }
      var entryEl = _renderHistoryEntry(entry, globalIndex);
      group.appendChild(entryEl);
    }

    return group;
  }

  function _renderHistoryEntry(entry, idx) {
    var entryDiv = document.createElement('div');
    entryDiv.className = 'history-entry collapsed';
    entryDiv.setAttribute('data-index', idx);

    var summary = document.createElement('div');
    summary.className = 'entry-summary';

    var userSpan = document.createElement('span');
    userSpan.className = 'entry-user';
    userSpan.textContent = entry.userName;

    var keySpan = document.createElement('span');
    keySpan.className = 'entry-key-preview';
    keySpan.textContent = _truncateKey(entry.licenseKey);

    var dateSpan = document.createElement('span');
    dateSpan.className = 'entry-date';
    dateSpan.textContent = _formatDate(entry.timestamp);

    // Inline delete button - visible in collapsed state
    var inlineDeleteBtn = document.createElement('button');
    inlineDeleteBtn.className = 'btn-inline-delete';
    inlineDeleteBtn.setAttribute('aria-label', 'Delete entry');
    inlineDeleteBtn.textContent = '🗑️';
    inlineDeleteBtn.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent expand/collapse toggle
      _deleteFromHistory(idx);
    });

    summary.appendChild(userSpan);
    summary.appendChild(keySpan);
    summary.appendChild(dateSpan);
    summary.appendChild(inlineDeleteBtn);
    entryDiv.appendChild(summary);

    entryDiv.addEventListener('click', function(e) {
      if (e.target.closest('.btn-inline-delete')) return;
      if (e.target.closest('.entry-actions')) return;
      _toggleEntry(entryDiv);
    });

    return entryDiv;
  }

  function _toggleEntry(entryEl) {
    if (entryEl.classList.contains('collapsed')) {
      entryEl.classList.remove('collapsed');
      entryEl.classList.add('expanded');

      var details = document.createElement('div');
      details.className = 'entry-details';

      var textarea = document.createElement('textarea');
      textarea.className = 'entry-full-key';
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('rows', '3');
      textarea.value = entryEl.querySelector('.entry-key-preview').textContent;

      // Get the full key from the data index
      var idx = entryEl.getAttribute('data-index');
      var history = _loadHistory();
      var histIdx = parseInt(idx, 10);
      if (histIdx >= 0 && histIdx < history.length) {
        textarea.value = history[histIdx].licenseKey;
      }

      details.appendChild(textarea);

      var actions = document.createElement('div');
      actions.className = 'entry-actions';

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-danger btn-small btn-delete';
      deleteBtn.textContent = '\ud83d\uddd1\ufe0f Delete';
      deleteBtn.addEventListener('click', function() {
        _deleteFromHistory(idx);
      });

      actions.appendChild(deleteBtn);
      details.appendChild(actions);

      entryEl.appendChild(details);
    } else if (entryEl.classList.contains('expanded')) {
      entryEl.classList.remove('expanded');
      entryEl.classList.add('collapsed');

      var existingDetails = entryEl.querySelector('.entry-details');
      if (existingDetails) {
        existingDetails.remove();
      }
    }
  }

  function _copyFromHistory(licenseKey, btn) {
    var originalText = btn.textContent;
    navigator.clipboard.writeText(licenseKey).then(function() {
      btn.textContent = '\u2705 Copied!';
      setTimeout(function() { btn.textContent = originalText; }, 2000);
    }).catch(function() {
      btn.textContent = '\u274c Copy failed';
      setTimeout(function() { btn.textContent = originalText; }, 2000);
    });
  }

  function _deleteFromHistory(index) {
    if (!confirm('Delete this license entry?')) return;
    _deleteHistoryEntry(parseInt(index, 10));
    _renderHistory();
  }

  function _clearAllForApp(appName) {
    if (!confirm('Clear all history for "' + appName + '"?')) return;
    _clearAppHistory(appName);
    _renderHistory();
  }

  // --- DOM Ready ---

  // DOM elements
  var nameInput = document.getElementById('user-name');
  var generateBtn = document.getElementById('generate-btn');
  var outputSection = document.getElementById('output-section');
  var licenseOutput = document.getElementById('license-output');
  var copyBtn = document.getElementById('copy-btn');
  var statusMsg = document.getElementById('status-msg');
  var appSelect = document.getElementById('app-select');
  var appNameLabel = document.getElementById('app-name-label');
  var addAppBtn = document.getElementById('add-app-btn');
  var removeAppBtn = document.getElementById('remove-app-btn');
  var addAppName = document.getElementById('add-app-name');
  var addAppSecret = document.getElementById('add-app-secret');

  // Initialize app dropdown
  _populateAppDropdown();

  // Theme switcher
  var themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = _getStoredTheme();
    themeSelect.addEventListener('change', function() {
      _applyTheme(this.value);
    });
  }

  // Generate button click
  generateBtn.addEventListener('click', async function() {
    var name = (nameInput.value || '').trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    var registry = _getRegistry();
    var selectedIndex = parseInt(appSelect.value, 10);
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= registry.length) {
      alert('Please select an application.');
      return;
    }

    var selectedApp = registry[selectedIndex];

    try {
      var key = await generateLicense(name, selectedApp.secret);
      licenseOutput.value = key;
      // Save to history
      var saved = _addHistoryEntry(selectedApp.name, name, key);
      if (!saved) {
        _showToast('\u26a0\ufe0f History entry could not be saved.', 'error');
      }
      outputSection.removeAttribute('hidden');
      // Display selected app name alongside generated key
      if (appNameLabel) {
        appNameLabel.textContent = 'Generated for: ' + selectedApp.name;
        appNameLabel.removeAttribute('hidden');
      }
      statusMsg.setAttribute('hidden', '');
    } catch (e) {
      alert('Error generating license: ' + e.message);
    }
  });

  // Copy button click
  copyBtn.addEventListener('click', async function() {
    var text = licenseOutput.value;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      statusMsg.textContent = '✅ Copied to clipboard!';
      statusMsg.removeAttribute('hidden');
      setTimeout(function() { statusMsg.setAttribute('hidden', ''); }, 3000);
    } catch (e) {
      // Fallback
      licenseOutput.select();
      document.execCommand('copy');
      statusMsg.textContent = '✅ Copied to clipboard!';
      statusMsg.removeAttribute('hidden');
      setTimeout(function() { statusMsg.setAttribute('hidden', ''); }, 3000);
    }
  });

  // Add App button click
  if (addAppBtn) {
    addAppBtn.addEventListener('click', function() {
      var name = addAppName ? addAppName.value : '';
      var secret = addAppSecret ? addAppSecret.value : '';
      if (_addApp(name, secret)) {
        if (addAppName) addAppName.value = '';
        if (addAppSecret) addAppSecret.value = '';
      }
    });
  }

  // Remove App button click
  if (removeAppBtn) {
    removeAppBtn.addEventListener('click', function() {
      var selectedIndex = parseInt(appSelect.value, 10);
      _removeApp(selectedIndex);
    });
  }

  // Allow Enter key to generate
  nameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      generateBtn.click();
    }
  });

  // Initialize tab navigation
  _initTabs();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function(reg) {
      console.log('SW registered:', reg.scope);
    }).catch(function(err) {
      console.log('SW registration failed:', err);
    });
  }
})();
