/**
 * procurement.js - Procurement Module for BuildCalc
 *
 * Phase 5: Material rollup from estimates, vendor management, RFQ generation.
 *
 * Dependencies: db.js, app.js
 */
'use strict';

const Procurement = (function () {

  var currentProjectId = null;
  var _materialItems   = [];
  var _qtyOverrides    = {};
  var _selectedKeys    = null;
  var _currentRfqData  = null;
  var _rfqPrintHtml    = '';

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var noProjectNotice, projectNameEl;
  var tabBtns, tabPanels;

  // Materials tab
  var materialsTable;

  // Vendors tab
  var vendorsList, vendorsEmpty;
  var vendorFormOverlay, vFldName, vFldContact, vFldPhone, vFldEmail, vFldMaterials;
  var btnVendorSave, btnVendorCancel, btnVendorAdd;
  var editingVendorId = null;

  // RFQ tab
  var rfqVendorSelect, rfqProjectSummary, rfqPreview;
  var btnGenerateRfq, btnPrintRfq;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    noProjectNotice = document.getElementById('proc-no-project');
    // ── Inline no-project selector ──────────────────────────────────────
    var _noProjectSel = document.getElementById('proc-project-select');
    if (_noProjectSel) {
      DB.getAllProjects().then(function(projs) {
        projs.sort(function(a,b){ return a.name.localeCompare(b.name); });
        projs.forEach(function(p) {
          var o = document.createElement('option');
          o.value = p.id; o.textContent = p.name;
          _noProjectSel.appendChild(o);
        });
      });
      _noProjectSel.addEventListener('change', function() {
        if (_noProjectSel.value) { App.setProjectContext(_noProjectSel.value); }
      });
    }

    projectNameEl   = document.getElementById('proc-project-name');
    tabBtns         = document.querySelectorAll('.proc-tab-btn');
    tabPanels       = document.querySelectorAll('.proc-tab-panel');

    materialsTable  = document.getElementById('proc-materials-table');

    vendorsList     = document.getElementById('proc-vendors-list');
    vendorsEmpty    = document.getElementById('proc-vendors-empty');
    vendorFormOverlay = document.getElementById('vendor-form-overlay');
    vFldName      = document.getElementById('v-name');
    vFldContact   = document.getElementById('v-contact');
    vFldPhone     = document.getElementById('v-phone');
    vFldEmail     = document.getElementById('v-email');
    vFldMaterials = document.getElementById('v-materials');
    btnVendorSave   = document.getElementById('btn-vendor-save');
    btnVendorCancel = document.getElementById('btn-vendor-cancel');
    btnVendorAdd    = document.getElementById('btn-vendor-add');

    rfqVendorSelect   = document.getElementById('rfq-vendor-select');
    rfqProjectSummary = document.getElementById('rfq-project-summary');
    rfqPreview        = document.getElementById('rfq-preview');
    btnGenerateRfq    = document.getElementById('btn-generate-rfq');
    btnPrintRfq       = document.getElementById('btn-print-rfq');

    // Select-all checkbox for materials
    var selAllCb = document.getElementById('proc-select-all');
    if (selAllCb) {
      selAllCb.addEventListener('change', function () {
        var cbs = materialsTable ? materialsTable.querySelectorAll('.mat-sel-cb') : [];
        cbs.forEach(function (cb) {
          cb.checked = selAllCb.checked;
          var row = cb.closest('tr');
          if (row) {
            var inp = row.querySelector('.mat-qty-input');
            if (inp) inp.disabled = !selAllCb.checked;
            row.classList.toggle('mat-row-dim', !selAllCb.checked);
          }
        });
        _selectedKeys = selAllCb.checked ? null : new Set();
        _updateSelBadge();
      });
    }

    // Tab switching
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-tab');
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        tabPanels.forEach(function (p) { p.hidden = true; });
        this.classList.add('active');
        document.getElementById('proc-panel-' + target).hidden = false;
        if (target === 'vendors')    renderVendors();
        if (target === 'rfq')        renderRfqSetup();
        if (target === 'saved-rfqs') renderSavedRfqs();
        if (target === 'pos')        renderPOs();
      }.bind(btn));
    });

    if (btnVendorAdd) btnVendorAdd.addEventListener('click', function () { openVendorForm(null); });
    if (btnVendorSave) btnVendorSave.addEventListener('click', saveVendor);
    if (btnVendorCancel) btnVendorCancel.addEventListener('click', function () { vendorFormOverlay.hidden = true; });
    if (vendorFormOverlay) vendorFormOverlay.addEventListener('click', function (e) { if (e.target === vendorFormOverlay) vendorFormOverlay.hidden = true; });

    if (btnGenerateRfq) btnGenerateRfq.addEventListener('click', generateRfq);
    var btnSaveRfq = document.getElementById('btn-save-rfq');
    if (btnSaveRfq) btnSaveRfq.addEventListener('click', saveRfq);

    // Materials tab quick-RFQ button — switch to RFQ tab then generate
    var btnRfqFromMaterials = document.getElementById('btn-rfq-from-materials');
    if (btnRfqFromMaterials) {
      btnRfqFromMaterials.addEventListener('click', function () {
        // Switch to RFQ tab
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        tabPanels.forEach(function (p) { p.hidden = true; });
        var rfqBtn = document.querySelector('.proc-tab-btn[data-tab="rfq"]');
        if (rfqBtn) rfqBtn.classList.add('active');
        var rfqPanel = document.getElementById('proc-panel-rfq');
        if (rfqPanel) rfqPanel.hidden = false;
        renderRfqSetup();
        // If vendor already selected, auto-generate
        if (rfqVendorSelect && rfqVendorSelect.value) generateRfq();
      });
    }
    if (btnPrintRfq) btnPrintRfq.addEventListener('click', function () {
      var w = window.open('','_blank');
      w.document.write('<html><head><title>RFQ</title><style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}@media print{button{display:none}}</style></head><body>');
      w.document.write(_rfqPrintHtml || rfqPreview.innerHTML);
      w.document.write('<br><button onclick="window.print()">Print / Save as PDF</button></body></html>');
      w.document.close();
    });

    renderVendors();
  }

  // ── Project context ───────────────────────────────────────────────────────
  function setProject(projectId) {
    currentProjectId = projectId;
    refresh();
  }

  function refresh() {
    var has = !!currentProjectId;
    if (noProjectNotice) noProjectNotice.hidden = has;
    if (!has) { if (materialsTable) materialsTable.innerHTML = ''; return; }

    DB.getProject(currentProjectId).then(function (p) {
      if (projectNameEl && p) projectNameEl.textContent = p.name;
    });
    renderMaterials();
    renderRfqSetup();
    renderSavedRfqs();
    renderPOs();
  }

  // ── MATERIALS TAB ─────────────────────────────────────────────────────────
  function rollupMaterials(estimates) {
    var totals = {};
    estimates.forEach(function (est) {
      var mr = est.materialResults || {};
      Object.keys(mr).forEach(function (key) {
        var val = mr[key];
        if (typeof val !== 'number' || val <= 0) return;
        var label = key;
        if (!totals[label]) totals[label] = { label: label, value: 0, unit: '', category: est.category };
        totals[label].value += val;
        totals[label].unit  = guessUnit(key, est.unit);
      });
    });
    return Object.values(totals).sort(function (a, b) { return a.category.localeCompare(b.category) || a.label.localeCompare(b.label); });
  }

  function guessUnit(key, unit) {
    var k = key.toLowerCase();
    if (/bag|bags/.test(k))   return 'bags';
    if (/kg|steel/.test(k))   return 'kg';
    if (/ton/.test(k))        return 'tons';
    if (/block/.test(k))      return 'nos';
    if (/tile/.test(k))       return 'nos';
    if (/liter|litre|water/.test(k)) return 'L';
    if (/volume|vol/.test(k)) return unit === 'metric' ? 'cum' : 'Cft';
    if (/area/.test(k))       return unit === 'metric' ? 'sqm' : 'Sft';
    return '';
  }

  function renderMaterials() {
    if (!currentProjectId || !materialsTable) return;
    DB.getEstimatesByProject(currentProjectId).then(function (estimates) {
      var toolbar = document.getElementById('proc-mat-toolbar');
      if (estimates.length === 0) {
        materialsTable.innerHTML = '<tr><td colspan="6" class="proc-empty">No estimates yet.</td></tr>';
        if (toolbar) toolbar.style.display = 'none';
        return;
      }
      _materialItems = rollupMaterials(estimates);
      if (toolbar) toolbar.style.display = 'flex';
      _rebuildMaterialRows();
    });
  }

  function _rebuildMaterialRows() {
    if (!materialsTable || !_materialItems.length) return;
    var html = _materialItems.map(function (item) {
      var isSel = !_selectedKeys || _selectedKeys.has(item.label);
      var overrideQty = _qtyOverrides.hasOwnProperty(item.label)
        ? _qtyOverrides[item.label]
        : round2(item.value);
      var isModified = _qtyOverrides.hasOwnProperty(item.label);
      return '<tr class="mat-row' + (isSel ? '' : ' mat-row-dim') + '" data-key="' + esc(item.label) + '">'
        + '<td><input type="checkbox" class="mat-sel-cb" data-key="' + esc(item.label) + '"'
        + (isSel ? ' checked' : '') + ' aria-label="Include ' + esc(formatLabel(item.label)) + '"></td>'
        + '<td>' + esc(cap(item.category)) + '</td>'
        + '<td>' + esc(formatLabel(item.label)) + '</td>'
        + '<td class="proc-qty">' + round2(item.value) + '</td>'
        + '<td>' + esc(item.unit) + '</td>'
        + '</tr>';
    }).join('');
    materialsTable.innerHTML = html || '<tr><td colspan="6" class="proc-empty">No material data found.</td></tr>';

    // Bind checkbox changes
    materialsTable.querySelectorAll('.mat-sel-cb').forEach(function (cb) {
      cb.addEventListener('change', function () { _onCheckChange(cb); });
    });


    _updateSelBadge();
  }

  function _onCheckChange(cb) {
    var k = cb.getAttribute('data-key');
    if (!_selectedKeys) {
      _selectedKeys = new Set(_materialItems.map(function(i){ return i.label; }));
    }
    if (cb.checked) _selectedKeys.add(k); else _selectedKeys.delete(k);
    if (_selectedKeys.size === _materialItems.length) _selectedKeys = null;
    var row = cb.closest('tr');
    if (row) {
      var inp = row.querySelector('.mat-qty-input');
      if (inp) inp.disabled = !cb.checked;
      row.classList.toggle('mat-row-dim', !cb.checked);
    }
    _updateSelBadge();
  }

  function _updateSelBadge() {
    var badge  = document.getElementById('proc-sel-count');
    var selAll = document.getElementById('proc-select-all');
    var total  = _materialItems.length;
    var selCnt = _selectedKeys ? _selectedKeys.size : total;
    if (badge)  badge.textContent = (selCnt === total ? 'All' : selCnt + ' of ' + total) + ' materials selected';
    if (selAll) {
      selAll.checked       = (selCnt === total);
      selAll.indeterminate = (selCnt > 0 && selCnt < total);
    }
  }

  function formatLabel(key) {
    return key.replace(/([A-Z])/g,' $1').replace(/_/g,' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
  }

  // ── VENDORS TAB ───────────────────────────────────────────────────────────
  function renderVendors() {
    DB.getAllVendors().then(function (vendors) {
      if (vendors.length === 0) {
        if (vendorsList) vendorsList.innerHTML = '';
        if (vendorsEmpty) vendorsEmpty.hidden = false;
        return;
      }
      if (vendorsEmpty) vendorsEmpty.hidden = true;

      var html = vendors.map(function (v) {
        var mats = (v.materials || []).join(', ') || '—';
        return '<div class="list-item vendor-item">'
          + '<div class="list-item-info">'
          + '<div class="list-item-title">' + esc(v.name) + '</div>'
          + '<div class="list-item-subtitle">'
          + (v.contact ? esc(v.contact) + ' · ' : '')
          + (v.email   ? esc(v.email)   + ' · ' : '')
          + (v.phone   ? esc(v.phone)   + ' · ' : '')
          + 'Supplies: ' + esc(mats)
          + '</div></div>'
          + '<div class="list-item-actions">'
          + '<button class="btn-icon btn-vendor-edit" data-id="' + v.id + '" aria-label="Edit">✏️</button>'
          + '<button class="btn-icon btn-vendor-del"  data-id="' + v.id + '" aria-label="Delete">🗑️</button>'
          + '</div></div>';
      }).join('');
      vendorsList.innerHTML = html;

      vendorsList.querySelectorAll('.btn-vendor-edit').forEach(function (btn) {
        btn.addEventListener('click', function () { openVendorForm(this.getAttribute('data-id')); });
      });
      vendorsList.querySelectorAll('.btn-vendor-del').forEach(function (btn) {
        btn.addEventListener('click', function () { deleteVendor(this.getAttribute('data-id')); });
      });
    });
  }

  function openVendorForm(id) {
    editingVendorId = id;
    vFldName.value = vFldContact.value = vFldPhone.value = vFldEmail.value = vFldMaterials.value = '';
    if (id) {
      DB.getVendor(id).then(function (v) {
        if (!v) return;
        vFldName.value      = v.name      || '';
        vFldContact.value   = v.contact   || '';
        vFldPhone.value     = v.phone     || '';
        vFldEmail.value     = v.email     || '';
        vFldMaterials.value = (v.materials || []).join(', ');
        vendorFormOverlay.hidden = false;
        vFldName.focus();
      });
    } else {
      vendorFormOverlay.hidden = false;
      vFldName.focus();
    }
  }

  function saveVendor() {
    var name = vFldName.value.trim();
    if (!name) { vFldName.focus(); showToast('Vendor name required'); return; }
    var mats = vFldMaterials.value.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    var v = { name: name, contact: vFldContact.value.trim(), phone: vFldPhone.value.trim(), email: vFldEmail.value.trim(), materials: mats };
    var p = editingVendorId ? (v.id = editingVendorId, DB.updateVendor(v)) : DB.addVendor(v);
    p.then(function () {
      showToast(editingVendorId ? 'Vendor updated' : 'Vendor added');
      vendorFormOverlay.hidden = true;
      editingVendorId = null;
      renderVendors();
      renderRfqSetup();
    });
  }

  function deleteVendor(id) {
    if (!confirm('Delete this vendor?')) return;
    DB.deleteVendor(id).then(function () { showToast('Vendor deleted'); renderVendors(); renderRfqSetup(); });
  }

  // ── RFQ TAB ───────────────────────────────────────────────────────────────
  function renderRfqSetup() {
    if (!rfqVendorSelect) return;
    DB.getAllVendors().then(function (vendors) {
      var html = '<option value="">Select vendor…</option>';
      vendors.forEach(function (v) {
        html += '<option value="' + v.id + '">' + esc(v.name) + '</option>';
      });
      rfqVendorSelect.innerHTML = html;
    });
  }

  function generateRfq() {
    var vid = rfqVendorSelect.value;
    if (!vid || !currentProjectId) { showToast('Select a vendor and project first'); return; }

    Promise.all([
      DB.getVendor(vid),
      DB.getEstimatesByProject(currentProjectId),
      DB.getProject(currentProjectId)
    ]).then(function (results) {
      var vendor = results[0], estimates = results[1], project = results[2];
      // Use live _materialItems (already rolled up) if available, else recalculate
      var allItems = _materialItems.length ? _materialItems : rollupMaterials(estimates);

      // Apply user qty overrides
      var itemsWithQty = allItems.map(function (item) {
        return Object.assign({}, item, {
          value: _qtyOverrides.hasOwnProperty(item.label) ? _qtyOverrides[item.label] : item.value
        });
      });

      // Filter to user selection
      var userFiltered = _selectedKeys
        ? itemsWithQty.filter(function (item) { return _selectedKeys.has(item.label); })
        : itemsWithQty;

      var vendorMats = (vendor.materials || []).map(function (m) { return m.toLowerCase(); });
      // Further filter by vendor materials if vendor has a list
      var matched = vendorMats.length
        ? userFiltered.filter(function (item) {
            return vendorMats.some(function (m) { return item.label.toLowerCase().indexOf(m) >= 0 || m.indexOf(item.label.toLowerCase()) >= 0; });
          })
        : userFiltered;

      var today = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      var projName = project ? project.name : '—';

      var rows = matched.length
        ? matched.map(function (item, idx) {
            return '<tr data-idx="' + idx + '">'
              + '<td>' + esc(formatLabel(item.label)) + '</td>'
              + '<td>' + esc(cap(item.category)) + '</td>'
              + '<td class="proc-qty-cell">'
              + '<input type="number" id="rfq-qty-' + idx + '" name="rfq-qty-' + idx + '" class="rfq-qty-inp mat-qty-input" data-key="' + esc(item.label) + '"'
              + ' value="' + round2(item.value) + '" min="0" step="any" autocomplete="off"'
              + ' aria-label="Qty for ' + esc(formatLabel(item.label)) + '">'
              + '</td><td>' + esc(item.unit) + '</td>'
              + '<td><button class="btn-icon mat-reset-btn" data-key="' + esc(item.label) + '"'
              + ' data-orig="' + round2(item.value) + '" title="Reset" aria-label="Reset">↺</button></td>'
              + '<td></td></tr>';
          }).join('')
        : '<tr><td colspan="6">No matching materials for this vendor.</td></tr>';

      rfqPreview.innerHTML =
        '<div class="rfq-doc">'
        + '<div class="rfq-header">'
        + '<h2 class="rfq-title">Request for Quotation</h2>'
        + '<div class="rfq-meta"><span><strong>Date:</strong> ' + today + '</span>'
        + '<span><strong>Project:</strong> ' + esc(projName) + '</span></div>'
        + '</div>'
        + '<div class="rfq-parties">'
        + '<div class="rfq-party"><h3>To (Vendor)</h3><p>' + esc(vendor.name) + '</p>'
        + (vendor.contact ? '<p>' + esc(vendor.contact) + '</p>' : '')
        + (vendor.email   ? '<p>' + esc(vendor.email) + '</p>' : '')
        + (vendor.phone   ? '<p>📞 ' + esc(vendor.phone) + '</p>' : '') + '</div>'
        + '<div class="rfq-party rfq-from"><h3>From</h3><p>' + esc(projName) + '</p><p>BuildCalc — ' + today + '</p></div>'
        + '</div>'
        + '<table class="rfq-table">'
        + '<thead><tr><th>Material</th><th>Category</th><th>Qty (edit before saving)</th><th>Unit</th><th>Reset</th><th>Unit Rate</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>'
        + '<div class="rfq-footer">'
        + '<p>Please provide your best rate including delivery. Quote valid for 30 days.</p>'
        + '<p>Signature: __________________________ &nbsp;&nbsp; Date: __________________________</p>'
        + '</div></div>';

      _rfqPrintHtml = rfqPreview.innerHTML;
      // Bind editable qty inputs in the RFQ preview
      rfqPreview.querySelectorAll('.rfq-qty-inp').forEach(function(inp) {
        inp.addEventListener('change', function() {
          var v = parseFloat(inp.value);
          if (isNaN(v) || v < 0) inp.value = inp.getAttribute('data-orig') || 0;
        });
      });
      rfqPreview.querySelectorAll('.mat-reset-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var inp = rfqPreview.querySelector('.rfq-qty-inp[data-key="' + btn.getAttribute('data-key') + '"]');
          if (inp) inp.value = btn.getAttribute('data-orig');
        });
      });

      // Build _currentRfqData from matched items (qty read from inputs at save time)
      _currentRfqData = { projectId: currentProjectId, vendorId: vid,
        vendorName: vendor.name, projectName: projName,
        date: new Date().toISOString(), status: 'open',
        _matchedItems: matched }; // items collected at save time from inputs
      if (btnPrintRfq) btnPrintRfq.hidden = false;
      var _bsr = document.getElementById('btn-save-rfq');
      if (_bsr) _bsr.hidden = false;
    });
  }

  // ── Save RFQ ─────────────────────────────────────────────────────────────
  function saveRfq() {
    if (!_currentRfqData) { showToast('Generate an RFQ first'); return; }
    // Read final quantities from the editable inputs in rfqPreview
    var items = (_currentRfqData._matchedItems || []).map(function(item) {
      var inp = rfqPreview ? rfqPreview.querySelector('.rfq-qty-inp[data-key="' + item.label + '"]') : null;
      var qty = inp ? (parseFloat(inp.value) || round2(item.value)) : round2(item.value);
      return { label: item.label, category: item.category, unit: item.unit, qty: qty, unitPrice: null };
    });
    var rfq = {
      projectId:   _currentRfqData.projectId,
      vendorId:    _currentRfqData.vendorId,
      vendorName:  _currentRfqData.vendorName,
      projectName: _currentRfqData.projectName,
      date:        _currentRfqData.date,
      status:      'open',
      items:       items,
      savedAt:     new Date().toISOString()
    };
    console.log("[saveRfq] calling DB.addRfq, rfq=", JSON.stringify(rfq).slice(0,100));
    console.log("[saveRfq] DB.addRfq type:", typeof DB.addRfq);
    DB.addRfq(rfq)
      .then(function() {
        showToast('RFQ saved ✓');
        _currentRfqData = null;
        _rfqPrintHtml = '';
        var b = document.getElementById('btn-save-rfq'); if (b) b.hidden = true;
        if (btnPrintRfq) btnPrintRfq.hidden = true;
        if (rfqPreview) rfqPreview.innerHTML = '';
        // Auto-switch to Saved RFQs tab
        tabBtns.forEach(function(tb){ tb.classList.remove('active'); tb.removeAttribute('aria-selected'); });
        tabPanels.forEach(function(tp){ tp.hidden = true; });
        var srBtn = document.querySelector('.proc-tab-btn[data-tab="saved-rfqs"]');
        var srPanel = document.getElementById('proc-panel-saved-rfqs');
        if (srBtn)   { srBtn.classList.add('active'); srBtn.setAttribute('aria-selected','true'); }
        if (srPanel) srPanel.hidden = false;
        renderSavedRfqs();
      })
      .catch(function(e){ showToast('Save failed: ' + (e.message || e)); console.error(e); });
  }
  function renderSavedRfqs() {
    if (!currentProjectId) {
      var list = document.getElementById('saved-rfqs-list');
      if (list) list.innerHTML = '<p class="panel-hint">Select Project context above to view saved RFQs.</p>';
      return;
    }
    var list = document.getElementById('saved-rfqs-list');
    var empty = document.getElementById('saved-rfqs-empty');
    DB.getRfqsByProject(currentProjectId).then(function(rfqs) {
      if (!rfqs.length) { if(list) list.innerHTML=''; if(empty) empty.hidden=false; return; }
      if (empty) empty.hidden = true;
      var html = rfqs.sort(function(a,b){ return b.savedAt>a.savedAt?1:-1; }).map(function(r) {
        var d = new Date(r.savedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
        var sl = r.status==='po-raised' ? '<span class="rfq-status-done">✅ PO Raised</span>' : '<span class="rfq-status-open">🟡 Open</span>';
        return '<div class="list-item rfq-list-item">'
          +'<div class="list-item-info"><div class="list-item-title">RFQ — '+esc(r.vendorName)+'</div>'
          +'<div class="list-item-subtitle">'+d+' · '+r.items.length+' items &nbsp;'+sl+'</div></div>'
          +'<div class="list-item-actions">'
          +'<button class="btn-outlined btn-sm btn-open-rfq" data-id="'+r.id+'">Open</button>'
          +'<button class="btn-icon btn-del-rfq" data-id="'+r.id+'" aria-label="Delete">🗑️</button>'
          +'</div></div>';
      }).join('');
      if (list) list.innerHTML = html;
      list.querySelectorAll('.btn-open-rfq').forEach(function(btn){
        btn.addEventListener('click',function(){ openRfqEditor(btn.getAttribute('data-id')); });
      });
      list.querySelectorAll('.btn-del-rfq').forEach(function(btn){
        btn.addEventListener('click',function(){
          if (!confirm('Delete this RFQ?')) return;
          DB.deleteRfq(btn.getAttribute('data-id')).then(renderSavedRfqs);
        });
      });
    });
  }
  function openRfqEditor(rfqId) {
    DB.getRfq(rfqId).then(function(rfq) {
      if (!rfq) return;
      var list = document.getElementById('saved-rfqs-list');
      if (!list) return;
      var rows = rfq.items.map(function(item,idx) {
        var up = item.unitPrice!=null ? item.unitPrice : '';
        var tot = up!=='' ? round2(item.qty*up) : '';
        return '<tr data-idx="'+idx+'">'
          +'<td><input type="checkbox" class="po-item-cb" checked aria-label="Include"></td>'
          +'<td>'+esc(cap(item.category))+'</td><td>'+esc(formatLabel(item.label))+'</td>'
          +'<td><input type="number" class="mat-qty-input po-qty-inp" value="'+item.qty+'" min="0" step="any" autocomplete="off" aria-label="Qty"></td>'
          +'<td>'+esc(item.unit)+'</td>'
          +'<td><input type="number" class="mat-qty-input po-price-inp" value="'+up+'" min="0" step="any" placeholder="Enter price" autocomplete="off" aria-label="Unit price"></td>'
          +'<td class="po-total-cell">'+(tot!==''?tot:'—')+'</td></tr>';
      }).join('');
      list.innerHTML =
        '<div class="rfq-editor">'
        +'<div class="rfq-editor-header"><div>'
        +'<h3 style="margin:0">RFQ — '+esc(rfq.vendorName)+'</h3>'
        +'<p class="panel-hint" style="margin:4px 0 0">Enter unit prices from vendor. Uncheck items to exclude from PO.</p>'
        +'</div><button class="btn-outlined btn-sm" id="btn-back-rfq-list">← Back</button></div>'
        +'<div class="proc-table-wrap"><table class="proc-table rfq-editor-table">'
        +'<thead><tr>'
        +'<th style="width:32px"><span class="sr-only">Include</span></th>'
        +'<th>Category</th><th>Material</th><th>Qty</th><th>Unit</th>'
        +'<th>Unit Price</th><th>Total</th>'
        +'</tr></thead><tbody id="rfq-editor-body">'+rows+'</tbody></table></div>'
        +'<div class="rfq-editor-footer">'
        +'<div class="rfq-grand-total">Grand Total: <strong id="rfq-grand-total-val">—</strong></div>'
        +'<div style="display:flex;gap:8px">'
        +'<button class="btn-outlined" id="btn-cancel-rfq-edit">Cancel</button>'
        +'<button class="btn-primary" id="btn-generate-po">🧾 Generate &amp; Save PO</button>'
        +'</div></div></div>';
      function recalc() {
        var grand=0, has=false;
        list.querySelectorAll('tr[data-idx]').forEach(function(tr) {
          var cb=tr.querySelector('.po-item-cb');
          var qty=parseFloat(tr.querySelector('.po-qty-inp').value)||0;
          var up=parseFloat(tr.querySelector('.po-price-inp').value);
          var tc=tr.querySelector('.po-total-cell');
          if (!isNaN(up)) { var t=round2(qty*up); tc.textContent=t; if(cb&&cb.checked){grand+=t;has=true;} }
          else { tc.textContent='—'; }
        });
        var el=document.getElementById('rfq-grand-total-val');
        if(el) el.textContent = has ? round2(grand) : '—';
      }
      list.querySelectorAll('.po-price-inp,.po-qty-inp').forEach(function(i){ i.addEventListener('input',recalc); });
      list.querySelectorAll('.po-item-cb').forEach(function(cb){
        cb.addEventListener('change',function(){
          var row=cb.closest('tr'); if(row) row.classList.toggle('mat-row-dim',!cb.checked); recalc();
        });
      });
      recalc();
      document.getElementById('btn-back-rfq-list').addEventListener('click',renderSavedRfqs);
      document.getElementById('btn-cancel-rfq-edit').addEventListener('click',renderSavedRfqs);
      document.getElementById('btn-generate-po').addEventListener('click',function(){ _generateAndSavePO(rfq,list); });
    });
  }
  function _generateAndSavePO(rfq, container) {
    var items=[], grand=0, missingPrice=false;
    container.querySelectorAll('tr[data-idx]').forEach(function(tr,idx) {
      var cb=tr.querySelector('.po-item-cb');
      if (!cb||!cb.checked) return;
      var qty=parseFloat(tr.querySelector('.po-qty-inp').value)||0;
      var up=parseFloat(tr.querySelector('.po-price-inp').value);
      if (isNaN(up)) { missingPrice=true; return; }
      var tot=round2(qty*up); grand+=tot;
      var src=rfq.items[idx]||{};
      items.push({label:src.label,category:src.category,unit:src.unit,qty:qty,unitPrice:up,total:tot});
    });
    if (missingPrice) { showToast('Enter a price for all included items'); return; }
    if (!items.length) { showToast('Select at least one item'); return; }
    var po = { projectId:rfq.projectId, rfqId:rfq.id, vendorId:rfq.vendorId,
      vendorName:rfq.vendorName, projectName:rfq.projectName,
      status:'draft', items:items, grandTotal:round2(grand), raisedAt:new Date().toISOString() };
    Promise.all([DB.addPO(po), DB.updateRfq(Object.assign({},rfq,{status:'po-raised'}))])
      .then(function(){
        showToast('Purchase Order saved ✓');
        tabBtns.forEach(function(b){ b.classList.remove('active'); });
        tabPanels.forEach(function(p){ p.hidden=true; });
        var pb=document.querySelector('.proc-tab-btn[data-tab="pos"]');
        if (pb) pb.classList.add('active');
        var pp=document.getElementById('proc-panel-pos'); if(pp) pp.hidden=false;
        renderPOs();
      }).catch(function(e){ showToast('Error: '+e.message); });
  }
  function renderPOs() {
    if (!currentProjectId) return;
    var list=document.getElementById('pos-list');
    var empty=document.getElementById('pos-empty');
    DB.getPOsByProject(currentProjectId).then(function(pos) {
      if (!pos.length) { if(list) list.innerHTML=''; if(empty) empty.hidden=false; return; }
      if (empty) empty.hidden=true;
      var html = pos.sort(function(a,b){ return b.raisedAt>a.raisedAt?1:-1; }).map(function(po) {
        var d=new Date(po.raisedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
        var rows=po.items.map(function(item){
          return '<tr><td>'+esc(cap(item.category))+'</td><td>'+esc(formatLabel(item.label))
            +'</td><td>'+item.qty+' '+esc(item.unit)+'</td>'
            +'<td style="text-align:right">'+round2(item.unitPrice)+'</td>'
            +'<td style="text-align:right">'+round2(item.total)+'</td></tr>';
        }).join('');
        return '<div class="list-item po-list-item"><div style="width:100%">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
          +'<div><div class="list-item-title">PO — '+esc(po.vendorName)+'</div>'
          +'<div class="list-item-subtitle">'+d+' · Grand Total: <strong>'+round2(po.grandTotal)+'</strong></div></div>'
          +'<div style="display:flex;gap:6px">'
          +'<button class="btn-outlined btn-sm btn-print-po" data-id="'+po.id+'">🖨️ Print</button>'
          +'<button class="btn-icon btn-del-po" data-id="'+po.id+'" aria-label="Delete">🗑️</button>'
          +'</div></div>'
          +'<div class="proc-table-wrap"><table class="proc-table">'
          +'<thead><tr><th>Category</th><th>Material</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>'
          +'<tbody>'+rows+'</tbody>'
          +'<tfoot><tr><td colspan="4" style="text-align:right;font-weight:600;padding:7px 10px">Grand Total</td>'
          +'<td style="font-weight:600;text-align:right;padding:7px 10px">'+round2(po.grandTotal)+'</td></tr></tfoot>'
          +'</table></div></div></div>';
      }).join('');
      if (list) list.innerHTML=html;
      list.querySelectorAll('.btn-print-po').forEach(function(btn){
        btn.addEventListener('click',function(){ _printPO(btn.getAttribute('data-id')); });
      });
      list.querySelectorAll('.btn-del-po').forEach(function(btn){
        btn.addEventListener('click',function(){
          if (!confirm('Delete this PO?')) return;
          DB.deletePO(btn.getAttribute('data-id')).then(renderPOs);
        });
      });
    });
  }
  function _printPO(poId) {
    DB.getPO(poId).then(function(po) {
      if (!po) return;
      var d=new Date(po.raisedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      var rows=po.items.map(function(item,i){
        return '<tr><td>'+(i+1)+'</td><td>'+cap(item.category)+'</td><td>'+formatLabel(item.label)
          +'</td><td>'+item.qty+' '+item.unit+'</td>'
          +'<td style="text-align:right">'+round2(item.unitPrice)+'</td>'
          +'<td style="text-align:right">'+round2(item.total)+'</td></tr>';
      }).join('');
      var w=window.open('','_blank');
      w.document.write('<html><head><title>Purchase Order</title>'
        +'<style>body{font-family:Arial,sans-serif;padding:32px;font-size:13px}'
        +'h2{color:#1b4f8a}table{width:100%;border-collapse:collapse;margin-top:16px}'
        +'th,td{border:1px solid #ccc;padding:7px 10px;text-align:left}'
        +'th{background:#d6e4f0;color:#1b4f8a}tfoot td{font-weight:700;background:#f2f2f2}'
        +'.meta{display:flex;gap:40px;margin:12px 0}'
        +'@media print{button{display:none}}</style></head><body>'
        +'<h2>Purchase Order</h2>'
        +'<div class="meta"><span><strong>Project:</strong> '+po.projectName+'</span>'
        +'<span><strong>Vendor:</strong> '+po.vendorName+'</span>'
        +'<span><strong>Date:</strong> '+d+'</span></div>'
        +'<table><thead><tr><th>#</th><th>Category</th><th>Material</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>'
        +'<tbody>'+rows+'</tbody>'
        +'<tfoot><tr><td colspan="5" style="text-align:right">Grand Total</td>'
        +'<td style="text-align:right">'+round2(po.grandTotal)+'</td></tr></tfoot></table>'
        +'<div style="margin-top:48px;display:flex;justify-content:space-between">'
        +'<p>Raised by: ____________________</p><p>Approved by: ____________________</p></div>'
        +'<button onclick="window.print()" style="margin-top:16px;padding:8px 20px;background:#1b4f8a;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨️ Print / Save PDF</button>'
        +'</body></html>');
      w.document.close();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function cap(s)    { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function round2(v) { return Math.round(v * 100) / 100; }
  function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function showToast(msg) {
    var t = document.getElementById('toast'), m = document.getElementById('toast-message');
    if (t && m) { m.textContent = msg; t.hidden = false; setTimeout(function () { t.hidden = true; }, 3000); }
  }

  return {
    init: init,
    setProject: setProject,
    refresh: refresh
  };
})();
