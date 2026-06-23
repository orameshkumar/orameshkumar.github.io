// Payment History module — filtering and display of payment records

var PaymentHistory = (function() {
  'use strict';

  /**
   * Initialize the Payment History module.
   * Sets up date filters with defaults and renders initial history.
   */
  function init() {
    var startDateInput = document.getElementById('history-start-date');
    var endDateInput = document.getElementById('history-end-date');
    var filterBtn = document.getElementById('history-filter-btn');

    // Default: start = 30 days ago, end = today
    var today = getTodayISO();
    var thirtyDaysAgo = getDateOffset(-30);

    if (startDateInput && !startDateInput.value) {
      startDateInput.value = thirtyDaysAgo;
    }
    if (endDateInput && !endDateInput.value) {
      endDateInput.value = today;
    }

    if (filterBtn) {
      filterBtn.addEventListener('click', loadAndRenderHistory);
    }

    loadAndRenderHistory();
  }

  /**
   * Load and render payment history based on selected date range.
   */
  async function loadAndRenderHistory() {
    var startDateInput = document.getElementById('history-start-date');
    var endDateInput = document.getElementById('history-end-date');
    var dateError = document.getElementById('history-date-error');
    var listContainer = document.getElementById('history-list');

    if (!listContainer) return;

    var start = startDateInput ? startDateInput.value : '';
    var end = endDateInput ? endDateInput.value : '';

    // Clear previous error
    if (dateError) dateError.textContent = '';

    // Validate date range
    if (!validateDateRange(start, end)) {
      if (dateError) dateError.textContent = 'Start date cannot be after end date.';
      return;
    }

    try {
      var payments = await DB.getPaymentsByDateRange(start, end);

      if (!payments || payments.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">No records found for the selected period.</p>';
        return;
      }

      // Resolve client names and sort by date descending
      var enrichedPayments = [];
      for (var i = 0; i < payments.length; i++) {
        var payment = payments[i];
        var clientName = 'Unknown';
        try {
          var client = await DB.getClient(payment.clientId);
          if (client) clientName = client.name;
        } catch (e) {
          // Use 'Unknown' if client lookup fails
        }
        enrichedPayments.push({
          date: payment.date,
          clientName: clientName,
          amount: payment.amount
        });
      }

      // Sort by date descending
      enrichedPayments.sort(function(a, b) {
        if (a.date > b.date) return -1;
        if (a.date < b.date) return 1;
        return 0;
      });

      // Render as single-line rows
      var html = '';
      for (var j = 0; j < enrichedPayments.length; j++) {
        var p = enrichedPayments[j];
        html += '<div class="history-item">' +
          '<span class="history-date">' + formatDate(p.date) + '</span>' +
          '<span class="history-client">' + escapeHtml(p.clientName) + '</span>' +
          '<span class="history-amount">₹' + p.amount.toFixed(2) + '</span>' +
        '</div>';
      }

      listContainer.innerHTML = html;
    } catch (e) {
      listContainer.innerHTML = '<p class="empty-message">Could not load data. Please try again.</p>';
      console.error('Error loading history:', e);
    }
  }

  /**
   * Validate that start date is not after end date.
   * @param {string} start - Start date ISO string
   * @param {string} end - End date ISO string
   * @returns {boolean} True if valid
   */
  function validateDateRange(start, end) {
    if (!start || !end) return true;
    return start <= end;
  }

  // ─── Helpers ───

  function getTodayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function getDateOffset(days) {
    var date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  function formatDate(isoDate) {
    if (!isoDate) return '';
    var parts = isoDate.split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0]; // DD/MM/YYYY
    }
    return isoDate;
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
    loadAndRenderHistory: loadAndRenderHistory,
    validateDateRange: validateDateRange
  };
})();
