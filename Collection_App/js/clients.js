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
  async function renderClientList() {
    var listContainer = document.getElementById('client-list');
    if (!listContainer) return;

    try {
      var clients = await DB.getAllClients();

      if (!clients || clients.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">No clients added yet. Tap + to add a client.</p>';
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
    } else if (!/^\d{10}$/.test(data.mobile)) {
      errors.push({ field: 'client-mobile', message: 'Enter exactly 10 digits.' });
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
          mobile: data.mobile,
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
          mobile: data.mobile,
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

  return {
    init: init,
    renderClientList: renderClientList,
    showAddForm: showAddForm,
    showEditForm: showEditForm,
    validateForm: validateForm,
    saveClient: saveClient,
    deleteClient: deleteClient,
    calculateEMI: calculateEMI,
    calculateEndDate: calculateEndDate
  };
})();
