const IdCard = (function () {
  'use strict';

  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  }

  // Generate QR code as a base64 PNG data URL (async - waits for render)
  function generateQRDataUrl(text, size) {
    return new Promise(function (resolve) {
      var container = document.createElement('div');
      container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
      document.body.appendChild(container);
      try {
        new QRCode(container, {
          text: text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M,
          drawer: 'canvas'
        });
        // Wait for QR library to finish drawing
        setTimeout(function () {
          var cvs = container.querySelector('canvas');
          if (cvs) {
            try {
              var dataUrl = cvs.toDataURL('image/png');
              document.body.removeChild(container);
              resolve(dataUrl);
              return;
            } catch (e) {}
          }
          // Fallback: check for img tag
          var img = container.querySelector('img');
          if (img && img.src) {
            document.body.removeChild(container);
            resolve(img.src);
            return;
          }
          document.body.removeChild(container);
          resolve(null);
        }, 300);
      } catch (e) {
        document.body.removeChild(container);
        resolve(null);
      }
    });
  }

  async function generate(member) {
    var overlay = document.getElementById('id-card-overlay');
    if (!overlay) return;

    var appName = typeof Settings !== 'undefined' ? Settings.getAppName() : 'Track Your Fitness';

    // Pre-generate QR as data URL (async)
    var qrDataUrl = null;
    if (typeof QRCode !== 'undefined') {
      qrDataUrl = await generateQRDataUrl(member.id, 120);
    }

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
    // Use pre-generated QR image (not canvas)
    if (qrDataUrl) {
      html += '<div class="id-card-qr"><img src="' + qrDataUrl + '" style="width:120px;height:120px;display:block;"></div>';
    } else {
      html += '<div class="id-card-qr" style="color:#999;font-size:0.8rem;">QR not available</div>';
    }
    html += '<div class="id-card-footer">' + esc(appName) + '</div>';
    html += '</div>';
    html += '<div class="id-card-actions"><button class="btn btn-primary" onclick="window.print()">🖨️ Print</button> <button class="btn btn-primary" onclick="IdCard.shareWhatsApp()" style="background:#25D366;">📲 Share</button> <button class="btn btn-secondary" onclick="IdCard.hide()">Close</button></div>';

    overlay.innerHTML = html;
    overlay.removeAttribute('hidden');
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

  async function shareWhatsApp() {
    var cardEl = document.querySelector('.id-card');
    if (!cardEl) { alert('No ID card to share.'); return; }

    try {
      await loadHtml2Canvas();
      // No canvas-to-img conversion needed — QR is already an <img> tag
      await new Promise(function (r) { setTimeout(r, 100); });
      var canvas = await html2canvas(cardEl, { scale: 1, useCORS: true, backgroundColor: '#ffffff', allowTaint: true, logging: false });
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
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        alert('Could not share: ' + e.message);
      }
    }
  }

  return { generate: generate, hide: hide, shareWhatsApp: shareWhatsApp };
})();