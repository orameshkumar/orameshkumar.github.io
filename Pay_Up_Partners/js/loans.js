const Loans = (function() {
  'use strict';

  var currentClientId = null;
  var editingLoanId = null;
  var _closingLoanId = null;

  function calculateEMI(amount, duration) {
    if (!amount || !duration || duration <= 0) return 0;
    return Math.round((amount / duration) * 100) / 100;
  }

  function calculateEndDate(startDate, duration) {
    if (!startDate || !duration) return '';
    var d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + duration);
    return d.toISOString().split('T')[0];
  }

  function calculateInterestEMI(amount, rate) {
    if (!amount || !rate) return 0;
    return Math.round((amount * rate / 100) * 100) / 100;
  }

  function _calculateOutstanding(loan, payments) {
    if (loan.loanType === 'daily_emi') {
      return Math.max(0, Math.round((loan.totalAmount - payments.reduce(function(s, p) { return s + p.amount; }, 0)) * 100) / 100);
    } else {
      return Math.max(0, loan.principalBalance || 0);
    }
  }

  function formatCurrency(amount) {
    return '₹' + Math.max(0, amount).toFixed(2);
  }

  function _renderClosureModal(loan, client, outstanding) {
    var clientNameEl = document.getElementById('closure-client-name');
    var detailsEl = document.getElementById('closure-loan-details');
    var outstandingEl = document.getElementById('closure-outstanding');
    var errorEl = document.getElementById('closure-error');
    var modalEl = document.getElementById('closure-modal');

    if (clientNameEl) clientNameEl.textContent = (client && client.name) ? client.name : 'Unknown';

    var html = '';
    var typeLabel = loan.loanType === 'daily_emi' ? 'Daily EMI' : 'Interest Only';
    html += '<div class="detail-row"><span class="detail-label">Loan Type</span><span class="detail-value">' + typeLabel + '</span></div>';
    html += '<div class="detail-row"><span class="detail-label">Total Amount</span><span class="detail-value">' + formatCurrency(loan.totalAmount) + '</span></div>';
    html += '<div class="detail-row"><span class="detail-label">Start Date</span><span class="detail-value">' + (loan.startDate || '-') + '</span></div>';
    html += '<div class="detail-row"><span class="detail-label">EMI</span><span class="detail-value">' + formatCurrency(loan.emi || 0) + '</span></div>';

    if (loan.loanType === 'daily_emi') {
      html += '<div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">' + (loan.duration || '-') + ' days</span></div>';
      html += '<div class="detail-row"><span class="detail-label">End Date</span><span class="detail-value">' + (loan.endDate || '-') + '</span></div>';
    } else {
      html += '<div class="detail-row"><span class="detail-label">Interest Rate</span><span class="detail-value">' + (loan.interestRate || 0) + '%</span></div>';
    }

    if (loan.notes && loan.notes.trim()) {
      html += '<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">' + loan.notes + '</span></div>';
    }

    if (detailsEl) detailsEl.innerHTML = html;
    if (outstandingEl) outstandingEl.innerHTML = 'Outstanding Amount: ' + formatCurrency(outstanding);
    if (errorEl) errorEl.textContent = '';
    if (modalEl) modalEl.removeAttribute('hidden');
  }

  function _dismissClosureModal() {
    var modalEl = document.getElementById('closure-modal');
    if (modalEl) modalEl.setAttribute('hidden', '');
    _closingLoanId = null;
  }

  async function _confirmClosure() {
    if (!_closingLoanId) return;
    try {
      var loan = await DB.getLoan(_closingLoanId);
      if (!loan) { alert('Loan not found.'); _dismissClosureModal(); return; }
      loan.status = 'closed';
      await DB.updateLoan(loan);
      _dismissClosureModal();
      if (typeof ClientMaster !== 'undefined' && ClientMaster.renderClientList) ClientMaster.renderClientList();
    } catch(e) {
      var errorEl = document.getElementById('closure-error');
      if (errorEl) errorEl.textContent = 'Could not close loan: ' + e.message;
    }
  }

  function init() {
    var loanForm = document.getElementById('loan-form');
    var loanTypeSelect = document.getElementById('loan-type');
    var loanAmountInput = document.getElementById('loan-amount');
    var loanDurationInput = document.getElementById('loan-duration');
    var loanRateInput = document.getElementById('loan-interest-rate');
    var loanStartInput = document.getElementById('loan-start-date');
    var cancelBtn = document.getElementById('loan-cancel-btn');

    if (loanForm) loanForm.addEventListener('submit', function(e) { e.preventDefault(); handleLoanFormSubmit(); });
    if (cancelBtn) cancelBtn.addEventListener('click', hideLoanForm);
    if (loanTypeSelect) loanTypeSelect.addEventListener('change', function() { toggleLoanTypeFields(loanTypeSelect.value); autoRecalc(); });
    if (loanAmountInput) loanAmountInput.addEventListener('input', autoRecalc);
    if (loanDurationInput) loanDurationInput.addEventListener('input', autoRecalc);
    if (loanRateInput) loanRateInput.addEventListener('input', autoRecalc);
    if (loanStartInput) loanStartInput.addEventListener('input', autoRecalc);

    var closureConfirmBtn = document.getElementById('closure-confirm-btn');
    var closureCancelBtn = document.getElementById('closure-cancel-btn');
    if (closureConfirmBtn) closureConfirmBtn.addEventListener('click', _confirmClosure);
    if (closureCancelBtn) closureCancelBtn.addEventListener('click', _dismissClosureModal);
  }

  function toggleLoanTypeFields(type) {
    var durationGroup = document.getElementById('loan-duration-group');
    var rateGroup = document.getElementById('loan-rate-group');
    if (type === 'interest_only') {
      if (durationGroup) durationGroup.setAttribute('hidden', '');
      if (rateGroup) rateGroup.removeAttribute('hidden');
    } else {
      if (durationGroup) durationGroup.removeAttribute('hidden');
      if (rateGroup) rateGroup.setAttribute('hidden', '');
    }
  }

  function autoRecalc() {
    var type = (document.getElementById('loan-type') || {}).value || 'daily_emi';
    var amount = parseFloat((document.getElementById('loan-amount') || {}).value) || 0;
    var emiInput = document.getElementById('loan-emi');
    var endDateInput = document.getElementById('loan-end-date');

    if (type === 'interest_only') {
      var rate = parseFloat((document.getElementById('loan-interest-rate') || {}).value) || 0;
      if (emiInput && amount > 0 && rate > 0) emiInput.value = calculateInterestEMI(amount, rate);
    } else {
      var duration = parseInt((document.getElementById('loan-duration') || {}).value, 10) || 0;
      var startDate = (document.getElementById('loan-start-date') || {}).value || '';
      if (emiInput && amount > 0 && duration > 0) emiInput.value = calculateEMI(amount, duration);
      if (endDateInput && startDate && duration > 0) endDateInput.value = calculateEndDate(startDate, duration);
    }
  }

  function showAddLoanForm(clientId) {
    currentClientId = clientId;
    editingLoanId = null;
    var container = document.getElementById('loan-form-container');
    var title = document.getElementById('loan-form-title');
    var form = document.getElementById('loan-form');
    if (form) form.reset();
    if (title) title.textContent = 'Add Loan';
    var typeSelect = document.getElementById('loan-type');
    if (typeSelect) typeSelect.value = 'daily_emi';
    toggleLoanTypeFields('daily_emi');
    var durationInput = document.getElementById('loan-duration');
    if (durationInput) durationInput.value = '100';
    var startInput = document.getElementById('loan-start-date');
    if (startInput) startInput.value = new Date().toISOString().split('T')[0];
    if (container) container.removeAttribute('hidden');
    clearLoanErrors();
  }

  async function showEditLoanForm(loanId) {
    var loan = await DB.getLoan(loanId);
    if (!loan) { alert('Loan not found.'); return; }
    currentClientId = loan.clientId;
    editingLoanId = loanId;
    var container = document.getElementById('loan-form-container');
    var title = document.getElementById('loan-form-title');
    if (title) title.textContent = 'Edit Loan';
    document.getElementById('loan-type').value = loan.loanType;
    document.getElementById('loan-amount').value = loan.totalAmount;
    document.getElementById('loan-start-date').value = loan.startDate || '';
    document.getElementById('loan-duration').value = loan.duration || '';
    document.getElementById('loan-interest-rate').value = loan.interestRate || '';
    document.getElementById('loan-emi').value = loan.emi || '';
    document.getElementById('loan-end-date').value = loan.endDate || '';
    document.getElementById('loan-notes').value = loan.notes || '';
    toggleLoanTypeFields(loan.loanType);
    if (container) container.removeAttribute('hidden');
    clearLoanErrors();
  }

  async function handleLoanFormSubmit() {
    clearLoanErrors();
    var type = (document.getElementById('loan-type') || {}).value;
    var amount = parseFloat((document.getElementById('loan-amount') || {}).value);
    var startDate = (document.getElementById('loan-start-date') || {}).value;
    var duration = parseInt((document.getElementById('loan-duration') || {}).value, 10);
    var rate = parseFloat((document.getElementById('loan-interest-rate') || {}).value);
    var emi = parseFloat((document.getElementById('loan-emi') || {}).value);
    var notes = ((document.getElementById('loan-notes') || {}).value || '').trim();

    // Validate
    var errors = [];
    if (isNaN(amount) || amount <= 0) errors.push({ field: 'loan-amount', msg: 'Amount must be greater than zero.' });
    if (!startDate) errors.push({ field: 'loan-start-date', msg: 'Start date is required.' });
    if (type === 'daily_emi') {
      if (isNaN(duration) || duration <= 0) errors.push({ field: 'loan-duration', msg: 'Duration must be at least 1 day.' });
    } else {
      if (isNaN(rate) || rate <= 0 || rate > 100) errors.push({ field: 'loan-interest-rate', msg: 'Rate must be between 0.01 and 100.' });
    }
    if (errors.length > 0) { showLoanErrors(errors); return; }

    var loan = {
      id: editingLoanId || DB.generateId(),
      clientId: currentClientId,
      loanType: type,
      totalAmount: amount,
      startDate: startDate,
      duration: type === 'daily_emi' ? duration : null,
      emi: isNaN(emi) || emi <= 0 ? (type === 'daily_emi' ? calculateEMI(amount, duration) : calculateInterestEMI(amount, rate)) : emi,
      endDate: type === 'daily_emi' ? calculateEndDate(startDate, duration) : null,
      interestRate: type === 'interest_only' ? rate : null,
      principalBalance: type === 'interest_only' ? (editingLoanId ? undefined : amount) : null,
      notes: notes,
      status: 'active',
      createdAt: editingLoanId ? undefined : new Date().toISOString()
    };

    try {
      if (editingLoanId) {
        var existing = await DB.getLoan(editingLoanId);
        if (existing) { loan.createdAt = existing.createdAt; loan.status = existing.status; if (type === 'interest_only') loan.principalBalance = existing.principalBalance; }
        await DB.updateLoan(loan);
      } else {
        await DB.addLoan(loan);
      }
      hideLoanForm();
      if (typeof ClientMaster !== 'undefined' && ClientMaster.renderClientList) ClientMaster.renderClientList();
    } catch(e) { alert('Could not save loan: ' + e.message); }
  }

  async function deleteLoan(loanId) {
    if (!confirm('Delete this loan and all its payments?')) return;
    try {
      await DB.deleteLoanCascade(loanId);
      if (typeof ClientMaster !== 'undefined' && ClientMaster.renderClientList) ClientMaster.renderClientList();
    } catch(e) { alert('Could not delete loan: ' + e.message); }
  }

  async function closeLoan(loanId) {
    try {
      var loan = await DB.getLoan(loanId);
      if (!loan) { alert('Loan not found.'); return; }
      var client = null;
      try { client = await DB.getClient(loan.clientId); } catch(e) { client = null; }
      var payments = await DB.getPaymentsByLoan(loanId);
      var outstanding = _calculateOutstanding(loan, payments);
      _closingLoanId = loanId;
      _renderClosureModal(loan, client, outstanding);
    } catch(e) { alert('Could not open closure modal: ' + e.message); }
  }

  function hideLoanForm() {
    var container = document.getElementById('loan-form-container');
    if (container) container.setAttribute('hidden', '');
    currentClientId = null; editingLoanId = null;
  }

  function clearLoanErrors() {
    var els = document.querySelectorAll('#loan-form .error-message');
    els.forEach(function(el) { el.textContent = ''; });
  }

  function showLoanErrors(errors) {
    errors.forEach(function(e) {
      var el = document.getElementById(e.field + '-error');
      if (el) el.textContent = e.msg;
    });
  }

  return { init, showAddLoanForm, showEditLoanForm, handleLoanFormSubmit, deleteLoan, closeLoan, hideLoanForm, calculateEMI, calculateEndDate, calculateInterestEMI, toggleLoanTypeFields, formatCurrency, _calculateOutstanding };
})();
