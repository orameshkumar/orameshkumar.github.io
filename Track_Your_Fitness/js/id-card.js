const IdCard = (function () {
  'use strict';

  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  }

  function generate(member) {
    var overlay = document.getElementById('id-card-overlay');
    if (!overlay) return;

    var appName = typeof Settings !== 'undefined' ? Settings.getAppName() : 'Track Your Fitness';

    var html = '<div class="id-card">';
    html += '<div class="id-card-header">' + esc(appName) + ' — MEMBER ID CARD</div>';
    html += '<div class="id-card-name">' + esc(member.name) + '</div>';
    html += '<div class="id-card-detail">Mobile: ' + esc(member.mobile) + '</div>';
    html += '<div class="id-card-detail">Type: ' + esc(member.memberType || 'Regular') + '</div>';
    if (member.notes) html += '<div class="id-card-detail">Notes: ' + esc(member.notes) + '</div>';
    html += '<div class="id-card-detail id-card-id">ID: ' + esc(member.id) + '</div>';
    html += '<div class="id-card-qr" id="id-card-qr-container"></div>';
    html += '<div class="id-card-footer">' + esc(appName) + '</div>';
    html += '</div>';
    html += '<div class="id-card-actions"><button class="btn btn-primary" onclick="window.print()">🖨️ Print</button> <button class="btn btn-primary" onclick="IdCard.shareWhatsApp()" style="background:#25D366;">📲 Share</button> <button class="btn btn-secondary" onclick="IdCard.hide()">Close</button></div>';

    overlay.innerHTML = html;
    overlay.removeAttribute('hidden');

    // Render QR code encoding the member ID
    var qrContainer = document.getElementById('id-card-qr-container');
    if (qrContainer && typeof QRCode !== 'undefined') {
      try {
        new QRCode(qrContainer, { text: member.id, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
      } catch (e) {
        qrContainer.innerHTML = '<p style="color:#999;font-size:0.8rem;">QR generation failed.</p>';
      }
    }
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
      var canvas = await html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) { alert('Could not generate image.'); return; }

      var file = new File([blob], 'id-card.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Member ID Card' });
      } else {
        // Fallback: download the image
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
