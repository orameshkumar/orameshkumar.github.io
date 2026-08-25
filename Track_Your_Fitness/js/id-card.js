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

  // Generate QR matrix directly using the QRCode library internals (async)
  function getQRMatrixFromText(text) {
    return new Promise(function (resolve) {
    try {
      var container = document.createElement('div');
      container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
      document.body.appendChild(container);
      new QRCode(container, { text: text, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
      
      // Wait 500ms for any async rendering
      setTimeout(function () {
        var matrix = null;
        
        var table = container.querySelector('table');
        var canvas = container.querySelector('canvas');
        var img = container.querySelector('img');
        
        if (table) {
          var rows = table.querySelectorAll('tr');
          matrix = [];
          for (var r = 0; r < rows.length; r++) {
            var cells = rows[r].querySelectorAll('td');
            var row = [];
            for (var c = 0; c < cells.length; c++) {
              var style = cells[c].getAttribute('style') || '';
              var bg = window.getComputedStyle(cells[c]).backgroundColor || '';
              var isDark = style.indexOf('rgb(0, 0, 0)') !== -1 || style.indexOf('#000') !== -1 || bg.indexOf('rgb(0, 0, 0)') !== -1;
              row.push(isDark);
            }
            matrix.push(row);
          }
        } else if (canvas) {
          var ctx = canvas.getContext('2d');
          var size = canvas.width;
          var moduleCount = 29;
          for (var mc = 21; mc <= 45; mc += 4) {
            if (size % mc === 0) { moduleCount = mc; break; }
          }
          var cellPx = size / moduleCount;
          matrix = [];
          for (var ry = 0; ry < moduleCount; ry++) {
            var rowArr = [];
            for (var cx = 0; cx < moduleCount; cx++) {
              var px = ctx.getImageData(Math.floor(cx * cellPx + cellPx / 2), Math.floor(ry * cellPx + cellPx / 2), 1, 1).data;
              rowArr.push(px[0] < 128);
            }
            matrix.push(rowArr);
          }
        } else if (img && img.src) {
          // If img, load it to canvas and read pixels
          var tempCanvas = document.createElement('canvas');
          tempCanvas.width = 120;
          tempCanvas.height = 120;
          var tCtx = tempCanvas.getContext('2d');
          var tempImg = new Image();
          tempImg.onload = function () {
            tCtx.drawImage(tempImg, 0, 0, 120, 120);
            var mCount = 29;
            var cPx = 120 / mCount;
            var mat = [];
            for (var ry2 = 0; ry2 < mCount; ry2++) {
              var r2 = [];
              for (var cx2 = 0; cx2 < mCount; cx2++) {
                var p = tCtx.getImageData(Math.floor(cx2 * cPx + cPx / 2), Math.floor(ry2 * cPx + cPx / 2), 1, 1).data;
                r2.push(p[0] < 128);
              }
              mat.push(r2);
            }
            document.body.removeChild(container);
            resolve(mat);
          };
          tempImg.onerror = function () { document.body.removeChild(container); resolve(null); };
          tempImg.src = img.src;
          return; // early return - resolve happens in onload
        }
        
        document.body.removeChild(container);
        resolve(matrix);
      }, 500);
    } catch (e) {
      console.error('[QR] Matrix generation failed:', e);
      resolve(null);
    }
    });
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

  // Draw entire ID card on a canvas manually — no html2canvas needed
  function drawCardOnCanvas(member, qrMatrix) {
    var W = 340, padding = 20;
    var contentW = W - padding * 2;
    var appName = typeof Settings !== 'undefined' ? Settings.getAppName() : 'Track Your Fitness';

    // Pre-calculate height
    var y = padding;
    y += 20; // header
    y += 10; // gap
    if (member.photo) y += 70; // photo
    y += 24; // name
    y += 18; // mobile
    y += 18; // type
    if (member.validTill) y += 18;
    if (member.notes) y += 18;
    y += 14; // ID
    y += 10; // gap
    y += 130; // QR
    y += 10; // gap
    y += 16; // footer
    y += padding;

    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = y;
    var ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, y);

    // Border
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, y - 2);

    var cy = padding; // current Y position

    // Header
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((appName + ' — MEMBER ID CARD').toUpperCase(), W / 2, cy + 10);
    cy += 20;

    // Blue line under header
    ctx.fillStyle = '#1976d2';
    ctx.fillRect(padding, cy, contentW, 2);
    cy += 10;

    // Photo
    if (member.photo) {
      try {
        var img = new Image();
        img.src = member.photo;
        // Draw circular photo
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, cy + 30, 30, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, W / 2 - 30, cy, 60, 60);
        ctx.restore();
        cy += 70;
      } catch (e) { cy += 10; }
    }

    // Name
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(member.name || '', W / 2, cy + 16);
    cy += 24;

    // Details
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#333333';
    ctx.fillText('Mobile: ' + (member.mobile || ''), W / 2, cy + 12);
    cy += 18;
    ctx.fillText('Type: ' + (member.memberType || 'Regular'), W / 2, cy + 12);
    cy += 18;

    if (member.validTill) {
      var isExp = member.validTill < new Date().toISOString().split('T')[0];
      ctx.fillStyle = isExp ? '#e53935' : '#43a047';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Valid till: ' + member.validTill, W / 2, cy + 12);
      cy += 18;
      ctx.fillStyle = '#333333';
      ctx.font = '12px sans-serif';
    }

    if (member.notes) {
      ctx.fillText('Notes: ' + member.notes, W / 2, cy + 12);
      cy += 18;
    }

    // ID
    ctx.fillStyle = '#999999';
    ctx.font = '9px monospace';
    ctx.fillText('ID: ' + (member.id || ''), W / 2, cy + 10);
    cy += 14;
    cy += 10;

    // QR Code - draw from matrix
    if (qrMatrix && qrMatrix.length > 0) {
      var qrSize = 120;
      var moduleCount = qrMatrix.length;
      var cellSize = qrSize / moduleCount;
      var qrX = (W - qrSize) / 2;
      var qrY = cy;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);

      ctx.fillStyle = '#000000';
      for (var r = 0; r < moduleCount; r++) {
        for (var c = 0; c < qrMatrix[r].length; c++) {
          if (qrMatrix[r][c]) {
            ctx.fillRect(qrX + c * cellSize, qrY + r * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
          }
        }
      }
      cy += qrSize + 10;
    }

    // Footer
    ctx.fillStyle = '#666666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(appName, W / 2, cy + 12);

    return canvas;
  }

  async function shareWhatsApp() {
    var cardEl = document.querySelector('.id-card');
    if (!cardEl) { alert('No ID card to share.'); return; }

    try {
      // Get member data from the card DOM
      var member = {};
      var nameEl = cardEl.querySelector('.id-card-name');
      if (nameEl) member.name = nameEl.textContent;
      var details = cardEl.querySelectorAll('.id-card-detail');
      details.forEach(function (d) {
        var t = d.textContent;
        if (t.indexOf('Mobile:') === 0) member.mobile = t.replace('Mobile: ', '');
        else if (t.indexOf('Type:') === 0) member.memberType = t.replace('Type: ', '');
        else if (t.indexOf('Valid till:') === 0) member.validTill = t.replace('Valid till: ', '');
        else if (t.indexOf('Notes:') === 0) member.notes = t.replace('Notes: ', '');
        else if (t.indexOf('ID:') === 0) member.id = t.replace('ID: ', '');
      });
      // Get photo
      var photoImg = cardEl.querySelector('img[style*="border-radius:50%"]');
      if (photoImg) member.photo = photoImg.src;

      // Get QR matrix
      var qrContainer = cardEl.querySelector('.id-card-qr');

      // Generate QR matrix from member ID text directly (not from DOM)
      var memberId = member.id || '';
      var qrMatrix = (typeof QRCode !== 'undefined' && memberId) ? await getQRMatrixFromText(memberId) : null;

      // Draw card on canvas (pure canvas drawing - no html2canvas)
      var canvas = drawCardOnCanvas(member, qrMatrix);

      // Export
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) { alert('Could not generate image.'); return; }

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
          else shared = true;
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