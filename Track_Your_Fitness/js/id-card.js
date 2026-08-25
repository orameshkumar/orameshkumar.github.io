const IdCard = (function () {
  'use strict';

  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  }

  // Render QR table into a container
  function renderQRIntoElement(container, text, size) {
    if (!container || typeof QRCode === 'undefined') return;
    container.innerHTML = '';
    try {
      new QRCode(container, { text: text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {
      container.innerHTML = '<p style="color:#999;font-size:0.8rem;">QR generation failed</p>';
    }
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

  // Convert QR table to a canvas-drawn image to avoid html2canvas table clipping
  function convertQRTableToImage(qrContainer) {
    if (!qrContainer) return;
    var table = qrContainer.querySelector('table');
    if (!table) return;

    // Read the table cells to get the QR matrix
    var rows = table.querySelectorAll('tr');
    var moduleCount = rows.length;
    if (moduleCount === 0) return;

    var size = 120;
    var cellSize = size / moduleCount;

    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('td');
      for (var c = 0; c < cells.length; c++) {
        var bg = window.getComputedStyle(cells[c]).backgroundColor;
        // Dark modules have dark background
        var isDark = (bg && bg !== 'rgb(255, 255, 255)' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== '');
        if (isDark) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(Math.floor(c * cellSize), Math.floor(r * cellSize), Math.ceil(cellSize), Math.ceil(cellSize));
        }
      }
    }

    // Replace table with img
    var img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    img.style.display = 'block';
    img.style.margin = '0 auto';
    qrContainer.innerHTML = '';
    qrContainer.appendChild(img);
  }

  async function shareWhatsApp() {
    var cardEl = document.querySelector('.id-card');
    if (!cardEl) { alert('No ID card to share.'); return; }

    try {
      // Convert QR table to an img BEFORE html2canvas captures
      var qrContainer = cardEl.querySelector('.id-card-qr');
      convertQRTableToImage(qrContainer);

      await loadHtml2Canvas();
      await new Promise(function (r) { setTimeout(r, 100); });

      var canvas = await html2canvas(cardEl, { useCORS: true, backgroundColor: '#ffffff', allowTaint: true, logging: false });
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) { alert('Could not generate image.'); return; }

      var file = new File([blob], 'id-card.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Member ID Card' });
      } else {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'id-card.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      // Restore QR table after sharing (re-render)
      renderQRIntoElement(qrContainer, document.querySelector('.id-card-id').textContent.replace('ID: ', ''), 120);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        alert('Could not share: ' + e.message);
      }
    }
  }

  return { generate: generate, hide: hide, shareWhatsApp: shareWhatsApp };
})();