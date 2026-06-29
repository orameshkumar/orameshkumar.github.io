/**
 * backup.js - Backup & Restore Module for ABC Provisional Store
 *
 * Provides backup creation (JSON export with all IndexedDB + localStorage data)
 * and restore functionality (import from JSON file).
 * Exposes a global Backup object via IIFE pattern.
 */

const Backup = (function () {
  'use strict';

  var SETTINGS_STORAGE_KEY = 'abcstore_upi_settings';
  var LAST_BACKUP_KEY = 'abcstore_lastBackupDate';
  var APP_VERSION = '2.0';

  // ─── Initialization ─────────────────────────────────────────────────────────

  /**
   * Initialize the Backup module.
   * Renders the backup section in the Settings screen.
   */
  function init() {
    renderBackupSection();
  }

  // ─── Backup Creation ────────────────────────────────────────────────────────

  /**
   * Create a full backup of all application data and trigger a browser download.
   * Reads items, bills, and templates from IndexedDB and settings from localStorage.
   * Generates a JSON file named abc-store-backup-YYYY-MM-DD.json.
   * Stores lastBackupDate in localStorage on success.
   *
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async function createBackup() {
    try {
      // Read all data from IndexedDB
      var items = await DB.getAllItems();
      var bills = await DB.getAllBills();
      var templates = await DB.getAllTemplates();

      // Read settings from localStorage
      var settings = null;
      try {
        var raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          settings = JSON.parse(raw);
        }
      } catch (e) {
        settings = null;
      }

      // Assemble backup object
      var backupDate = new Date().toISOString();
      var backupData = {
        metadata: {
          backupDate: backupDate,
          appVersion: APP_VERSION
        },
        items: items || [],
        bills: bills || [],
        templates: templates || [],
        settings: settings || {}
      };

      // Create JSON blob
      var jsonString = JSON.stringify(backupData, null, 2);
      var blob = new Blob([jsonString], { type: 'application/json' });

      // Generate filename with today's date
      var today = new Date();
      var year = today.getFullYear();
      var month = String(today.getMonth() + 1).padStart(2, '0');
      var day = String(today.getDate()).padStart(2, '0');
      var filename = 'abc-store-backup-' + year + '-' + month + '-' + day + '.json';

      // Trigger browser download using a temporary anchor element
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();

      // Cleanup
      setTimeout(function () {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 100);

      // Store last backup date in localStorage
      localStorage.setItem(LAST_BACKUP_KEY, backupDate);

      return { success: true, message: 'Backup created successfully.' };
    } catch (error) {
      console.error('Backup: Failed to create backup', error);
      return { success: false, message: 'Failed to create backup: ' + error.message };
    }
  }

  // ─── Restore ──────────────────────────────────────────────────────────────────

  /**
   * Restore application data from a backup JSON file.
   * Validates file size (≤ 50 MB), JSON structure, and required fields.
   * Clears all existing data before importing from the backup.
   *
   * @param {File} file - The backup JSON file selected by the user
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async function restoreFromBackup(file) {
    try {
      // 1. Check file size — max 50 MB
      var MAX_SIZE = 50 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        alert('File is too large (maximum 50 MB)');
        return { success: false, message: 'File is too large (maximum 50 MB)' };
      }

      // 2. Read the file as text using FileReader
      var text = await _readFileAsText(file);

      // 3. Parse the JSON
      var backup;
      try {
        backup = JSON.parse(text);
      } catch (e) {
        alert('Invalid backup file');
        return { success: false, message: 'Invalid backup file' };
      }

      // 4. Validate structure — must have items (array), bills (array), settings (object)
      if (
        !backup ||
        !Array.isArray(backup.items) ||
        !Array.isArray(backup.bills) ||
        typeof backup.settings !== 'object' ||
        backup.settings === null ||
        Array.isArray(backup.settings)
      ) {
        alert('Invalid backup file. Please select a valid ABC Store backup.');
        return { success: false, message: 'Invalid backup file. Please select a valid ABC Store backup.' };
      }

      // 5. Show confirmation dialog
      var confirmed = confirm('This will replace all current data. Continue?');

      // 6. If user cancels, return without action
      if (!confirmed) {
        return { success: false, message: 'Restore cancelled by user.' };
      }

      // 7. Import data
      // Clear all IndexedDB stores
      await DB.clearStore('items');
      await DB.clearStore('bills');
      await DB.clearStore('templates');

      // Import items
      for (var i = 0; i < backup.items.length; i++) {
        await DB.addItem(backup.items[i]);
      }

      // Import bills
      for (var j = 0; j < backup.bills.length; j++) {
        await DB.saveBill(backup.bills[j]);
      }

      // Import templates (optional in backup)
      if (Array.isArray(backup.templates)) {
        for (var k = 0; k < backup.templates.length; k++) {
          await DB.addTemplate(backup.templates[k]);
        }
      }

      // Import settings
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(backup.settings));

      // 8. Reload the application
      window.location.reload();

      // 9. Return success (may not be reached due to reload)
      return { success: true, message: 'Restore completed' };
    } catch (error) {
      console.error('Backup: Failed to restore from backup', error);
      alert('Restore failed: ' + error.message);
      return { success: false, message: 'Restore failed: ' + error.message };
    }
  }

  /**
   * Helper: Read a File object as text using FileReader.
   * @param {File} file - The file to read
   * @returns {Promise<string>} The file contents as text
   */
  function _readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        resolve(e.target.result);
      };
      reader.onerror = function () {
        reject(new Error('Failed to read file'));
      };
      reader.readAsText(file);
    });
  }

  // ─── Backup Section UI ───────────────────────────────────────────────────────

  /**
   * Render the "Backup / Restore" section in the Settings screen.
   * Injects a section below existing content (after template manager section)
   * with: last backup date display, Create Backup button, Restore button,
   * and a hidden file input for the restore file picker.
   */
  function renderBackupSection() {
    var settingsScreen = document.getElementById('settings-screen');
    if (!settingsScreen) return;

    var screenContent = settingsScreen.querySelector('.screen-content');
    if (!screenContent) return;

    // Remove existing backup section if present
    var existing = document.getElementById('backup-section');
    if (existing) existing.remove();

    var section = document.createElement('div');
    section.id = 'backup-section';
    section.style.cssText = 'margin-top:24px;';

    // Get last backup date
    var lastBackup = getLastBackupDate();
    var lastBackupDisplay = lastBackup ? lastBackup : 'Never';

    // Build section HTML
    section.innerHTML =
      '<h2 class="section-heading" style="margin-bottom:12px;">Backup / Restore</h2>' +
      '<p id="backup-last-date" style="font-size:0.8rem;color:var(--color-text-secondary);margin-bottom:12px;">Last backup: ' + lastBackupDisplay + '</p>' +
      '<button id="create-backup-btn" class="btn-primary" style="width:100%;margin-bottom:8px;">Create Backup</button>' +
      '<button id="restore-backup-btn" class="btn-secondary" style="width:100%;">Restore from Backup</button>' +
      '<input type="file" id="backup-file-input" accept=".json" style="display:none;">';

    // Append to settings form area (below existing content, after template manager)
    var settingsForm = screenContent.querySelector('.settings-form');
    if (settingsForm) {
      settingsForm.appendChild(section);
    } else {
      screenContent.appendChild(section);
    }

    // Wire "Create Backup" button
    var createBtn = document.getElementById('create-backup-btn');
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        var result = await createBackup();
        if (result.success) {
          // Update the displayed last backup date immediately
          var dateEl = document.getElementById('backup-last-date');
          if (dateEl) {
            var updatedDate = getLastBackupDate();
            dateEl.textContent = 'Last backup: ' + (updatedDate ? updatedDate : 'Never');
          }
        }
      });
    }

    // Wire "Restore from Backup" button to trigger hidden file input
    var restoreBtn = document.getElementById('restore-backup-btn');
    var fileInput = document.getElementById('backup-file-input');

    if (restoreBtn && fileInput) {
      restoreBtn.addEventListener('click', function () {
        fileInput.value = ''; // Reset so same file can be selected again
        fileInput.click();
      });

      // Wire file input change event to call restoreFromBackup(file)
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length > 0) {
          restoreFromBackup(fileInput.files[0]);
        }
      });
    }
  }

  // ─── Last Backup Date ───────────────────────────────────────────────────────

  /**
   * Get the last backup date from localStorage.
   * @returns {string|null} Formatted date string (locale format) or null if no backup exists
   */
  function getLastBackupDate() {
    try {
      var dateStr = localStorage.getItem(LAST_BACKUP_KEY);
      if (dateStr) {
        var date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
    } catch (e) {
      console.error('Backup: Failed to read last backup date', e);
    }
    return null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    init: init,
    createBackup: createBackup,
    restoreFromBackup: restoreFromBackup,
    renderBackupSection: renderBackupSection,
    getLastBackupDate: getLastBackupDate
  };

})();
