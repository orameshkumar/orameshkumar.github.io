// Client Master module — CRUD operations for client records

var ClientMaster = (function() {
  'use strict';

  var editingClientId = null;

  /**
   * Initialize the Client Master module.
   * Sets up event listeners and renders the initial client list.
   */
  function init() {
    var addBtn = document.getElementById('add-client-btn');
    var cancelBtn = document.getElementById('client-cancel-btn');
    var clientForm = document.getElementById('client-form');
    var amountInput = document.getElementById('client-amount');
    var durationInput = document.getElementById('client-duration');
    var startDateInput = document.getElementById('client-start-date');
    var searchInput = document.getElementById('client-search');

    if (addBtn) {
      addBtn.addEventListener('click', showAddForm);
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', hideForm);
    }

    if (clientForm) {
      clientForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleFormSubmit();
      });
    }

    // Auto-recalculate EMI and End Date when amount or duration changes
    if (amountInput) {
      amountInput.addEventListener('input', autoRecalculate);
    }
    if (durationInput) {
      durationInput.addEventListener('input', autoRecalculate);
    }
    if (startDateInput) {
      startDateInput.addEventListener('input', autoRecalculate);
    }

    // Search filter
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        renderClientList(searchInput.value.trim());
      });
    }

    // Import/Export buttons
    var exportBtn = document.getElementById('export-clients-btn');
    var importBtn = document.getElementById('import-clients-btn');
    var importFile = document.getElementById('import-clients-file');

    if (exportBtn) {
      exportBtn.addEventListener('click', exportClients);
    }
    if (importBtn) {
      importBtn.addEventListener('click', function() {
        if (importFile) importFile.click();
      });
    }
    if (importFile) {
      importFile.addEventListener('change', handleImportFile);
    }

    renderClientList();
  }

  /**
   * Auto-recalculate EMI and End Date based on current form values.
   */
  function autoRecalculate() {
    var amount = parseFloat(document.getElementById('client-amount').value);
    var duration = parseInt(document.getElementById('client-duration').value, 10);
    var startDate = document.getElementById('client-start-date').value;
    var emiInput = document.getElementById('client-emi');
    var endDateInput = document.getElementById('client-end-date');

    if (!isNaN(amount) && amount > 0 && !isNaN(duration) && duration > 0) {
      emiInput.value = calculateEMI(amount, duration);
    }

    if (startDate && !isNaN(duration) && duration > 0) {
      endDateInput.value = calculateEndDate(startDate, duration);
    }
  }

  /**
   * Render the list of all clients as card elements.
   */
  async function renderClientList(searchTerm) {
    var listContainer = document.getElementById('client-list');
    if (!listContainer) return;

    try {
      var clients = await DB.getAllClients();

      if (!clients || clients.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">No clients added yet. Tap + to add a client.</p>';
        return;
      }

      // Filter by search term
      if (searchTerm) {
        var lowerSearch = searchTerm.toLowerCase();
        clients = clients.filter(function(c) {
          return c.name.toLowerCase().indexOf(lowerSearch) !== -1;
        });
      }

      if (clients.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">No clients match your search.</p>';
        return;
      }

      // Sort alphabetically by name
      clients.sort(function(a, b) {
        return a.name.localeCompare(b.name);
      });

      var html = '';
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        html += renderClientCard(client);
      }

      listContainer.innerHTML = html;

      // Attach edit/delete event listeners
      clients.forEach(function(client) {
        var editBtn = document.getElementById('edit-' + client.id);
        var deleteBtn = document.getElementById('delete-' + client.id);

        if (editBtn) {
          editBtn.addEventListener('click', function() {
            showEditForm(client.id);
          });
        }
        if (deleteBtn) {
          deleteBtn.addEventListener('click', function() {
            deleteClient(client.id);
          });
        }
      });
    } catch (e) {
      listContainer.innerHTML = '<p class="empty-message">Could not load data. Please try again.</p>';
      console.error('Error rendering client list:', e);
    }
  }

  /**
   * Render a single client card HTML.
   */
  function renderClientCard(client) {
    var amount = typeof client.totalAmount === 'number' ? '₹' + client.totalAmount.toFixed(2) : '';
    return '<div class="client-card">' +
      '<div class="client-info">' +
        '<div class="client-name">' + escapeHtml(client.name) + '</div>' +
        '<div class="client-details">' + escapeHtml(client.mobile) + ' | ' + amount + '</div>' +
      '</div>' +
      '<div class="client-actions">' +
        '<button id="edit-' + client.id + '" class="btn-edit" aria-label="Edit ' + escapeHtml(client.name) + '">✏️</button>' +
        '<button id="delete-' + client.id + '" class="btn-delete" aria-label="Delete ' + escapeHtml(client.name) + '">🗑️</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * Show the add client form with defaults.
   */
  function showAddForm() {
    editingClientId = null;
    clearForm();

    var formTitle = document.getElementById('client-form-title');
    if (formTitle) formTitle.textContent = 'Add Client';

    var durationInput = document.getElementById('client-duration');
    if (durationInput) durationInput.value = '100';

    var startDateInput = document.getElementById('client-start-date');
    if (startDateInput) startDateInput.value = getTodayISO();

    var formContainer = document.getElementById('client-form-container');
    if (formContainer) formContainer.removeAttribute('hidden');

    var addBtn = document.getElementById('add-client-btn');
    if (addBtn) addBtn.style.display = 'none';
  }

  /**
   * Show the edit form pre-filled with client data.
   */
  async function showEditForm(id) {
    try {
      var client = await DB.getClient(id);
      if (!client) {
        alert('Client not found.');
        return;
      }

      editingClientId = id;
      clearErrors();

      var formTitle = document.getElementById('client-form-title');
      if (formTitle) formTitle.textContent = 'Edit Client';

      document.getElementById('client-id').value = client.id;
      document.getElementById('client-name').value = client.name || '';
      document.getElementById('client-mobile').value = client.mobile || '';
      document.getElementById('client-amount').value = client.totalAmount || '';
      document.getElementById('client-start-date').value = client.startDate || '';
      document.getElementById('client-duration').value = client.duration || '';
      document.getElementById('client-emi').value = client.emi || '';
      document.getElementById('client-end-date').value = client.endDate || '';

      var formContainer = document.getElementById('client-form-container');
      if (formContainer) formContainer.removeAttribute('hidden');

      var addBtn = document.getElementById('add-client-btn');
      if (addBtn) addBtn.style.display = 'none';
    } catch (e) {
      alert('Error loading client: ' + e.message);
    }
  }

  /**
   * Hide the form and show the FAB button again.
   */
  function hideForm() {
    var formContainer = document.getElementById('client-form-container');
    if (formContainer) formContainer.setAttribute('hidden', '');

    var addBtn = document.getElementById('add-client-btn');
    if (addBtn) addBtn.style.display = '';

    editingClientId = null;
    clearForm();
  }

  /**
   * Handle form submission — validate and save.
   */
  async function handleFormSubmit() {
    clearErrors();

    var data = {
      name: (document.getElementById('client-name').value || '').trim(),
      mobile: (document.getElementById('client-mobile').value || '').trim(),
      totalAmount: parseFloat(document.getElementById('client-amount').value),
      startDate: document.getElementById('client-start-date').value,
      duration: parseInt(document.getElementById('client-duration').value, 10),
      emi: parseFloat(document.getElementById('client-emi').value)
    };

    var errors = await validateForm(data);
    if (errors.length > 0) {
      displayErrors(errors);
      return;
    }

    // Calculate EMI if not manually set
    if (isNaN(data.emi) || data.emi <= 0) {
      data.emi = calculateEMI(data.totalAmount, data.duration);
    }

    data.endDate = calculateEndDate(data.startDate, data.duration);

    await saveClient(data);
  }

  /**
   * Validate client form data.
   * @returns {Array} Array of {field, message} objects
   */
  async function validateForm(data) {
    var errors = [];

    // Mandatory fields
    if (!data.name || data.name === '') {
      errors.push({ field: 'client-name', message: 'Client Name is required.' });
    }

    if (!data.mobile || data.mobile === '') {
      errors.push({ field: 'client-mobile', message: 'Mobile number is required.' });
    } else if (!/^\d{10}$/.test(data.mobile.replace(/\s/g, ''))) {
      errors.push({ field: 'client-mobile', message: 'Enter exactly 10 digits (spaces allowed).' });
    }

    if (isNaN(data.totalAmount) || data.totalAmount <= 0) {
      errors.push({ field: 'client-amount', message: 'Amount must be greater than zero.' });
    }

    if (!data.startDate) {
      errors.push({ field: 'client-start-date', message: 'Collection start date is required.' });
    }

    if (isNaN(data.duration) || data.duration <= 0) {
      errors.push({ field: 'client-duration', message: 'Duration must be at least 1 day.' });
    }

    // Check name uniqueness
    if (data.name && data.name !== '') {
      try {
        var allClients = await DB.getAllClients();
        var normalizedName = data.name.toLowerCase();
        var duplicate = allClients.find(function(c) {
          if (editingClientId && c.id === editingClientId) return false;
          return c.name.trim().toLowerCase() === normalizedName;
        });
        if (duplicate) {
          errors.push({ field: 'client-name', message: 'Client name already exists.' });
        }
      } catch (e) {
        // Skip uniqueness check on DB error
      }
    }

    return errors;
  }

  /**
   * Save a client (add or update).
   */
  async function saveClient(data) {
    try {
      if (editingClientId) {
        var clientRecord = {
          id: editingClientId,
          name: data.name,
          mobile: data.mobile.replace(/\s/g, ''),
          totalAmount: data.totalAmount,
          startDate: data.startDate,
          duration: data.duration,
          emi: data.emi,
          endDate: data.endDate,
          createdAt: undefined
        };

        // Preserve original createdAt
        var existing = await DB.getClient(editingClientId);
        if (existing) {
          clientRecord.createdAt = existing.createdAt;
        } else {
          clientRecord.createdAt = new Date().toISOString();
        }

        await DB.updateClient(clientRecord);
      } else {
        var newClient = {
          id: generateUUID(),
          name: data.name,
          mobile: data.mobile.replace(/\s/g, ''),
          totalAmount: data.totalAmount,
          startDate: data.startDate,
          duration: data.duration,
          emi: data.emi,
          endDate: data.endDate,
          createdAt: new Date().toISOString()
        };

        await DB.addClient(newClient);
      }

      hideForm();
      renderClientList();
    } catch (e) {
      var errorMsg = e.message || 'Failed to save client.';
      alert(errorMsg);
      console.error('Save client error:', e);
    }
  }

  /**
   * Delete a client after confirmation, including all associated payments.
   */
  async function deleteClient(id) {
    try {
      var client = await DB.getClient(id);
      if (!client) {
        alert('Client not found.');
        return;
      }

      var confirmed = confirm('Are you sure you want to delete "' + client.name + '"? This will also delete all payment records for this client.');
      if (!confirmed) return;

      await DB.deletePaymentsByClient(id);
      await DB.deleteClient(id);
      renderClientList();
    } catch (e) {
      alert('Could not delete client: ' + (e.message || 'Unknown error'));
      console.error('Delete client error:', e);
    }
  }

  /**
   * Calculate EMI: amount / duration, rounded to 2 decimal places.
   */
  function calculateEMI(amount, duration) {
    if (!amount || !duration || duration <= 0) return 0;
    return Math.round((amount / duration) * 100) / 100;
  }

  /**
   * Calculate end date: startDate + duration days.
   * @returns {string} ISO date string (YYYY-MM-DD)
   */
  function calculateEndDate(startDate, duration) {
    if (!startDate || !duration) return '';
    var date = new Date(startDate);
    date.setDate(date.getDate() + duration);
    return date.toISOString().split('T')[0];
  }

  // ─── Helper Functions ───

  function clearForm() {
    var form = document.getElementById('client-form');
    if (form) form.reset();
    document.getElementById('client-id').value = '';
    clearErrors();
  }

  function clearErrors() {
    var errorElements = document.querySelectorAll('#client-form .error-message');
    errorElements.forEach(function(el) { el.textContent = ''; });
  }

  function displayErrors(errors) {
    errors.forEach(function(error) {
      var errorEl = document.getElementById(error.field + '-error');
      if (errorEl) {
        errorEl.textContent = error.message;
      }
    });
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getTodayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }

  /**
   * Export all client records as a CSV file download.
   */
  async function exportClients() {
    try {
      var clients = await DB.getAllClients();
      if (!clients || clients.length === 0) {
        alert('No clients to export.');
        return;
      }

      // CSV header
      var csv = 'Client Name,Mobile Number,Total Borrowed Amount,Collection Start Date,Duration (days),EMI,End Date\n';

      // CSV rows
      for (var i = 0; i < clients.length; i++) {
        var c = clients[i];
        csv += '"' + (c.name || '').replace(/"/g, '""') + '",';
        csv += '"' + (c.mobile || '') + '",';
        csv += (c.totalAmount || 0) + ',';
        csv += '"' + (c.startDate || '') + '",';
        csv += (c.duration || 100) + ',';
        csv += (c.emi || 0) + ',';
        csv += '"' + (c.endDate || '') + '"\n';
      }

      // Create and trigger download
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'clients_' + getTodayISO() + '.csv');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + (e.message || 'Unknown error'));
      console.error('Export error:', e);
    }
  }

  /**
   * Handle the file input change for importing clients from CSV.
   * @param {Event} event - The change event from the file input
   */
  function handleImportFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      var content = e.target.result;
      importClients(content);
    };
    reader.onerror = function() {
      alert('Could not read the file. Please try again.');
    };
    reader.readAsText(file);

    // Reset file input so same file can be re-selected
    event.target.value = '';
  }

  /**
   * Parse CSV content and import client records.
   * Skips duplicates (by name, case-insensitive).
   * @param {string} csvContent - Raw CSV text
   */
  async function importClients(csvContent) {
    try {
      var lines = csvContent.split(/\r?\n/).filter(function(line) {
        return line.trim() !== '';
      });

      if (lines.length < 2) {
        alert('CSV file is empty or has no data rows.');
        return;
      }

      // Skip header row
      var dataLines = lines.slice(1);
      var existingClients = await DB.getAllClients();
      var existingNames = existingClients.map(function(c) {
        return c.name.trim().toLowerCase();
      });

      var imported = 0;
      var skipped = 0;
      var errors = 0;

      for (var i = 0; i < dataLines.length; i++) {
        var fields = parseCSVLine(dataLines[i]);
        if (fields.length < 4) {
          errors++;
          continue;
        }

        var name = fields[0].trim();
        var mobile = fields[1].trim();
        var amount = parseFloat(fields[2]);
        var startDate = fields[3].trim();
        var duration = fields[4] ? parseInt(fields[4], 10) : 100;
        var emi = fields[5] ? parseFloat(fields[5]) : 0;

        // Validate essentials
        if (!name || !mobile || isNaN(amount) || amount <= 0 || !startDate) {
          errors++;
          continue;
        }

        // Skip duplicates
        if (existingNames.indexOf(name.toLowerCase()) !== -1) {
          skipped++;
          continue;
        }

        // Calculate EMI and endDate if not provided
        if (!emi || emi <= 0) {
          emi = calculateEMI(amount, duration);
        }
        var endDate = calculateEndDate(startDate, duration);

        var client = {
          id: generateUUID(),
          name: name,
          mobile: mobile,
          totalAmount: amount,
          startDate: startDate,
          duration: duration,
          emi: emi,
          endDate: endDate,
          createdAt: new Date().toISOString()
        };

        await DB.addClient(client);
        existingNames.push(name.toLowerCase());
        imported++;
      }

      var msg = 'Import complete: ' + imported + ' added';
      if (skipped > 0) msg += ', ' + skipped + ' duplicates skipped';
      if (errors > 0) msg += ', ' + errors + ' rows with errors';
      alert(msg);

      renderClientList();
    } catch (e) {
      alert('Import failed: ' + (e.message || 'Unknown error'));
      console.error('Import error:', e);
    }
  }

  /**
   * Parse a single CSV line handling quoted fields.
   * @param {string} line - A single CSV row
   * @returns {Array<string>} Array of field values
   */
  function parseCSVLine(line) {
    var fields = [];
    var current = '';
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  }

  return {
    init: init,
    renderClientList: renderClientList,
    showAddForm: showAddForm,
    showEditForm: showEditForm,
    validateForm: validateForm,
    saveClient: saveClient,
    deleteClient: deleteClient,
    calculateEMI: calculateEMI,
    calculateEndDate: calculateEndDate,
    exportClients: exportClients,
    importClients: importClients
  };
})();
