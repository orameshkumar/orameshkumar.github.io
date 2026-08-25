const IdCard = (function () {
  'use strict';

  function esc(s) {
    return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  }

  // Generate QR code - this library renders as a TABLE, not canvas.
  // We just render it directly in the card (no data URL conversion needed).
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

    // Render QR into the container (table-based rendering)
    var qrContainer = document.getElementById('id-card-qr-container');
    renderQRIntoElement(qrContainer, member.id, 120);
  }

  function hide() {
    var overlay = document.getElementById('id-card-overlay');
    if (overlay) { overlay.setAttribute('hidden', ''); overlay.innerHTML = ''; }
  }



  function inlineStyles(source, target) {
    var sourceChildren = source.children;
    var targetChildren = target.children;
    var computed = window.getComputedStyle(source);
    target.style.cssText = computed.cssText;
    for (var i = 0; i < sourceChildren.length; i++) {
      if (targetChildren[i]) {
        inlineStyles(sourceChildren[i], targetChildren[i]);
      }
    }
  }

  async function shareWhatsApp() {
    var cardEl = document.querySelector('.id-card');
    if (!cardEl) { alert('No ID card to share.'); return; }

    try {
      // Get card dimensions
      var rect = cardEl.getBoundingClientRect();
      var width = Math.ceil(rect.width);
      var height = Math.ceil(rect.height);

      // Clone and inline ALL computed styles so SVG foreignObject renders correctly
      var clone = cardEl.cloneNode(true);
      inlineStyles(cardEl, clone);

      // Serialize to XHTML string
      var serializer = new XMLSerializer();
      var xhtml = serializer.serializeToString(clone);

      // Build SVG data URL (not blob URL — avoids tainted canvas)
      var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">'+
        '<foreignObject width="100%" height="100%">'+
        '<div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff;">'+
        xhtml +
        '</div></foreignObject></svg>';

      // Encode as data URL to avoid cross-origin/tainted canvas
      var svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async function () {
        var canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        var ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
        if (!blob) { alert('Could not generate image.'); return; }

        var file = new File([blob], 'id-card.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Member ID Card' });
        } else {
          var dlUrl = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = dlUrl;
          a.download = 'id-card.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(dlUrl);
        }
      };
      img.onerror = function () {
        alert('Could not generate image. Try screenshot instead.');
      };
      img.src = svgDataUrl;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        alert('Could not share: ' + e.message);
      }
    }
  }

  return { generate: generate, hide: hide, shareWhatsApp: shareWhatsApp };
})();