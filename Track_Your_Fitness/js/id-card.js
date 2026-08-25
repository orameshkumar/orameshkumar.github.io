const IdCard = (function () {
  'use strict';

  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  }

  function renderQRIntoElement(container, text, size) {
    if (!container || typeof QRCode === 'undefined') return;
    container.innerHTML = '';
    try {
      new QRCode(container, { text: text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {
      container.innerHTML = '<p style="color:#999;font-size:0.8rem;">QR generation failed</p>';
    }
  }

  // Read QR table cells and return the dark/light matrix
  function getQRMatrix(qrContainer) {
    var table = qrContainer ? qrContainer.querySelector('table') : null;
    if (!table) return null;
    var rows = table.querySelectorAll('tr');
    var matrix = [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('td');
      var row = [];
      for (var c = 0; c < cells.length; c++) {
        var bg = window.getComputedStyle(cells[c]).backgroundColor;
        var isDark = (bg && bg !== 'rgb(255, 255, 255)' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent');
        row.push(isDark);
      }
      matrix.push(row);
    }
    return matrix;
  }

  function generate(member) {
    var overlay = document.getElementById('id-card-overlay');
    if (!overlay) return;

    var appName = typeof Settings !== 'undefined' ? Settings.getAppName() : 'Track Your Fitness';

    var html = '<div class="id-card">';
    html += '<div class="id-card-header">' + esc(appName) + ' — MEMBER ID CARD</div>';
    if (member.photo) {
      html += '<div style="margin:8px auto;text-align:center;"><img src="' + member.photo + '" style="width:60px;height:60px;border-radius:50%;object-fit:cover;"></div>';
    }
    html += '<div class="id-card-name">' + esc(member.name) + '</div>';
    html += '<div class="id-card-detail">Mobile: ' + esc(member.mobile) + '</div>';
    html += '<div class="id-card-detail">Type: ' + esc(member.memberType || 'Regular') + '</div>';
    if (member.validTill) html += '<div class="id-card-detail" style="color:' + (member.validTill < new Date().toISOString().split('T')[0] ? '#e53935' : '#43a047') + ';font-weight:600;">Valid till: ' + esc(member.validTill) + '</div>';
    if (member.notes) html += '<div class="id-card-detail">Notes: ' + esc(member.notes) + '</div>';
    html += '<div class="id-card-detail id-card-id">ID: ' + esc(member.id) + '</div>';
    html += '<div class="id-card-qr" id="id-card-qr-container"></div>';
    html += '<div class="id-card-footer">' + esc(appName) + '</div>';
    html += '</div>';
    html += '<div class="id-card-actions"><button class="btn btn-primary" onclick="window.print()">🖨️ Print</button> <button class="btn btn-primary" onclick="IdCard.shareWhatsApp()" style="background:#25D366;">📲 Share</button> <button class="btn btn-secondary" onclick="IdCard.hide()">Close</button></div>';

    overlay.innerHTML = html;
    overlay.removeAttribute('hidden');

    var qrContainer = document.getElementById('id-card-qr-container');
    renderQRIntoElement(qrContainer, member.id, 120);

    // Pre-load html2canvas so share button has less async delay
    loadHtml2Canvas().catch(function () {});
  }

  function hide() {
    var overlay = document.getElementById('id-card-overlay');
    if (overlay) { overlay.setAttribute('hidden', ''); overlay.innerHTML = ''; }
  }

  function loadHtml2Canvas() {
    return new Promise(function (resolve, reject) {
      if (typeof html2canvas !== 'undefined') { resolve(); return; }
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Failed to load html2canvas')); };
      document.head.appendChild(script);
    });
  }

  function downloadBlob(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'id-card.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function shareWhatsApp() {
    var cardEl = document.querySelector('.id-card');
    if (!cardEl) { alert('No ID card to share.'); return; }

    try {
      // Step 1: Read QR matrix from the table BEFORE we modify anything
      var qrContainer = cardEl.querySelector('.id-card-qr');
      var qrMatrix = getQRMatrix(qrContainer);

      // Step 2: Hide the QR container so html2canvas doesn't try to render it
      if (qrContainer) qrContainer.style.visibility = 'hidden';

      // Step 3: Capture the card with html2canvas (without QR)
      await loadHtml2Canvas();
      await new Promise(function (r) { setTimeout(r, 100); });
      var canvas = await html2canvas(cardEl, { useCORS: true, backgroundColor: '#ffffff', allowTaint: true, logging: false });

      // Step 4: Restore QR visibility
      if (qrContainer) qrContainer.style.visibility = '';

      // Step 5: Draw QR manually onto the captured canvas
      if (qrMatrix && qrMatrix.length > 0) {
        var ctx = canvas.getContext('2d');
        // Find where QR container is positioned relative to the card
        var cardRect = cardEl.getBoundingClientRect();
        var qrRect = qrContainer.getBoundingClientRect();
        var qrX = qrRect.left - cardRect.left;
        var qrY = qrRect.top - cardRect.top;
        var qrSize = 120;
        var moduleCount = qrMatrix.length;
        var cellSize = qrSize / moduleCount;

        // Draw white background for QR area
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrX, qrY, qrSize, qrSize);

        // Draw QR modules
        ctx.fillStyle = '#000000';
        for (var r = 0; r < moduleCount; r++) {
          for (var c = 0; c < qrMatrix[r].length; c++) {
            if (qrMatrix[r][c]) {
              ctx.fillRect(
                qrX + Math.floor(c * cellSize),
                qrY + Math.floor(r * cellSize),
                Math.ceil(cellSize),
                Math.ceil(cellSize)
              );
            }
          }
        }
      }

      // Step 6: Export and share
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) { alert('Could not generate image.'); return; }

      // Share or download
      var file = new File([blob], 'id-card.png', { type: 'image/png' });
      var shared = false;
      if (navigator.share && navigator.canShare) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Member ID Card' });
            shared = true;
          }
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') shared = false;
          else shared = true; // user cancelled is fine
        }
      }
      if (!shared) downloadBlob(blob);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        alert('Could not share: ' + e.message);
      }
    }
  }

  return { generate: generate, hide: hide, shareWhatsApp: shareWhatsApp };
})();