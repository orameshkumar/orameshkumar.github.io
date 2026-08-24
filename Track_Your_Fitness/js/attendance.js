const Attendance = (function () {
  'use strict';

  var _scannerInstance = null;
  var _html5QrcodeLoaded = false;

  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  }
  function getTodayISO() { return new Date().toISOString().split('T')[0]; }

  function init() {
    var dateInput      = document.getElementById('att-date');
    var searchInput    = document.getElementById('att-search');
    var selectAllCb    = document.getElementById('att-select-all');
    var copyYesterday  = document.getElementById('att-copy-yesterday-btn');
    var scanQrBtn      = document.getElementById('att-scan-qr-btn');

    if (dateInput) {
      if (!dateInput.value) { dateInput.value = getTodayISO(); syncDatePicker('att-date'); }
      dateInput.addEventListener('change', renderAttendance);
    }
    if (searchInput) searchInput.addEventListener('input', renderAttendance);
    if (selectAllCb) selectAllCb.addEventListener('change', function () { handleSelectAll(selectAllCb.checked); });
    if (copyYesterday) copyYesterday.addEventListener('click', handleCopyFromYesterday);
    if (scanQrBtn) scanQrBtn.addEventListener('click', toggleQRScanner);

    renderAttendance();
  }

  async function renderAttendance() {
    var container = document.getElementById('att-member-list');
    if (!container) return;

    var dateInput   = document.getElementById('att-date');
    var searchInput = document.getElementById('att-search');
    var date        = dateInput ? dateInput.value : getTodayISO();
    var searchTerm  = searchInput ? searchInput.value.trim().toLowerCase() : '';

    container.innerHTML = '<p class="empty-message">Loading…</p>';

    try {
      var members = await DB.getAllMembers();
      members = members.filter(function (m) { return m.status !== 'inactive'; });

      if (searchTerm) {
        members = members.filter(function (m) {
          return m.name.toLowerCase().indexOf(searchTerm) !== -1 ||
            (m.memberType && m.memberType.toLowerCase().indexOf(searchTerm) !== -1);
        });
      }
      members.sort(function (a, b) { return a.name.localeCompare(b.name); });

      if (members.length === 0) {
        container.innerHTML = '<p class="empty-message">No active members.</p>';
        updatePresentCount(0);
        return;
      }

      // Load attendance for selected date
      var attendanceRecords = await DB.getAttendanceByDate(date);
      var attMap = {};
      attendanceRecords.forEach(function (r) { attMap[r.memberId] = r.status; });

      var presentCount = 0;
      var html = '';
      members.forEach(function (m) {
        var isPresent = attMap[m.id] === 'present';
        if (isPresent) presentCount++;

        html += '<div class="att-member-row' + (isPresent ? ' att-present' : '') + '">';
        html += '<label class="att-member-label">';
        html += '<input type="checkbox" class="att-checkbox" data-member-id="' + m.id + '"' + (isPresent ? ' checked' : '') + '>';
        html += '<span class="att-member-name">' + esc(m.name) + '</span>';
        if (m.memberType && m.memberType !== 'Regular') {
          html += ' <span class="loan-type-badge badge-monthly" style="font-size:0.7rem;">' + esc(m.memberType) + '</span>';
        }
        html += '</label>';
        html += '<span class="att-status-label' + (isPresent ? ' att-status-present' : ' att-status-absent') + '">' + (isPresent ? '✅ Present' : '—') + '</span>';
        html += '</div>';
      });

      container.innerHTML = html;
      updatePresentCount(presentCount);

      // Bind checkbox change events — save immediately on change
      container.querySelectorAll('.att-checkbox').forEach(function (cb) {
        cb.addEventListener('change', function () {
          saveAndRefresh(cb.dataset.memberId, cb.checked);
        });
      });
    } catch (e) {
      container.innerHTML = '<p class="empty-message">Could not load members.</p>';
      console.error('Attendance render error:', e);
    }
  }

  function updatePresentCount(count) {
    var el = document.getElementById('att-present-count');
    if (el) el.textContent = count + ' present';
  }

  async function saveAndRefresh(memberId, checked) {
    var dateInput = document.getElementById('att-date');
    var date = dateInput ? dateInput.value : getTodayISO();
    var status = checked ? 'present' : 'absent';

    try {
      await DB.saveAttendance(memberId, date, status);
      // Re-render to update status labels and count
      renderAttendance();
    } catch (e) {
      alert('Could not save attendance: ' + e.message);
      console.error('Attendance save error:', e);
    }
  }

  async function handleSelectAll(checked) {
    var dateInput = document.getElementById('att-date');
    var date = dateInput ? dateInput.value : getTodayISO();
    var status = checked ? 'present' : 'absent';

    var checkboxes = document.querySelectorAll('.att-checkbox');
    for (var i = 0; i < checkboxes.length; i++) {
      var cb = checkboxes[i];
      try {
        await DB.saveAttendance(cb.dataset.memberId, date, status);
      } catch (e) {
        console.error('Failed to save attendance for', cb.dataset.memberId, e);
      }
    }
    renderAttendance();
  }

  async function handleCopyFromYesterday() {
    var dateInput = document.getElementById('att-date');
    var date = dateInput ? dateInput.value : getTodayISO();

    // Calculate yesterday relative to selected date
    var d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    var yesterday = d.toISOString().split('T')[0];

    try {
      var yesterdayRecords = await DB.getAttendanceByDate(yesterday);
      var presentMembers = yesterdayRecords.filter(function (r) { return r.status === 'present'; });

      if (presentMembers.length === 0) {
        alert('No attendance records found for ' + yesterday + '.');
        return;
      }

      // Mark those members present for selected date
      for (var i = 0; i < presentMembers.length; i++) {
        await DB.saveAttendance(presentMembers[i].memberId, date, 'present');
      }

      alert('Copied ' + presentMembers.length + ' member(s) from ' + yesterday + '.');
      renderAttendance();
    } catch (e) {
      alert('Could not copy attendance: ' + e.message);
    }
  }

  // --- QR Scanner ---

  function toggleQRScanner() {
    var container = document.getElementById('att-qr-scanner-container');
    if (!container) return;

    if (_scannerInstance) {
      stopQRScanner();
    } else {
      startQRScanner();
    }
  }

  async function startQRScanner() {
    var container = document.getElementById('att-qr-scanner-container');
    if (!container) return;

    container.removeAttribute('hidden');
    container.innerHTML = '<p class="empty-message">Loading scanner…</p>';

    try {
      if (!_html5QrcodeLoaded && typeof Html5Qrcode === 'undefined') {
        await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
        _html5QrcodeLoaded = true;
      }

      container.innerHTML = '<div id="att-qr-reader" style="width:100%;max-width:400px;margin:0 auto;"></div>' +
        '<button class="btn btn-secondary btn-sm" id="att-stop-scan-btn" style="margin-top:8px;width:100%;">Stop scanner</button>';

      var stopBtn = document.getElementById('att-stop-scan-btn');
      if (stopBtn) stopBtn.addEventListener('click', stopQRScanner);

      _scannerInstance = new Html5Qrcode('att-qr-reader');
      await _scannerInstance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleQRScanSuccess,
        function () {} // ignore no-QR frames
      );
    } catch (e) {
      var msg = 'Could not start QR scanner.';
      if (e && e.message && e.message.toLowerCase().indexOf('permission') !== -1) {
        msg = 'Camera access is required for QR scanning.';
      } else if (e && e.message && e.message.indexOf('load') !== -1) {
        msg = 'QR scanner could not be loaded. Check your internet connection.';
      }
      container.innerHTML = '<p class="empty-message">' + msg + '</p>' +
        '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'att-qr-scanner-container\').setAttribute(\'hidden\',\'\');" style="margin-top:8px;">Close</button>';
      _scannerInstance = null;
    }
  }

  async function handleQRScanSuccess(decodedText) {
    if (_scannerInstance) {
      try { await _scannerInstance.pause(true); } catch (e) {}
    }

    var resultDiv = document.getElementById('att-scan-result');
    if (!resultDiv) return;

    try {
      var member = await DB.getMember(decodedText);
      if (!member) {
        resultDiv.innerHTML = '<div class="att-scan-error">❌ Member not found for ID: ' + esc(decodedText) + '</div>';
        resultDiv.removeAttribute('hidden');
        resumeScannerAfterDelay();
        return;
      }

      // Mark present for today
      var today = getTodayISO();
      await DB.saveAttendance(member.id, today, 'present');

      // Calculate outstanding balance
      var balanceText = '';
      if (typeof Monthly !== 'undefined' && typeof Monthly.calcMemberBalance === 'function') {
        var contrib = await DB.getContributionByMember(member.id);
        if (contrib) {
          var bal = await Monthly.calcMemberBalance(member, contrib, today);
          balanceText = bal.balance > 0
            ? '<div class="amount-due" style="font-size:1rem;margin-top:6px;">Outstanding: ₹' + bal.balance.toFixed(2) + '</div>'
            : '<div class="amount-paid" style="font-size:1rem;margin-top:6px;">✓ Balance clear</div>';
        }
      }

      resultDiv.innerHTML = '<div class="att-scan-success">' +
        '<div style="font-size:1.1rem;font-weight:600;">✅ ' + esc(member.name) + '</div>' +
        '<div style="font-size:0.85rem;color:var(--text2);">' + esc(member.memberType || 'Regular') + '</div>' +
        balanceText +
        '<div style="font-size:0.8rem;margin-top:4px;">Marked present for ' + today + '</div>' +
        '</div>';
      resultDiv.removeAttribute('hidden');

      renderAttendance();
      resumeScannerAfterDelay();
    } catch (e) {
      resultDiv.innerHTML = '<div class="att-scan-error">Error: ' + esc(e.message) + '</div>';
      resultDiv.removeAttribute('hidden');
      resumeScannerAfterDelay();
    }
  }

  function resumeScannerAfterDelay() {
    setTimeout(function () {
      if (_scannerInstance) {
        try { _scannerInstance.resume(); } catch (e) {}
      }
      var resultDiv = document.getElementById('att-scan-result');
      if (resultDiv) setTimeout(function () { resultDiv.setAttribute('hidden', ''); }, 3000);
    }, 2000);
  }

  async function stopQRScanner() {
    var container = document.getElementById('att-qr-scanner-container');
    if (_scannerInstance) {
      try { await _scannerInstance.stop(); } catch (e) {}
      _scannerInstance = null;
    }
    if (container) { container.setAttribute('hidden', ''); container.innerHTML = ''; }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Failed to load: ' + src)); };
      document.head.appendChild(script);
    });
  }

  return { init: init, renderAttendance: renderAttendance };
})();