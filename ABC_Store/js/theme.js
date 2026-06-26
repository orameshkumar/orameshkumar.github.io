/**
 * theme.js - Theme Engine Module for ABC Store
 *
 * Manages five color themes (Light, Dark, Ocean Blue, Forest Green, Royal Purple)
 * through CSS custom properties. Handles theme switching, persistence via localStorage,
 * system preference detection, and toast notifications.
 */

const Theme_Engine = (function() {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  var STORAGE_KEY = 'abc_theme';
  var THEMES = {
    'light': {
      id: 'light',
      label: 'Light',
      className: '',
      metaColor: '#1a73e8',
      bg: '#f5f5f5',
      accent: '#1a73e8'
    },
    'dark': {
      id: 'dark',
      label: 'Dark',
      className: 'theme-dark',
      metaColor: '#1f1f1f',
      bg: '#121212',
      accent: '#8ab4f8'
    },
    'ocean-blue': {
      id: 'ocean-blue',
      label: 'Ocean Blue',
      className: 'theme-ocean-blue',
      metaColor: '#0d47a1',
      bg: '#0a1929',
      accent: '#4fc3f7'
    },
    'forest-green': {
      id: 'forest-green',
      label: 'Forest Green',
      className: 'theme-forest-green',
      metaColor: '#1b5e20',
      bg: '#1a2e1a',
      accent: '#ffd54f'
    },
    'royal-purple': {
      id: 'royal-purple',
      label: 'Royal Purple',
      className: 'theme-royal-purple',
      metaColor: '#4a148c',
      bg: '#1a0033',
      accent: '#ce93d8'
    }
  };
  var DEFAULT_THEME = 'light';
  var _currentTheme = DEFAULT_THEME;

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Persist theme ID to localStorage. Fails silently if storage is unavailable.
   * @param {string} themeId - The theme identifier to store
   */
  function _persist(themeId) {
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch (e) {
      // Silent failure — localStorage may be unavailable (private browsing, quota)
    }
  }

  /**
   * Load stored theme ID from localStorage.
   * @returns {string|null} The stored theme ID if valid, otherwise null
   */
  function _loadStored() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && THEMES[stored]) {
        return stored;
      }
      return null;
    } catch (e) {
      // localStorage unavailable
      return null;
    }
  }

  /**
   * Detect system color scheme preference.
   * @returns {string} 'dark' if system prefers dark mode, 'light' otherwise
   */
  function _detectSystemPref() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (e) {
      // matchMedia unavailable
    }
    return 'light';
  }

  /**
   * Listen for system color scheme changes.
   * Only reacts if no manual theme selection is stored.
   */
  function _listenSystemChange() {
    try {
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      var handler = function(event) {
        // Only react if no manual selection is stored
        if (_loadStored() === null) {
          if (event.matches) {
            applyTheme('dark');
          } else {
            applyTheme('light');
          }
        }
      };
      // Use addEventListener (modern) or addListener (legacy)
      if (mql.addEventListener) {
        mql.addEventListener('change', handler);
      } else if (mql.addListener) {
        mql.addListener(handler);
      }
    } catch (e) {
      // matchMedia unavailable — skip system preference listening
    }
  }

  /**
   * Render theme selector UI in the Settings screen.
   * Injects a radiogroup of theme swatches into the Settings screen's .screen-content.
   */
  function _renderSelector() {
    var settingsScreen = document.querySelector('#settings-screen .screen-content');
    if (!settingsScreen) {
      console.warn('Theme_Engine: Settings screen content container not found');
      return;
    }

    // Remove existing theme section if present
    var existing = document.getElementById('theme-section');
    if (existing) {
      existing.remove();
    }

    // Create the theme section container
    var section = document.createElement('div');
    section.id = 'theme-section';
    section.className = 'theme-section';

    // Add section heading
    var heading = document.createElement('h2');
    heading.className = 'section-heading';
    heading.textContent = 'App Theme';
    section.appendChild(heading);

    // Create radiogroup container
    var radiogroup = document.createElement('div');
    radiogroup.className = 'theme-selector';
    radiogroup.setAttribute('role', 'radiogroup');
    radiogroup.setAttribute('aria-label', 'Choose app theme');

    // Create swatches for each theme
    var themeKeys = Object.keys(THEMES);
    for (var i = 0; i < themeKeys.length; i++) {
      var theme = THEMES[themeKeys[i]];
      var isActive = (theme.id === _currentTheme);

      var button = document.createElement('button');
      button.className = 'theme-swatch';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
      button.setAttribute('aria-label', theme.label);
      button.setAttribute('data-theme', theme.id);
      button.setAttribute('tabindex', isActive ? '0' : '-1');

      // Swatch color preview
      var swatchColors = document.createElement('span');
      swatchColors.className = 'swatch-colors';

      var swatchBg = document.createElement('span');
      swatchBg.className = 'swatch-bg';
      swatchBg.style.background = theme.bg;

      var swatchAccent = document.createElement('span');
      swatchAccent.className = 'swatch-accent';
      swatchAccent.style.background = theme.accent;

      swatchColors.appendChild(swatchBg);
      swatchColors.appendChild(swatchAccent);
      button.appendChild(swatchColors);

      // Swatch label
      var label = document.createElement('span');
      label.className = 'swatch-label';
      label.textContent = theme.label;
      button.appendChild(label);

      // Checkmark indicator
      var check = document.createElement('span');
      check.className = 'swatch-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '\u2713';
      button.appendChild(check);

      radiogroup.appendChild(button);
    }

    section.appendChild(radiogroup);

    // Append section to settings screen content (before the last element if any, or at the end)
    if (settingsScreen.lastElementChild) {
      settingsScreen.insertBefore(section, settingsScreen.lastElementChild);
    } else {
      settingsScreen.appendChild(section);
    }

    // Attach click handlers to swatches
    var swatches = radiogroup.querySelectorAll('.theme-swatch');
    for (var j = 0; j < swatches.length; j++) {
      swatches[j].addEventListener('click', _handleSwatchClick);
    }

    // Attach keyboard navigation handler to the radiogroup
    radiogroup.addEventListener('keydown', _handleSwatchKeydown);
  }

  /**
   * Handle click on a theme swatch.
   * Applies the theme and updates aria-checked/tabindex on all swatches.
   * @param {Event} event - The click event
   */
  function _handleSwatchClick(event) {
    var button = event.currentTarget;
    var themeId = button.getAttribute('data-theme');
    if (!themeId) return;

    var success = applyTheme(themeId);
    if (!success) {
      showToast('Could not apply theme', 'error');
      return;
    }

    _updateSwatchStates(button);
  }

  /**
   * Handle keyboard navigation within the theme selector radiogroup.
   * ArrowLeft/ArrowUp → previous swatch, ArrowRight/ArrowDown → next swatch (wrap around).
   * Enter/Space → select the focused swatch.
   * @param {KeyboardEvent} event - The keydown event
   */
  function _handleSwatchKeydown(event) {
    var key = event.key;
    var radiogroup = event.currentTarget;
    var swatches = radiogroup.querySelectorAll('.theme-swatch');
    if (!swatches.length) return;

    // Find the currently focused swatch
    var currentIndex = -1;
    for (var i = 0; i < swatches.length; i++) {
      if (swatches[i] === document.activeElement) {
        currentIndex = i;
        break;
      }
    }

    if (currentIndex === -1) return;

    var newIndex = currentIndex;

    if (key === 'ArrowRight' || key === 'ArrowDown') {
      event.preventDefault();
      newIndex = (currentIndex + 1) % swatches.length;
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      event.preventDefault();
      newIndex = (currentIndex - 1 + swatches.length) % swatches.length;
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      var themeId = swatches[currentIndex].getAttribute('data-theme');
      var success = applyTheme(themeId);
      if (success) {
        _updateSwatchStates(swatches[currentIndex]);
      } else {
        showToast('Could not apply theme', 'error');
      }
      return;
    } else {
      return;
    }

    // Move focus with roving tabindex
    swatches[currentIndex].setAttribute('tabindex', '-1');
    swatches[newIndex].setAttribute('tabindex', '0');
    swatches[newIndex].focus();
  }

  /**
   * Update aria-checked and tabindex on all swatches to reflect the newly selected one.
   * @param {HTMLElement} activeButton - The swatch that was just selected
   */
  function _updateSwatchStates(activeButton) {
    var radiogroup = activeButton.closest('.theme-selector');
    if (!radiogroup) return;

    var swatches = radiogroup.querySelectorAll('.theme-swatch');
    for (var i = 0; i < swatches.length; i++) {
      if (swatches[i] === activeButton) {
        swatches[i].setAttribute('aria-checked', 'true');
        swatches[i].setAttribute('tabindex', '0');
      } else {
        swatches[i].setAttribute('aria-checked', 'false');
        swatches[i].setAttribute('tabindex', '-1');
      }
    }
  }

  // ─── Public Methods ─────────────────────────────────────────────────────────

  /**
   * Apply a theme by ID. Validates the ID, updates body classes,
   * meta theme-color, and persists the selection.
   * @param {string} themeId - The theme identifier to apply
   * @returns {boolean} True if theme was successfully applied, false otherwise
   */
  function applyTheme(themeId) {
    // Validate theme ID
    if (!themeId || !THEMES[themeId]) {
      return false;
    }

    var theme = THEMES[themeId];

    // Remove all theme classes from body
    var keys = Object.keys(THEMES);
    for (var i = 0; i < keys.length; i++) {
      var cls = THEMES[keys[i]].className;
      if (cls) {
        document.body.classList.remove(cls);
      }
    }

    // Add new theme's class (empty string for Light means no class added)
    if (theme.className) {
      document.body.classList.add(theme.className);
    }

    // Update <meta name="theme-color"> content
    var metaEl = document.querySelector('meta[name="theme-color"]');
    if (metaEl) {
      metaEl.setAttribute('content', theme.metaColor);
    }

    // Persist selection and update state
    _persist(themeId);
    _currentTheme = themeId;

    return true;
  }

  /**
   * Get the currently active theme ID.
   * @returns {string} The current theme identifier
   */
  function getCurrentTheme() {
    return _currentTheme;
  }

  /**
   * Get the full THEMES configuration object.
   * @returns {Object} The themes map
   */
  function getThemes() {
    return THEMES;
  }

  /**
   * Display a toast notification.
   * @param {string} message - The message to display
   * @param {string} type - The toast type: 'success', 'error', or 'info'
   */
  function showToast(message, type) {
    type = type || 'info';

    // Get or create toast container
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }

    // Create toast element
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-dismiss after 3000ms
    setTimeout(function() {
      toast.classList.add('toast-dismiss');

      // Remove element after fade-out transition (300ms)
      setTimeout(function() {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        // Remove container if empty
        if (container && container.children.length === 0 && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Initialize the Theme_Engine.
   * Loads stored theme or detects system preference, applies it,
   * renders the selector, and sets up system change listener.
   */
  function init() {
    var themeId = _loadStored();

    if (!themeId) {
      themeId = _detectSystemPref();
    }

    applyTheme(themeId);
    _renderSelector();
    _listenSystemChange();
  }

  // ─── Expose Public API ────────────────────────────────────────────────────────

  return {
    init: init,
    applyTheme: applyTheme,
    getCurrentTheme: getCurrentTheme,
    getThemes: getThemes,
    showToast: showToast
  };

})();
