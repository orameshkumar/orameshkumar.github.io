// Daily Collection module — manages daily payment collection and QR code generation

var Collection = (function() {
  'use strict';

  // Track clients who have been paid on the currently selected date
  var paidClientsToday = {};

  /**
   * Initialize the Daily Collection module.
   * Sets up date selector and renders the collection list.
   */
  function init() {
    var dateInput = document.getElementById('collection-date');
    var searchInput = document.getElementById('collection-search');
    var paidFilter = document.getElementById('collection-filter-paid');

    if (dateInput) {
      // Default to today
      if (!dateInput.value) {
        dateInput.value = getTodayISO();
      }
      dateInput.addEventListener('change', function() {
        paidClientsToday = {}; // Reset paid tracking on date change
        renderCollectionList(dateInput.value);
      });
    }

    // Search filter
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        var currentDate = dateInput ? dateInput.value : getTodayISO();
        renderCollectionList(currentDate);
      });
    }

    // Paid today filter
    if (paidFilter) {
      paidFilter.addEventListener('change', function() {
        var currentDate = dateInput ? dateInput.value : getTodayISO();
        renderCollectionList(currentDate);
      });
    }

    // Payment modal buttons
    var confirmBtn = document.getElementById('confirm-payment-btn');
    var cancelBtn = document.getElementById('cancel-payment-btn');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', handleConfirmPayment);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', hidePaymentModal);
    }

    renderCollectionList(getTodayISO());
  }

  /**
   * Render the list of clients with pending payments for the given date.
   * Clients who have already paid on the selected date are highlighted.
   * Supports search by client name and "paid today" filter.
   * @param {string} date - ISO date string (YYYY-MM-DD)
   */
  async function renderCollectionList(date) {
    var listContainer = document.getElementById('collection-list');
    if (!listContainer) return;

    // Get filter values
    var searchInput = document.getElementById('collection-search');
    var paidFilter = document.getElementById('collection-filter-paid');
    var searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var showPaidOnly = paidFilter ? paidFilter.checked : false;

    try {
      var clients = await DB.getAllClients();

      if (!clients || clients.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">No clients added yet.</p>';
        return;
      }

      // Calculate pending for each client, check if paid today
      var pendingClients = [];
      for (var i = 0; i < clients.length; i++) {
        var payments = await DB.getPaymentsByClient(clients[i].id);
        var totalPaid = 0;
        var hasPaidOnDate = false;
        for (var k = 0; k < payments.length; k++) {
          totalPaid += payments[k].amount;
          if (payments[k].date === date) {
            hasPaidOnDate = true;
          }
        }
        var pending = clients[i].totalAmount - totalPaid;
        pending = pending > 0 ? Math.round(pending * 100) / 100 : 0;

        if (pending > 0) {
          pendingClients.push({
            client: clients[i],
            pending: pending,
            paidToday: hasPaidOnDate || !!paidClientsToday[clients[i].id]
          });
        }
      }

      // Apply search filter
      if (searchTerm) {
        pendingClients = pendingClients.filter(function(item) {
          return item.client.name.toLowerCase().indexOf(searchTerm) !== -1;
        });
      }

      // Apply "not paid today" filter
      if (showPaidOnly) {
        pendingClients = pendingClients.filter(function(item) {
          return !item.paidToday;
        });
      }

      if (pendingClients.length === 0) {
        var msg = searchTerm || showPaidOnly
          ? 'No clients match your filter.'
          : 'No pending collections for this date.';
        listContainer.innerHTML = '<p class="empty-message">' + msg + '</p>';
        return;
      }

      // Sort alphabetically by client name
      pendingClients.sort(function(a, b) {
        return a.client.name.localeCompare(b.client.name);
      });

      var html = '';
      for (var j = 0; j < pendingClients.length; j++) {
        var item = pendingClients[j];
        var emi = item.client.emi || 0;
        // EMI should not exceed pending
        var defaultAmount = Math.min(emi, item.pending);

        var itemClass = 'collection-item' + (item.paidToday ? ' collection-item-paid' : '');

        html += '<div class="' + itemClass + '">' +
          '<div class="collection-info">' +
            '<div class="collection-client-name">' + escapeHtml(item.client.name) + '</div>' +
            '<div class="collection-pending">Pending: ₹' + item.pending.toFixed(2) + '</div>' +
            (item.paidToday ? '<div class="collection-paid-badge">✓ Paid today</div>' : '') +
          '</div>' +
          '<input type="number" class="collection-emi-input" ' +
            'id="emi-input-' + item.client.id + '" ' +
            'value="' + defaultAmount.toFixed(2) + '" ' +
            'min="1" max="' + item.pending.toFixed(2) + '" ' +
            'step="0.01" ' +
            'aria-label="Payment amount for ' + escapeHtml(item.client.name) + '">' +
          '<button class="btn-collect" ' +
            'data-client-id="' + item.client.id + '" ' +
            'data-client-name="' + escapeHtml(item.client.name) + '" ' +
            'aria-label="Collect payment from ' + escapeHtml(item.client.name) + '">Collect</button>' +
        '</div>';
      }

      listContainer.innerHTML = html;

      // Attach click handlers to collect buttons
      var collectBtns = listContainer.querySelectorAll('.btn-collect');
      collectBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var clientId = btn.getAttribute('data-client-id');
          var emiInput = document.getElementById('emi-input-' + clientId);
          var amount = parseFloat(emiInput ? emiInput.value : 0);
          showPaymentPage(clientId, amount);
        });
      });
    } catch (e) {
      listContainer.innerHTML = '<p class="empty-message">Could not load data. Please try again.</p>';
      console.error('Error rendering collection list:', e);
    }
  }

  /**
   * Show the payment modal with QR code for a client.
   * @param {string} clientId - Client ID
   * @param {number} amount - Payment amount
   */
  async function showPaymentPage(clientId, amount) {
    var upiId = Settings.getUpiId();
    if (!upiId) {
      alert('Please configure UPI ID in Settings first.');
      return;
    }

    var appName = Settings.getAppName();

    try {
      var client = await DB.getClient(clientId);
      if (!client) {
        alert('Client not found.');
        return;
      }

      var modal = document.getElementById('payment-modal');
      var clientNameEl = document.getElementById('payment-client-name');
      var amountInput = document.getElementById('payment-amount');
      var amountError = document.getElementById('payment-amount-error');

      if (clientNameEl) clientNameEl.textContent = client.name;
      if (amountInput) amountInput.value = amount.toFixed(2);
      if (amountError) amountError.textContent = '';

      // Store clientId on the modal for confirmation
      if (modal) {
        modal.setAttribute('data-client-id', clientId);
        modal.removeAttribute('hidden');
      }

      // Generate QR code
      generateQRCode(upiId, appName, amount, client.name);
    } catch (e) {
      alert('Error loading client: ' + e.message);
    }
  }

  /**
   * Generate a UPI QR code and display it in the container.
   * @param {string} upiId - UPI ID
   * @param {string} appName - Application name (payee name)
   * @param {number} amount - Payment amount
   * @param {string} clientName - Client name for transaction note
   */
  function generateQRCode(upiId, appName, amount, clientName) {
    var container = document.getElementById('qr-code-container');
    if (!container) return;

    var upiLink = 'upi://pay?pa=' + upiId +
      '&pn=' + encodeURIComponent(appName) +
      '&am=' + amount.toFixed(2) +
      '&cu=INR' +
      '&tn=' + encodeURIComponent(clientName);

    try {
      // Use qrcode-generator library
      var qr = qrcode(0, 'M');
      qr.addData(upiLink);
      qr.make();

      container.innerHTML = qr.createSvgTag(4, 0);
    } catch (e) {
      // Fallback: show tappable link
      console.error('QR code generation failed:', e);
      container.innerHTML = '<a href="' + escapeHtml(upiLink) + '" class="qr-fallback-link" ' +
        'aria-label="Open UPI payment link">Tap to pay via UPI</a>';
    }
  }

  /**
   * Handle the confirm payment button click.
   */
  async function handleConfirmPayment() {
    var modal = document.getElementById('payment-modal');
    var amountInput = document.getElementById('payment-amount');
    var amountError = document.getElementById('payment-amount-error');
    var dateInput = document.getElementById('collection-date');

    if (!modal || !amountInput) return;

    var clientId = modal.getAttribute('data-client-id');
    var amount = parseFloat(amountInput.value);
    var date = dateInput ? dateInput.value : getTodayISO();

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      if (amountError) amountError.textContent = 'Amount must be greater than zero.';
      return;
    }

    if (amountError) amountError.textContent = '';

    await confirmPayment(clientId, date, amount);
  }

  /**
   * Record a payment in the database.
   * @param {string} clientId - Client ID
   * @param {string} date - Payment date (ISO)
   * @param {number} amount - Payment amount
   */
  async function confirmPayment(clientId, date, amount) {
    try {
      var payment = {
        id: generateUUID(),
        clientId: clientId,
        date: date,
        amount: amount,
        createdAt: new Date().toISOString()
      };

      await DB.addPayment(payment);

      // Track this client as paid today for highlight
      paidClientsToday[clientId] = true;

      hidePaymentModal();

      // Refresh the collection list
      var dateInput = document.getElementById('collection-date');
      renderCollectionList(dateInput ? dateInput.value : getTodayISO());
    } catch (e) {
      alert('Payment could not be saved: ' + (e.message || 'Unknown error'));
      console.error('Confirm payment error:', e);
    }
  }

  /**
   * Calculate the pending amount for a client.
   * @param {Object} client - Client record
   * @returns {Promise<number>} Pending amount
   */
  async function calculatePending(client) {
    try {
      var payments = await DB.getPaymentsByClient(client.id);
      var totalPaid = 0;
      for (var i = 0; i < payments.length; i++) {
        totalPaid += payments[i].amount;
      }
      var pending = client.totalAmount - totalPaid;
      return pending > 0 ? Math.round(pending * 100) / 100 : 0;
    } catch (e) {
      return client.totalAmount;
    }
  }

  /**
   * Hide the payment modal.
   */
  function hidePaymentModal() {
    var modal = document.getElementById('payment-modal');
    if (modal) {
      modal.setAttribute('hidden', '');
      modal.removeAttribute('data-client-id');
    }

    var container = document.getElementById('qr-code-container');
    if (container) container.innerHTML = '';
  }

  // ─── Helpers ───

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
    renderCollectionList: renderCollectionList,
    showPaymentPage: showPaymentPage,
    generateQRCode: generateQRCode,
    confirmPayment: confirmPayment,
    calculatePending: calculatePending
  };
})();
