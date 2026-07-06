/**
 * printer.js - Printer Module for ABC Provisional Store
 *
 * Handles bill receipt formatting and printing via two modes:
 * 1. Browser Print - CSS-optimized receipt layout using hidden iframe + window.print()
 * 2. ESC/POS Direct - Binary command generation sent via Web Serial API to thermal printers
 *
 * Supports 58mm and 80mm thermal paper widths.
 * Integrates with Settings module for printer configuration.
 */

const Printer = (function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────

  /** @type {SerialPort|null} */
  var printerPort = null;

  /** @type {boolean} */
  var connected = false;

  // ─── ESC/POS Command Constants ──────────────────────────────────────────────

  var ESC = 0x1B;
  var GS = 0x1D;
  var LF = 0x0A;

  /** Initialize printer */
  var CMD_INIT = [ESC, 0x40];
  /** Center alignment */
  var CMD_CENTER = [ESC, 0x61, 0x01];
  /** Left alignment */
  var CMD_LEFT = [ESC, 0x61, 0x00];
  /** Bold on */
  var CMD_BOLD_ON = [ESC, 0x45, 0x01];
  /** Bold off */
  var CMD_BOLD_OFF = [ESC, 0x45, 0x00];
  /** Partial cut */
  var CMD_CUT = [GS, 0x56, 0x01];

  // ─── Settings Helper ────────────────────────────────────────────────────────

  /**
   * Retrieve printer settings from localStorage.
   * @returns {{ mode: string, paperWidth: string }} Printer configuration
   */
  function _getPrinterSettings() {
    try {
      var raw = localStorage.getItem('abcstore_upi_settings');
      if (raw) {
        var s = JSON.parse(raw);
        return { mode: s.printerMode || 'browser', paperWidth: s.printerPaperWidth || '80' };
      }
    } catch (e) { /* ignore parse errors */ }
    return { mode: 'browser', paperWidth: '80' };
  }

  // ─── Browser Print ──────────────────────────────────────────────────────────

  /**
   * Generate receipt HTML for browser printing.
   * @param {Object} bill - Bill record object
   * @param {string} bill.id - Bill number
   * @param {string} bill.date - ISO date/time string
   * @param {Array} bill.items - Line items array
   * @param {number} bill.total - Bill total
   * @param {number} bill.totalSavings - Total savings amount
   * @param {string} [bill.storeName] - Store name override
   * @param {string} [bill.upiId] - UPI ID for QR placeholder
   * @param {string} paperWidth - Paper width: "58" or "80"
   * @returns {string} Complete HTML string for receipt
   */
  function formatReceiptHTML(bill, paperWidth) {
    var storeName = bill.storeName || (typeof Settings !== 'undefined' ? Settings.getStoreName() : 'ABC Store');
    var cssClass = paperWidth === '58' ? 'receipt-58mm' : 'receipt-80mm';
    var billDate = _parseBillDate(bill.date);
    var settings = _getPrinterSettings();

    var html = '';
    html += '<!DOCTYPE html>';
    html += '<html><head><meta charset="UTF-8">';
    html += '<title>Receipt - ' + _escapeHtml(bill.id) + '</title>';
    html += '<style>';
    html += _getReceiptCSS();
    html += '</style>';
    html += '</head><body>';
    html += '<div class="receipt ' + cssClass + '">';

    // Store name header
    html += '<div class="receipt-header">';
    html += '<h1 class="store-name">' + _escapeHtml(storeName) + '</h1>';
    html += '</div>';

    // Bill metadata
    html += '<div class="receipt-meta">';
    html += '<p>Bill No: ' + _escapeHtml(bill.id) + '</p>';
    html += '<p>Date: ' + billDate.dateStr + '  Time: ' + billDate.timeStr + '</p>';
    html += '</div>';

    // Separator
    html += '<hr class="separator">';

    // Line items table
    html += '<table class="receipt-items">';
    html += '<thead><tr><th class="item-name">Item</th><th class="item-qty">Qty</th><th class="item-savings">Savings</th><th class="item-price">Price</th></tr></thead>';
    html += '<tbody>';

    var items = bill.items || bill.lineItems || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var itemName = item.name || item.itemName || '';
      var qty = _getDisplayQty(item);
      var lineTotal = item.lineTotal || item.price || 0;
      var savings = item.savings || 0;

      html += '<tr>';
      html += '<td class="item-name">' + _escapeHtml(itemName) + '</td>';
      html += '<td class="item-qty">' + _escapeHtml(qty) + '</td>';
      html += '<td class="item-savings">' + (savings > 0 ? _formatCurrency(savings) : '') + '</td>';
      html += '<td class="item-price">' + _formatCurrency(lineTotal) + '</td>';
      html += '</tr>';
    }

    html += '</tbody>';
    html += '</table>';

    // Separator
    html += '<hr class="separator">';

    // Total
    html += '<div class="receipt-total">';
    html += '<p class="total-line"><strong>TOTAL: ' + _formatCurrency(bill.total) + '</strong></p>';

    // Total savings
    var totalSavings = bill.totalSavings || 0;
    if (totalSavings > 0) {
      html += '<p class="savings-line">You Saved: ' + _formatCurrency(totalSavings) + '</p>';
    }
    html += '</div>';

    // Separator
    html += '<hr class="separator">';

    // Footer
    html += '<div class="receipt-footer">';
    html += '<p>Thank you for your purchase!</p>';
    html += '</div>';

    // UPI QR placeholder
    var upiId = bill.upiId || _getUpiId();
    if (upiId) {
      html += '<div class="receipt-upi">';
      html += '<p class="upi-label">Pay via UPI</p>';
      html += '<div class="upi-qr-placeholder">[QR Code]</div>';
      html += '<p class="upi-id">' + _escapeHtml(upiId) + '</p>';
      html += '</div>';
    }

    html += '</div>'; // .receipt
    html += '</body></html>';

    return html;
  }

  /**
   * Generate CSS styles for receipt printing.
   * @returns {string} CSS string
   */
  function _getReceiptCSS() {
    return '' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { font-family: "Courier New", Courier, monospace; font-size: 12px; }' +
      '.receipt { padding: 4mm; }' +
      '.receipt-58mm { width: 58mm; max-width: 58mm; }' +
      '.receipt-80mm { width: 80mm; max-width: 80mm; }' +
      '.receipt-header { text-align: center; margin-bottom: 4px; }' +
      '.store-name { font-size: 16px; font-weight: bold; margin: 0; }' +
      '.receipt-meta { text-align: center; font-size: 11px; margin-bottom: 4px; }' +
      '.receipt-meta p { margin: 2px 0; }' +
      '.separator { border: none; border-top: 1px dashed #000; margin: 4px 0; }' +
      '.receipt-items { width: 100%; border-collapse: collapse; font-size: 11px; }' +
      '.receipt-items th { text-align: left; font-weight: bold; border-bottom: 1px solid #000; padding: 2px 1px; }' +
      '.receipt-items td { padding: 2px 1px; vertical-align: top; }' +
      '.item-qty, .item-price, .item-savings { text-align: right; white-space: nowrap; }' +
      '.receipt-total { margin: 4px 0; }' +
      '.total-line { font-size: 14px; font-weight: bold; }' +
      '.savings-line { font-size: 11px; color: #228B22; }' +
      '.receipt-footer { text-align: center; margin-top: 8px; font-size: 11px; }' +
      '.receipt-upi { text-align: center; margin-top: 8px; }' +
      '.upi-label { font-size: 10px; margin-bottom: 4px; }' +
      '.upi-qr-placeholder { width: 80px; height: 80px; border: 1px dashed #999; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }' +
      '.upi-id { font-size: 9px; color: #666; margin-top: 2px; word-break: break-all; }' +
      '@media print {' +
        'body { margin: 0; padding: 0; }' +
        '.receipt { margin: 0; }' +
      '}';
  }

  /**
   * Execute browser print flow using a hidden iframe.
   * @param {Object} bill - Bill record object
   * @param {string} paperWidth - Paper width: "58" or "80"
   */
  function _printViaBrowser(bill, paperWidth) {
    var receiptHTML = formatReceiptHTML(bill, paperWidth);

    // Create hidden iframe for printing
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    var iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(receiptHTML);
    iframeDoc.close();

    // Wait for content to render, then print
    setTimeout(function () {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.error('Printer: Browser print failed', e);
      }

      // Clean up iframe after print dialog closes
      setTimeout(function () {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  }

  // ─── ESC/POS Direct Printing ────────────────────────────────────────────────

  /**
   * Generate ESC/POS binary receipt data.
   * @param {Object} bill - Bill record object
   * @param {string} paperWidth - Paper width: "58" or "80"
   * @returns {Uint8Array} ESC/POS command byte array
   */
  function formatReceiptESCPOS(bill, paperWidth) {
    var charsPerLine = paperWidth === '58' ? 32 : 48;
    var storeName = bill.storeName || (typeof Settings !== 'undefined' ? Settings.getStoreName() : 'ABC Store');
    var billDate = _parseBillDate(bill.date);
    var encoder = new TextEncoder();
    var bytes = [];

    // Initialize printer
    _appendBytes(bytes, CMD_INIT);

    // Store name - centered, bold
    _appendBytes(bytes, CMD_CENTER);
    _appendBytes(bytes, CMD_BOLD_ON);
    _appendText(bytes, encoder, storeName);
    _appendBytes(bytes, [LF]);
    _appendBytes(bytes, CMD_BOLD_OFF);

    // Bill number and date - centered
    _appendText(bytes, encoder, 'Bill No: ' + (bill.id || ''));
    _appendBytes(bytes, [LF]);
    _appendText(bytes, encoder, 'Date: ' + billDate.dateStr + '  Time: ' + billDate.timeStr);
    _appendBytes(bytes, [LF]);

    // Switch to left alignment
    _appendBytes(bytes, CMD_LEFT);

    // Separator line
    _appendText(bytes, encoder, _repeatChar('-', charsPerLine));
    _appendBytes(bytes, [LF]);

    // Column header
    var headerLine = _padColumns('Item', 'Qty', 'Price', charsPerLine);
    _appendText(bytes, encoder, headerLine);
    _appendBytes(bytes, [LF]);

    // Separator line
    _appendText(bytes, encoder, _repeatChar('-', charsPerLine));
    _appendBytes(bytes, [LF]);

    // Line items
    var items = bill.items || bill.lineItems || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var itemName = item.name || item.itemName || '';
      var qty = _getDisplayQty(item);
      var lineTotal = _formatCurrency(item.lineTotal || item.price || 0);

      var itemLine = _padColumns(itemName, qty, lineTotal, charsPerLine);
      _appendText(bytes, encoder, itemLine);
      _appendBytes(bytes, [LF]);

      // Show savings if any
      var savings = item.savings || 0;
      if (savings > 0) {
        _appendText(bytes, encoder, '  Save: ' + _formatCurrency(savings));
        _appendBytes(bytes, [LF]);
      }
    }

    // Separator line
    _appendText(bytes, encoder, _repeatChar('-', charsPerLine));
    _appendBytes(bytes, [LF]);

    // Total - bold
    _appendBytes(bytes, CMD_BOLD_ON);
    var totalStr = 'TOTAL: ' + _formatCurrency(bill.total);
    _appendText(bytes, encoder, _padRight(totalStr, charsPerLine));
    _appendBytes(bytes, [LF]);
    _appendBytes(bytes, CMD_BOLD_OFF);

    // Total savings
    var totalSavings = bill.totalSavings || 0;
    if (totalSavings > 0) {
      _appendText(bytes, encoder, 'You Saved: ' + _formatCurrency(totalSavings));
      _appendBytes(bytes, [LF]);
    }

    // Separator line
    _appendText(bytes, encoder, _repeatChar('-', charsPerLine));
    _appendBytes(bytes, [LF]);

    // Footer - centered
    _appendBytes(bytes, CMD_CENTER);
    _appendText(bytes, encoder, 'Thank you for your purchase!');
    _appendBytes(bytes, [LF]);

    // UPI info if configured
    var upiId = bill.upiId || _getUpiId();
    if (upiId) {
      _appendBytes(bytes, [LF]);
      _appendText(bytes, encoder, 'Pay via UPI: ' + upiId);
      _appendBytes(bytes, [LF]);
    }

    // Feed some lines before cut
    _appendBytes(bytes, [LF, LF, LF]);

    // Partial cut
    _appendBytes(bytes, CMD_CUT);

    return new Uint8Array(bytes);
  }

  // ─── Serial Port Operations ─────────────────────────────────────────────────

  /**
   * Connect to a thermal printer via Web Serial API.
   * Requests port selection and stores the port reference.
   * @returns {Promise<boolean>} True if connected successfully
   */
  async function connectPrinter() {
    try {
      if (!navigator.serial) {
        _showToast('Direct printing requires Chrome 89+ or Edge 89+');
        return false;
      }

      printerPort = await navigator.serial.requestPort();
      connected = true;
      _showToast('Printer connected');
      return true;
    } catch (e) {
      if (e.name !== 'NotAllowedError') {
        // NotAllowedError means user cancelled - no toast needed
        console.error('Printer: Connect failed', e);
        _showToast('Cannot connect to printer: ' + e.message);
      }
      connected = false;
      printerPort = null;
      return false;
    }
  }

  /**
   * Disconnect the printer by closing the serial port.
   * @returns {Promise<void>}
   */
  async function disconnectPrinter() {
    try {
      if (printerPort) {
        await printerPort.close();
      }
    } catch (e) {
      console.error('Printer: Disconnect error', e);
    } finally {
      printerPort = null;
      connected = false;
    }
  }

  /**
   * Send binary data to the connected printer port.
   * Opens port at 9600 baud, writes data, then closes the writer.
   * @param {Uint8Array} data - ESC/POS command data to send
   * @returns {Promise<boolean>} True if data sent successfully
   */
  async function _sendToPrinter(data) {
    if (!printerPort) {
      throw new Error('No printer port connected');
    }

    var writer = null;
    try {
      await printerPort.open({ baudRate: 9600 });
      writer = printerPort.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
      await printerPort.close();
      return true;
    } catch (e) {
      if (writer) {
        try { writer.releaseLock(); } catch (ignore) { /* ignore */ }
      }
      try { await printerPort.close(); } catch (ignore) { /* ignore */ }
      throw e;
    }
  }

  /**
   * Print via ESC/POS mode: format receipt and send to printer.
   * Falls back to browser print on failure.
   * @param {Object} bill - Bill record object
   * @param {string} paperWidth - Paper width: "58" or "80"
   */
  async function _printViaESCPOS(bill, paperWidth) {
    try {
      if (!printerPort) {
        _showToast('Printer not connected. Falling back to browser print.');
        _printViaBrowser(bill, paperWidth);
        return;
      }

      var data = formatReceiptESCPOS(bill, paperWidth);
      await _sendToPrinter(data);
    } catch (e) {
      console.error('Printer: ESC/POS print failed', e);
      _showToast('Print failed. Using browser print instead.');
      _printViaBrowser(bill, paperWidth);
    }
  }

  // ─── Main Entry Point ───────────────────────────────────────────────────────

  /**
   * Print a bill receipt. Routes to browser print or ESC/POS based on settings.
   * @param {Object} bill - Bill record object with id, date, items, total, totalSavings
   */
  async function printBill(bill) {
    if (!bill) {
      console.warn('Printer: No bill provided');
      return;
    }

    var settings = _getPrinterSettings();

    if (settings.mode === 'escpos') {
      await _printViaESCPOS(bill, settings.paperWidth);
    } else {
      _printViaBrowser(bill, settings.paperWidth);
    }
  }

  // ─── Helper Functions ───────────────────────────────────────────────────────

  /**
   * Parse a bill date string into separate date and time display strings.
   * @param {string} dateStr - ISO date/time string or date string
   * @returns {{ dateStr: string, timeStr: string }}
   */
  function _parseBillDate(dateStr) {
    if (!dateStr) {
      return { dateStr: '', timeStr: '' };
    }

    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        return { dateStr: dateStr, timeStr: '' };
      }

      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var day = String(d.getDate()).padStart(2, '0');
      var mon = months[d.getMonth()];
      var year = d.getFullYear();
      var hours = String(d.getHours()).padStart(2, '0');
      var mins = String(d.getMinutes()).padStart(2, '0');
      var secs = String(d.getSeconds()).padStart(2, '0');

      return {
        dateStr: day + '-' + mon + '-' + year,
        timeStr: hours + ':' + mins + ':' + secs
      };
    } catch (e) {
      return { dateStr: dateStr, timeStr: '' };
    }
  }

  /**
   * Get formatted quantity display string for a line item.
   * Uses Utils.formatQuantity if available.
   * @param {Object} item - Line item object
   * @returns {string} Display quantity string
   */
  function _getDisplayQty(item) {
    var qty = item.qty || item.quantityGrams || 0;
    if (typeof Utils !== 'undefined' && Utils.formatQuantity) {
      return Utils.formatQuantity(qty);
    }
    // Fallback formatting
    if (qty >= 1000) {
      var kg = qty / 1000;
      return (kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)) + ' KG';
    }
    return qty + 'g';
  }

  /**
   * Format a number as Indian Rupee currency string.
   * @param {number} amount - Amount to format
   * @returns {string} Formatted string e.g. "₹80.00"
   */
  function _formatCurrency(amount) {
    if (typeof Utils !== 'undefined' && Utils.formatCurrency) {
      return Utils.formatCurrency(amount);
    }
    return '\u20B9' + Number(amount).toFixed(2);
  }

  /**
   * Get UPI ID from stored settings.
   * @returns {string|null}
   */
  function _getUpiId() {
    try {
      var raw = localStorage.getItem('abcstore_upi_settings');
      if (raw) {
        var s = JSON.parse(raw);
        return s.upiId || null;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * Escape HTML entities to prevent XSS.
   * @param {string} str - Raw string
   * @returns {string} HTML-safe string
   */
  function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Show a toast notification to the user.
   * @param {string} message - Toast message
   */
  function _showToast(message) {
    // Use existing app toast if available
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(message);
      return;
    }

    // Fallback: create a simple toast element
    var toast = document.createElement('div');
    toast.className = 'printer-toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'background:#333;color:#fff;padding:10px 20px;border-radius:4px;z-index:99999;' +
      'font-size:14px;opacity:0;transition:opacity 0.3s;';
    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.style.opacity = '1';
    });

    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4000);
  }

  /**
   * Repeat a character n times.
   * @param {string} char - Character to repeat
   * @param {number} count - Number of repetitions
   * @returns {string}
   */
  function _repeatChar(char, count) {
    var result = '';
    for (var i = 0; i < count; i++) {
      result += char;
    }
    return result;
  }

  /**
   * Pad a string to the right to fill a given width.
   * @param {string} str - Input string
   * @param {number} width - Target width
   * @returns {string}
   */
  function _padRight(str, width) {
    while (str.length < width) {
      str += ' ';
    }
    return str;
  }

  /**
   * Format three columns (item, qty, price) into a fixed-width line.
   * @param {string} col1 - Item name
   * @param {string} col2 - Quantity
   * @param {string} col3 - Price
   * @param {number} totalWidth - Total characters per line
   * @returns {string} Formatted line
   */
  function _padColumns(col1, col2, col3, totalWidth) {
    var col2Width = 8;
    var col3Width = 10;
    var col1Width = totalWidth - col2Width - col3Width;

    // Truncate col1 if too long
    if (col1.length > col1Width) {
      col1 = col1.substring(0, col1Width - 1) + '.';
    }

    // Pad col1 to its width
    while (col1.length < col1Width) {
      col1 += ' ';
    }

    // Right-align col2
    while (col2.length < col2Width) {
      col2 = ' ' + col2;
    }

    // Right-align col3
    while (col3.length < col3Width) {
      col3 = ' ' + col3;
    }

    return col1 + col2 + col3;
  }

  /**
   * Append raw bytes to a byte array.
   * @param {number[]} arr - Target array
   * @param {number[]} bytes - Bytes to append
   */
  function _appendBytes(arr, bytes) {
    for (var i = 0; i < bytes.length; i++) {
      arr.push(bytes[i]);
    }
  }

  /**
   * Encode text and append to byte array.
   * @param {number[]} arr - Target array
   * @param {TextEncoder} encoder - TextEncoder instance
   * @param {string} text - Text to encode
   */
  function _appendText(arr, encoder, text) {
    var encoded = encoder.encode(text);
    for (var i = 0; i < encoded.length; i++) {
      arr.push(encoded[i]);
    }
  }

  // ─── Connection State ───────────────────────────────────────────────────────

  /**
   * Check if the printer is currently connected (ESC/POS mode).
   * @returns {boolean} True if printer port is connected
   */
  function isConnected() {
    return connected;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    printBill: printBill,
    formatReceiptHTML: formatReceiptHTML,
    formatReceiptESCPOS: formatReceiptESCPOS,
    connectPrinter: connectPrinter,
    disconnectPrinter: disconnectPrinter,
    isConnected: isConnected
  };

})();
