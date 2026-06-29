/**
 * settings.js - Settings Module for BuildCalc
 *
 * Full CRUD for block sizes, labor rates, steel percentages, and custom calculations.
 * Inline edit forms with formula validation via FormulaEngine.
 * Unit/theme toggles and data import/export preserved.
 *
 * Feature: buildcalc-dynamic-config
 * Tasks: 7.1, 7.2, 7.3, 7.4, 7.5
 * Dependencies: db.js, config.js, formula-engine.js
 */
'use strict';

const Settings = (function () {
  // ─── Formula Variable Scopes ─────────────────────────────────────────────

  var FORMULA_SCOPES = {
    masonry: ['volume', 'blockVol', 'ratio_cement', 'ratio_sand', 'mortarFactor', 'bagVolume'],
    concreting: ['volume', 'ratio_cement', 'ratio_sand', 'ratio_crush', 'mortarFactor', 'bagVolume'],
    steel: ['volume', 'percentage', 'density', 'volumeCum'],
    plastering: ['area', 'thickness', 'ratio_cement', 'ratio_sand', 'mortarFactor', 'bagVolume'],
    tiling: ['floorArea', 'tileArea'],
    labor: ['quantity', 'rate']
  };

  // ─── DOM References ──────────────────────────────────────────────────────

  var unitToggle;
  var themeToggle;
  var blockSizesList;
  var laborRatesList;
  var steelPercentagesList;
  var customCalcsList;
  var btnExport;
  var btnImport;
  var importFileInput;
  var btnAddBlockSize;
  var btnAddLaborRate;
  var btnAddSteelPct;
  var btnAddCustomCalc;

  // ─── Initialization ──────────────────────────────────────────────────────

  function init() {
    unitToggle = document.getElementById('unit-toggle');
    themeToggle = document.getElementById('theme-toggle');
    blockSizesList = document.getElementById('block-sizes-list');
    laborRatesList = document.getElementById('labor-rates-list');
    steelPercentagesList = document.getElementById('steel-percentages-list');
    customCalcsList = document.getElementById('custom-calcs-list');
    btnExport = document.getElementById('btn-export-data');
    btnImport = document.getElementById('btn-import-data');
    importFileInput = document.getElementById('import-file-input');
    btnAddBlockSize = document.getElementById('btn-add-block-size');
    btnAddLaborRate = document.getElementById('btn-add-labor-rate');
    btnAddSteelPct = document.getElementById('btn-add-steel-pct');
    btnAddCustomCalc = document.getElementById('btn-add-custom-calc');

    // Bind toggle events
    if (unitToggle) {
      unitToggle.addEventListener('change', function () {
        var unit = unitToggle.checked ? 'metric' : 'imperial';
        App.setUnit(unit);
        showToast('Unit set to ' + (unit === 'metric' ? 'Metric' : 'Imperial'));
      });
    }

    if (themeToggle) {
      themeToggle.addEventListener('change', function () {
        var theme = themeToggle.checked ? 'dark' : 'light';
        App.setTheme(theme);
        showToast('Theme set to ' + (theme === 'dark' ? 'Dark' : 'Light'));
      });
    }

    // Bind export/import
    if (btnExport) btnExport.addEventListener('click', exportData);
    if (btnImport) {
      btnImport.addEventListener('click', function () {
        importFileInput.click();
      });
    }
    if (importFileInput) {
      importFileInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (file) {
          importData(file);
          importFileInput.value = '';
        }
      });
    }

    // Bind Add buttons
    if (btnAddBlockSize) btnAddBlockSize.addEventListener('click', function () { showBlockSizeForm(null); });
    if (btnAddLaborRate) btnAddLaborRate.addEventListener('click', function () { showLaborRateForm(null); });
    if (btnAddSteelPct) btnAddSteelPct.addEventListener('click', function () { showSteelPctForm(null); });
    if (btnAddCustomCalc) btnAddCustomCalc.addEventListener('click', function () { showCustomCalcForm(null); });

    // License UI
    _initLicenseUI();

    // Base Assumptions
    var btnSaveAssumptions = document.getElementById('btn-save-assumptions');
    if (btnSaveAssumptions) {
      // Load current values into inputs
      var cementBagCftInput = document.getElementById('cement-bag-cft');
      var cementBagCumInput = document.getElementById('cement-bag-cum');
      var mortarFactorImpInput = document.getElementById('mortar-factor-imperial');
      var mortarFactorMetInput = document.getElementById('mortar-factor-metric');
      var concreteDensityInput = document.getElementById('concrete-density');
      var mortarJointInput = document.getElementById('mortar-joint-input');

      // Populate from current config
      var allConfig = Config.getAll();
      if (cementBagCftInput) cementBagCftInput.value = allConfig.cementBagVolume ? allConfig.cementBagVolume.cft : 1.25;
      if (cementBagCumInput) cementBagCumInput.value = allConfig.cementBagVolume ? allConfig.cementBagVolume.cum : 0.035;
      if (mortarFactorImpInput) mortarFactorImpInput.value = allConfig.mortarFactor ? allConfig.mortarFactor.imperial : 1.33;
      if (mortarFactorMetInput) mortarFactorMetInput.value = allConfig.mortarFactor ? allConfig.mortarFactor.metric : 1.33;
      if (concreteDensityInput) concreteDensityInput.value = allConfig.concreteDensity || 2400;
      if (mortarJointInput) mortarJointInput.value = allConfig.mortarJointThickness || 0.25;

      btnSaveAssumptions.addEventListener('click', function () {
        var cfg = Config.getAll();
        var cft = parseFloat(cementBagCftInput.value);
        var cum = parseFloat(cementBagCumInput.value);
        var mfImp = parseFloat(mortarFactorImpInput.value);
        var mfMet = parseFloat(mortarFactorMetInput.value);
        var density = parseFloat(concreteDensityInput.value);
        var joint = parseFloat(mortarJointInput.value);

        if (isNaN(cft) || cft <= 0 || isNaN(cum) || cum <= 0 || isNaN(mfImp) || mfImp < 1 || isNaN(mfMet) || mfMet < 1 || isNaN(density) || density <= 0 || isNaN(joint) || joint <= 0) {
          showToast('Please enter valid positive numbers');
          return;
        }

        cfg.cementBagVolume = { cft: cft, cum: cum };
        cfg.mortarFactor = { imperial: mfImp, metric: mfMet };
        cfg.concreteDensity = density;
        cfg.mortarJointThickness = joint;
        DB.saveConfig(cfg).then(function () {
          showToast('Base assumptions saved');
        });
      });
    }

    // Set toggle states
    renderUnitToggle();
    renderThemeToggle();

    // Render config sections
    renderSections();
  }

  // ─── Render All Sections ─────────────────────────────────────────────────

  function renderSections() {
    renderBlockSizes();
    renderLaborRates();
    renderSteelPercentages();
    renderCustomCalculations();
    return Promise.resolve();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.1 BLOCK SIZE CRUD UI
  // ═══════════════════════════════════════════════════════════════════════════

  function renderBlockSizes() {
    if (!blockSizesList) return;
    var blockSizes = Config.getBlockSizes();
    var html = '';

    if (blockSizes.length === 0) {
      html = '<p class="empty-hint">No block sizes configured.</p>';
    } else {
      blockSizes.forEach(function (bs) {
        html +=
          '<div class="config-item" data-id="' + escapeAttr(bs.id) + '">' +
          '<div class="config-item-info">' +
          '<span class="config-item-label">' + escapeHtml(bs.label) + '</span>' +
          '<span class="config-item-value">Cft: ' + bs.volCft + ' | Cu.m: ' + bs.volCum + '</span>' +
          (bs.formula ? '<span class="config-item-hint">Formula: ' + escapeHtml(bs.formula) + '</span>' : '') +
          '</div>' +
          '<div class="config-item-actions">' +
          '<button class="btn-icon btn-edit-block" data-id="' + escapeAttr(bs.id) + '" aria-label="Edit ' + escapeAttr(bs.label) + '" title="Edit">✏️</button>' +
          '<button class="btn-icon btn-delete-block" data-id="' + escapeAttr(bs.id) + '" aria-label="Delete ' + escapeAttr(bs.label) + '" title="Delete">🗑️</button>' +
          '</div>' +
          '</div>';
      });
    }

    blockSizesList.innerHTML = html;

    // Bind edit/delete buttons
    blockSizesList.querySelectorAll('.btn-edit-block').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var sizes = Config.getBlockSizes();
        var item = sizes.find(function (s) { return s.id === id; });
        if (item) showBlockSizeForm(item);
      });
    });
    blockSizesList.querySelectorAll('.btn-delete-block').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        DB.exportAll().then(function (data) {
          var count = 0;
          if (data.estimates) {
            data.estimates.forEach(function (est) {
              if (est.inputs && est.inputs.blockSizeId === id) count++;
            });
          }
          var msg = 'Are you sure you want to delete this block size?';
          if (count > 0) {
            msg += ' WARNING: ' + count + ' estimate(s) reference this item. Note: Project snapshots are not affected.';
          }
          return confirmDialog(msg);
        }).then(function (confirmed) {
          if (confirmed) {
            Config.deleteBlockSize(id).then(function () {
              renderBlockSizes();
              showToast('Block size deleted');
            });
          }
        });
      });
    });
  }

  function showBlockSizeForm(existing) {
    if (!blockSizesList) return;
    // Remove any existing inline form
    removeInlineForm(blockSizesList);

    var isEdit = !!existing;
    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.setAttribute('data-section', 'blockSizes');

    form.innerHTML =
      '<div class="form-group">' +
      '<label for="bs-label">Label *</label>' +
      '<input id="bs-label" type="text" name="label" autocomplete="off" placeholder="e.g. 8×4×16" value="' + (isEdit ? escapeAttr(existing.label) : '') + '" required>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="bs-volCft">Volume (Cft) *</label>' +
      '<input id="bs-volCft" type="number" name="volCft" autocomplete="off" step="any" min="0.001" placeholder="0.296" value="' + (isEdit ? existing.volCft : '') + '" required>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="bs-volCum">Volume (Cu.m) *</label>' +
      '<input id="bs-volCum" type="number" name="volCum" autocomplete="off" step="any" min="0.001" placeholder="0.00839" value="' + (isEdit ? existing.volCum : '') + '" required>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="bs-formula">Formula (optional)</label>' +
      '<textarea id="bs-formula" name="formula" autocomplete="off" rows="2" placeholder="e.g. volume * blockVol">' + (isEdit && existing.formula ? escapeHtml(existing.formula) : '') + '</textarea>' +
      '<span class="formula-status"></span>' +
      '</div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button>' +
      '</div>';

    blockSizesList.insertBefore(form, blockSizesList.firstChild);

    // Formula validation on input
    var formulaField = form.querySelector('textarea[name="formula"]');
    var formulaStatus = form.querySelector('.formula-status');
    attachFormulaValidation(formulaField, formulaStatus, 'masonry');

    // Save handler
    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var label = form.querySelector('input[name="label"]').value.trim();
      var volCft = parseFloat(form.querySelector('input[name="volCft"]').value);
      var volCum = parseFloat(form.querySelector('input[name="volCum"]').value);
      var formula = formulaField.value.trim();

      // Validate
      var valid = true;
      var msgs = form.querySelectorAll('.validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });

      if (!label) {
        msgs[0].textContent = 'Label is required';
        valid = false;
      }
      if (isNaN(volCft) || volCft <= 0) {
        msgs[1].textContent = 'A positive number is required';
        valid = false;
      }
      if (isNaN(volCum) || volCum <= 0) {
        msgs[2].textContent = 'A positive number is required';
        valid = false;
      }
      if (formula && !isFormulaValid(formula, 'masonry')) {
        valid = false; // formula-status already shows error
      }
      if (!valid) return;

      var sizeObj = {
        id: isEdit ? existing.id : label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '_' + Date.now(),
        label: label,
        volCft: volCft,
        volCum: volCum
      };
      if (formula) sizeObj.formula = formula;

      var promise = isEdit
        ? Config.updateBlockSize(existing.id, sizeObj)
        : Config.addBlockSize(sizeObj);

      promise.then(function () {
        renderBlockSizes();
        showToast(isEdit ? 'Block size updated' : 'Block size added');
      });
    });

    // Cancel handler
    form.querySelector('.btn-cancel-item').addEventListener('click', function () {
      form.remove();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.2 LABOR RATE CRUD UI
  // ═══════════════════════════════════════════════════════════════════════════

  function renderLaborRates() {
    if (!laborRatesList) return;
    var laborRates = Config.getLaborRates();
    var html = '';
    var categories = Object.keys(laborRates);

    if (categories.length === 0) {
      html = '<p class="empty-hint">No labor rates configured.</p>';
    } else {
      categories.forEach(function (category) {
        var rate = laborRates[category];
        var label = category.charAt(0).toUpperCase() + category.slice(1);
        var rateStr;

        if (category === 'steel') {
          rateStr = rate.rate + ' ' + rate.unit;
        } else {
          rateStr = (rate.imperial ? rate.imperial.rate + ' ' + rate.imperial.unit : '') +
                    (rate.imperial && rate.metric ? ' | ' : '') +
                    (rate.metric ? rate.metric.rate + ' ' + rate.metric.unit : '');
        }

        var crewStr = rate.crew ? rate.crew.map(function (c) { return c.count + '× ' + c.role; }).join(', ') : '';

        html +=
          '<div class="config-item" data-category="' + escapeAttr(category) + '">' +
          '<div class="config-item-info">' +
          '<span class="config-item-label">' + escapeHtml(label) + '</span>' +
          '<span class="config-item-value">' + escapeHtml(rateStr) + '</span>' +
          (crewStr ? '<span class="config-item-hint">Crew: ' + escapeHtml(crewStr) + '</span>' : '') +
          (rate.formula ? '<span class="config-item-hint">Formula: ' + escapeHtml(rate.formula) + '</span>' : '') +
          '</div>' +
          '<div class="config-item-actions">' +
          '<button class="btn-icon btn-edit-labor" data-category="' + escapeAttr(category) + '" aria-label="Edit ' + escapeAttr(label) + '" title="Edit">✏️</button>' +
          '<button class="btn-icon btn-delete-labor" data-category="' + escapeAttr(category) + '" aria-label="Delete ' + escapeAttr(label) + '" title="Delete">🗑️</button>' +
          '</div>' +
          '</div>';
      });
    }

    laborRatesList.innerHTML = html;

    // Bind edit/delete
    laborRatesList.querySelectorAll('.btn-edit-labor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-category');
        var rates = Config.getLaborRates();
        showLaborRateForm({ category: cat, data: rates[cat] });
      });
    });
    laborRatesList.querySelectorAll('.btn-delete-labor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-category');
        DB.exportAll().then(function (data) {
          var count = 0;
          if (data.estimates) {
            data.estimates.forEach(function (est) {
              if (est.category === cat) count++;
            });
          }
          var msg = 'Are you sure you want to delete the "' + cat + '" labor rate?';
          if (count > 0) {
            msg += ' WARNING: ' + count + ' estimate(s) reference this item. Note: Project snapshots are not affected.';
          }
          return confirmDialog(msg);
        }).then(function (confirmed) {
          if (confirmed) {
            Config.deleteLaborRate(cat).then(function () {
              renderLaborRates();
              showToast('Labor rate deleted');
            });
          }
        });
      });
    });
  }

  function showLaborRateForm(existing) {
    if (!laborRatesList) return;
    removeInlineForm(laborRatesList);

    var isEdit = !!(existing && existing.data);
    var data = isEdit ? existing.data : {};
    var cat = isEdit ? existing.category : '';

    var crewHtml = '';
    var crew = data.crew || [{ role: '', count: 1 }];
    crew.forEach(function (c, idx) {
      crewHtml += buildCrewRow(c.role, c.count, idx);
    });

    var isSteelType = (cat === 'steel');

    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.setAttribute('data-section', 'laborRates');

    form.innerHTML =
      '<div class="form-group">' +
      '<label for="lr-category">Category Name *</label>' +
      '<input id="lr-category" type="text" name="category" autocomplete="off" placeholder="e.g. masonry" value="' + escapeAttr(cat) + '" ' + (isEdit ? 'readonly' : '') + ' required>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<p class="form-group-label">Crew Members</p>' +
      '<div class="crew-rows" role="group" aria-label="Crew members">' + crewHtml + '</div>' +
      '<button type="button" class="btn-outlined btn-sm btn-add-crew">+ Add Crew</button>' +
      '</div>' +
      '<div class="form-group form-group-rates">' +
      '<label for="lr-imperial">Imperial Rate *</label>' +
      '<div class="rate-input-row">' +
      '<input id="lr-imperial" type="number" name="imperialRate" autocomplete="off" step="any" min="0.01" placeholder="40" value="' + (data.imperial ? data.imperial.rate : (isSteelType && data.rate ? data.rate : '')) + '">' +
      '<input aria-label="Imperial unit" type="text" name="imperialUnit" autocomplete="off" placeholder="Cft/day" value="' + escapeAttr(data.imperial ? data.imperial.unit : (isSteelType && data.unit ? data.unit : '')) + '">' +
      '</div>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group form-group-rates">' +
      '<label for="lr-metric">Metric Rate *</label>' +
      '<div class="rate-input-row">' +
      '<input id="lr-metric" type="number" name="metricRate" autocomplete="off" step="any" min="0.01" placeholder="1.15" value="' + (data.metric ? data.metric.rate : '') + '">' +
      '<input aria-label="Metric unit" type="text" name="metricUnit" autocomplete="off" placeholder="Cu.m/day" value="' + escapeAttr(data.metric ? data.metric.unit : '') + '">' +
      '</div>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="lr-formula">Formula (optional)</label>' +
      '<textarea id="lr-formula" name="formula" autocomplete="off" rows="2" placeholder="e.g. quantity * rate">' + (data.formula ? escapeHtml(data.formula) : '') + '</textarea>' +
      '<span class="formula-status"></span>' +
      '</div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button>' +
      '</div>';

    laborRatesList.insertBefore(form, laborRatesList.firstChild);

    // Add crew row button
    form.querySelector('.btn-add-crew').addEventListener('click', function () {
      var crewRows = form.querySelector('.crew-rows');
      var idx = crewRows.querySelectorAll('.crew-row').length;
      crewRows.insertAdjacentHTML('beforeend', buildCrewRow('', 1, idx));
    });

    // Formula validation
    var formulaField = form.querySelector('textarea[name="formula"]');
    var formulaStatus = form.querySelector('.formula-status');
    attachFormulaValidation(formulaField, formulaStatus, 'labor');

    // Save
    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var categoryName = form.querySelector('input[name="category"]').value.trim().toLowerCase();
      var imperialRate = parseFloat(form.querySelector('input[name="imperialRate"]').value);
      var imperialUnit = form.querySelector('input[name="imperialUnit"]').value.trim();
      var metricRate = parseFloat(form.querySelector('input[name="metricRate"]').value);
      var metricUnit = form.querySelector('input[name="metricUnit"]').value.trim();
      var formula = formulaField.value.trim();

      // Gather crew
      var crewInputs = form.querySelectorAll('.crew-row');
      var crewArr = [];
      crewInputs.forEach(function (row) {
        var role = row.querySelector('input[name="crewRole"]').value.trim();
        var count = parseInt(row.querySelector('input[name="crewCount"]').value, 10);
        if (role && count > 0) crewArr.push({ role: role, count: count });
      });

      // Validate
      var valid = true;
      var msgs = form.querySelectorAll('.form-group > .validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });

      if (!categoryName) {
        msgs[0].textContent = 'Category name is required';
        valid = false;
      }
      if (isNaN(imperialRate) || imperialRate <= 0) {
        msgs[1].textContent = 'A positive number is required';
        valid = false;
      }
      if (isNaN(metricRate) || metricRate <= 0) {
        msgs[2].textContent = 'A positive number is required';
        valid = false;
      }
      if (formula && !isFormulaValid(formula, 'labor')) {
        valid = false;
      }
      if (!valid) return;

      var rateObj = {
        crew: crewArr.length > 0 ? crewArr : [{ role: 'Worker', count: 1 }],
        imperial: { rate: imperialRate, unit: imperialUnit || 'units/day' },
        metric: { rate: metricRate, unit: metricUnit || 'units/day' }
      };
      if (formula) rateObj.formula = formula;

      var promise = isEdit
        ? Config.updateLaborRate(categoryName, rateObj)
        : Config.addLaborRate(categoryName, rateObj);

      promise.then(function () {
        renderLaborRates();
        showToast(isEdit ? 'Labor rate updated' : 'Labor rate added');
      });
    });

    // Cancel
    form.querySelector('.btn-cancel-item').addEventListener('click', function () {
      form.remove();
    });
  }

  function buildCrewRow(role, count, idx) {
    var n = idx + 1;
    return '<div class="crew-row" data-idx="' + idx + '">' +
      '<input aria-label="Crew role ' + n + '" autocomplete="off" type="text" name="crewRole" placeholder="Role" value="' + escapeAttr(role) + '">' +
      '<input aria-label="Crew count ' + n + '" autocomplete="off" type="number" name="crewCount" min="1" value="' + (count || 1) + '" style="width:60px">' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.3 STEEL PERCENTAGE CRUD UI
  // ═══════════════════════════════════════════════════════════════════════════

  function renderSteelPercentages() {
    if (!steelPercentagesList) return;
    var percentages = Config.getSteelPercentages();
    var html = '';
    var types = Object.keys(percentages);

    if (types.length === 0) {
      html = '<p class="empty-hint">No steel percentages configured.</p>';
    } else {
      types.forEach(function (type) {
        var label = type.replace(/_/g, ' ');
        label = label.charAt(0).toUpperCase() + label.slice(1);
        var pctDisplay = percentages[type];

        html +=
          '<div class="config-item" data-type="' + escapeAttr(type) + '">' +
          '<div class="config-item-info">' +
          '<span class="config-item-label">' + escapeHtml(label) + '</span>' +
          '<span class="config-item-value">' + pctDisplay + ' (' + (pctDisplay * 100).toFixed(2) + '%)</span>' +
          '</div>' +
          '<div class="config-item-actions">' +
          '<button class="btn-icon btn-edit-steel" data-type="' + escapeAttr(type) + '" aria-label="Edit ' + escapeAttr(label) + '" title="Edit">✏️</button>' +
          '<button class="btn-icon btn-delete-steel" data-type="' + escapeAttr(type) + '" aria-label="Delete ' + escapeAttr(label) + '" title="Delete">🗑️</button>' +
          '</div>' +
          '</div>';
      });
    }

    steelPercentagesList.innerHTML = html;

    // Bind edit/delete
    steelPercentagesList.querySelectorAll('.btn-edit-steel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-type');
        var pcts = Config.getSteelPercentages();
        showSteelPctForm({ type: type, percentage: pcts[type] });
      });
    });
    steelPercentagesList.querySelectorAll('.btn-delete-steel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-type');
        confirmDialog('Are you sure you want to delete the "' + type + '" steel percentage?').then(function (confirmed) {
          if (confirmed) {
            Config.deleteSteelPercentage(type).then(function () {
              renderSteelPercentages();
              showToast('Steel percentage deleted');
            });
          }
        });
      });
    });
  }

  function showSteelPctForm(existing) {
    if (!steelPercentagesList) return;
    removeInlineForm(steelPercentagesList);

    var isEdit = !!(existing && existing.type);

    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.setAttribute('data-section', 'steelPercentages');

    form.innerHTML =
      '<div class="form-group">' +
      '<label for="sp-type">Element Type *</label>' +
      '<input id="sp-type" type="text" name="elementType" autocomplete="off" placeholder="e.g. foundation" value="' + (isEdit ? escapeAttr(existing.type) : '') + '" ' + (isEdit ? 'readonly' : '') + ' required>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="sp-pct">Percentage Factor * (decimal, e.g. 0.0085)</label>' +
      '<input id="sp-pct" type="number" name="percentage" autocomplete="off" step="any" min="0.0001" placeholder="0.0085" value="' + (isEdit ? existing.percentage : '') + '" required>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button>' +
      '</div>';

    steelPercentagesList.insertBefore(form, steelPercentagesList.firstChild);

    // Save
    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var elementType = form.querySelector('input[name="elementType"]').value.trim().toLowerCase();
      var percentage = parseFloat(form.querySelector('input[name="percentage"]').value);

      var valid = true;
      var msgs = form.querySelectorAll('.validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });

      if (!elementType) {
        msgs[0].textContent = 'Element type name is required';
        valid = false;
      }
      if (isNaN(percentage) || percentage <= 0) {
        msgs[1].textContent = 'A positive number is required';
        valid = false;
      }
      if (!valid) return;

      var promise = isEdit
        ? Config.updateSteelPercentage(elementType, percentage)
        : Config.addSteelPercentage(elementType, percentage);

      promise.then(function () {
        renderSteelPercentages();
        showToast(isEdit ? 'Steel percentage updated' : 'Steel percentage added');
      });
    });

    // Cancel
    form.querySelector('.btn-cancel-item').addEventListener('click', function () {
      form.remove();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.4 CUSTOM CALCULATIONS CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  function renderCustomCalculations() {
    if (!customCalcsList) return;
    var calcs = Config.getCustomCalculations();
    var html = '';

    if (calcs.length === 0) {
      html = '<p class="empty-hint">No custom calculations configured.</p>';
    } else {
      calcs.forEach(function (calc) {
        html +=
          '<div class="config-item" data-id="' + escapeAttr(calc.id) + '">' +
          '<div class="config-item-info">' +
          '<span class="config-item-label">' + escapeHtml(calc.name) + '</span>' +
          '<span class="config-item-value">Category: ' + escapeHtml(calc.category) + '</span>' +
          '<span class="config-item-hint">Formula: ' + escapeHtml(calc.formula) + '</span>' +
          '</div>' +
          '<div class="config-item-actions">' +
          '<button class="btn-icon btn-edit-calc" data-id="' + escapeAttr(calc.id) + '" aria-label="Edit ' + escapeAttr(calc.name) + '" title="Edit">✏️</button>' +
          '<button class="btn-icon btn-delete-calc" data-id="' + escapeAttr(calc.id) + '" aria-label="Delete ' + escapeAttr(calc.name) + '" title="Delete">🗑️</button>' +
          '</div>' +
          '</div>';
      });
    }

    customCalcsList.innerHTML = html;

    // Bind edit/delete
    customCalcsList.querySelectorAll('.btn-edit-calc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var calcs = Config.getCustomCalculations();
        var item = calcs.find(function (c) { return c.id === id; });
        if (item) showCustomCalcForm(item);
      });
    });
    customCalcsList.querySelectorAll('.btn-delete-calc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        confirmDialog('Are you sure you want to delete this custom calculation?').then(function (confirmed) {
          if (confirmed) {
            Config.deleteCustomCalculation(id).then(function () {
              renderCustomCalculations();
              showToast('Custom calculation deleted');
            });
          }
        });
      });
    });
  }

  function showCustomCalcForm(existing) {
    if (!customCalcsList) return;
    removeInlineForm(customCalcsList);

    var isEdit = !!existing;
    var categoryOptions = Object.keys(FORMULA_SCOPES);

    var optionsHtml = '<option value="">Select category</option>';
    categoryOptions.forEach(function (cat) {
      var selected = (isEdit && existing.category === cat) ? ' selected' : '';
      optionsHtml += '<option value="' + cat + '"' + selected + '>' + cat.charAt(0).toUpperCase() + cat.slice(1) + '</option>';
    });

    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.setAttribute('data-section', 'customCalculations');

    form.innerHTML =
      '<div class="form-group">' +
      '<label for="cc-name">Name *</label>' +
      '<input id="cc-name" type="text" name="calcName" autocomplete="off" placeholder="e.g. Extra Cement" value="' + (isEdit ? escapeAttr(existing.name) : '') + '" required>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="cc-category">Category *</label>' +
      '<select id="cc-category" name="calcCategory" autocomplete="off" required>' + optionsHtml + '</select>' +
      '<span class="validation-msg"></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="cc-formula">Formula * <span class="formula-vars-hint"></span></label>' +
      '<textarea id="cc-formula" name="formula" autocomplete="off" rows="3" placeholder="e.g. volume * ratio_cement" required>' + (isEdit ? escapeHtml(existing.formula) : '') + '</textarea>' +
      '<span class="formula-status"></span>' +
      '</div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button>' +
      '</div>';

    customCalcsList.insertBefore(form, customCalcsList.firstChild);

    var formulaField = form.querySelector('textarea[name="formula"]');
    var formulaStatus = form.querySelector('.formula-status');
    var categorySelect = form.querySelector('select[name="calcCategory"]');
    var varsHint = form.querySelector('.formula-vars-hint');

    // Update vars hint when category changes
    function updateVarsHint() {
      var cat = categorySelect.value;
      if (cat && FORMULA_SCOPES[cat]) {
        varsHint.textContent = '(vars: ' + FORMULA_SCOPES[cat].join(', ') + ')';
      } else {
        varsHint.textContent = '';
      }
      // Re-validate formula when category changes
      validateFormulaField(formulaField, formulaStatus, cat);
    }

    categorySelect.addEventListener('change', updateVarsHint);
    updateVarsHint();

    // Formula validation on input (uses dynamic category)
    formulaField.addEventListener('keyup', function () {
      validateFormulaField(formulaField, formulaStatus, categorySelect.value);
    });
    formulaField.addEventListener('change', function () {
      validateFormulaField(formulaField, formulaStatus, categorySelect.value);
    });

    // Save
    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var name = form.querySelector('input[name="calcName"]').value.trim();
      var category = categorySelect.value;
      var formula = formulaField.value.trim();

      var valid = true;
      var msgs = form.querySelectorAll('.form-group > .validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });

      if (!name) {
        msgs[0].textContent = 'Name is required';
        valid = false;
      }
      if (!category) {
        msgs[1].textContent = 'Category is required';
        valid = false;
      }
      if (!formula) {
        formulaStatus.textContent = '✗ Formula is required';
        formulaStatus.className = 'formula-status formula-invalid';
        valid = false;
      } else if (!isFormulaValid(formula, category)) {
        valid = false;
      }
      if (!valid) return;

      var calcObj = {
        id: isEdit ? existing.id : 'calc_' + Date.now(),
        name: name,
        category: category,
        formula: formula
      };

      var promise = isEdit
        ? Config.updateCustomCalculation(existing.id, calcObj)
        : Config.addCustomCalculation(calcObj);

      promise.then(function () {
        renderCustomCalculations();
        showToast(isEdit ? 'Custom calculation updated' : 'Custom calculation added');
      });
    });

    // Cancel
    form.querySelector('.btn-cancel-item').addEventListener('click', function () {
      form.remove();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.5 FORMULA VALIDATION + CONFIRMATION DIALOG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attach real-time formula validation to a textarea.
   */
  function attachFormulaValidation(textareaEl, statusEl, category) {
    if (!textareaEl || !statusEl) return;
    textareaEl.addEventListener('keyup', function () {
      validateFormulaField(textareaEl, statusEl, category);
    });
    textareaEl.addEventListener('change', function () {
      validateFormulaField(textareaEl, statusEl, category);
    });
  }

  /**
   * Validate formula text and update the status element.
   */
  function validateFormulaField(textareaEl, statusEl, category) {
    var expr = textareaEl.value.trim();
    if (!expr) {
      statusEl.textContent = '';
      statusEl.className = 'formula-status';
      return;
    }

    var allowedVars = (category && FORMULA_SCOPES[category]) ? FORMULA_SCOPES[category] : [];
    var result = FormulaEngine.validate(expr, allowedVars);

    if (result.valid) {
      statusEl.textContent = '✓ Valid formula';
      statusEl.className = 'formula-status formula-valid';
    } else {
      statusEl.textContent = '✗ ' + result.error;
      statusEl.className = 'formula-status formula-invalid';
    }
  }

  /**
   * Check if a formula is valid for the given category.
   */
  function isFormulaValid(expr, category) {
    if (!expr) return true;
    var allowedVars = (category && FORMULA_SCOPES[category]) ? FORMULA_SCOPES[category] : [];
    var result = FormulaEngine.validate(expr, allowedVars);
    return result.valid;
  }

  /**
   * Show a confirmation dialog. Returns a Promise<boolean>.
   */
  function confirmDialog(message) {
    return new Promise(function (resolve) {
      // Create modal overlay
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay confirm-dialog-overlay';
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('role', 'dialog');

      overlay.innerHTML =
        '<div class="modal-content confirm-dialog">' +
        '<p class="confirm-message">' + escapeHtml(message) + '</p>' +
        '<div class="form-actions">' +
        '<button type="button" class="btn-primary btn-sm btn-confirm">Confirm</button>' +
        '<button type="button" class="btn-outlined btn-sm btn-cancel-confirm">Cancel</button>' +
        '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.querySelector('.btn-confirm').addEventListener('click', function () {
        overlay.remove();
        resolve(true);
      });
      overlay.querySelector('.btn-cancel-confirm').addEventListener('click', function () {
        overlay.remove();
        resolve(false);
      });
    });
  }

  // ─── Unit/Theme Toggle Rendering ─────────────────────────────────────────

  function renderUnitToggle() {
    if (unitToggle && typeof App !== 'undefined' && App.getUnit) {
      unitToggle.checked = App.getUnit() === 'metric';
    }
  }

  function renderThemeToggle() {
    if (themeToggle && typeof App !== 'undefined' && App.getTheme) {
      themeToggle.checked = App.getTheme() === 'dark';
    }
  }

  // ─── Export Data ─────────────────────────────────────────────────────────

  function exportData() {
    return DB.exportAll().then(function (payload) {
      if (!payload.clients.length && !payload.projects.length && !payload.estimates.length) {
        showToast('No data to export');
        return;
      }

      var json = JSON.stringify(payload, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);

      var a = document.createElement('a');
      a.href = url;
      a.download = 'buildcalc-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Data exported successfully');
    });
  }

  // ─── Import Data ─────────────────────────────────────────────────────────

  function importData(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function (e) {
        try {
          var payload = JSON.parse(e.target.result);
        } catch (err) {
          showToast('Import failed: Invalid file format');
          resolve();
          return;
        }

        if (!payload || typeof payload !== 'object') {
          showToast('Import failed: File does not contain valid BuildCalc data');
          resolve();
          return;
        }

        if (!payload.version || (!payload.clients && !payload.projects && !payload.estimates)) {
          showToast('Import failed: File does not contain valid BuildCalc data');
          resolve();
          return;
        }

        if (payload.clients && !Array.isArray(payload.clients)) {
          showToast('Import failed: File does not contain valid BuildCalc data');
          resolve();
          return;
        }
        if (payload.projects && !Array.isArray(payload.projects)) {
          showToast('Import failed: File does not contain valid BuildCalc data');
          resolve();
          return;
        }
        if (payload.estimates && !Array.isArray(payload.estimates)) {
          showToast('Import failed: File does not contain valid BuildCalc data');
          resolve();
          return;
        }

        DB.importAll(payload).then(function () {
          if (payload.config) {
            return Config.replaceAll(payload.config);
          }
        }).then(function () {
          showToast('Data imported successfully');
          renderSections();
          if (typeof Clients !== 'undefined' && Clients.renderList) Clients.renderList();
          if (typeof Projects !== 'undefined' && Projects.renderList) Projects.renderList();
          resolve();
        }).catch(function (err) {
          showToast('Import failed: ' + (err.message || 'Unknown error'));
          resolve();
        });
      };

      reader.onerror = function () {
        showToast('Import failed: Could not read file');
        resolve();
      };

      reader.readAsText(file);
    });
  }

  // ─── License UI ───────────────────────────────────────────────────────────

  function _initLicenseUI() {
    var statusDisplay = document.getElementById('license-status-display');
    var keyInput = document.getElementById('license-key-input');
    var btnActivate = document.getElementById('btn-activate-license');
    var btnRemove = document.getElementById('btn-remove-license');
    var msgEl = document.getElementById('license-msg');

    function renderLicenseStatus() {
      if (!statusDisplay) return;
      if (License.isLicensed()) {
        statusDisplay.innerHTML = '<span style="color:var(--success);font-weight:600;">✅ Licensed to: ' + escapeHtml(License.getLicenseeName()) + '</span>';
        if (keyInput) keyInput.parentElement.hidden = true;
        if (btnActivate) btnActivate.hidden = true;
        if (btnRemove) btnRemove.hidden = false;
      } else {
        statusDisplay.innerHTML = '<span style="color:var(--warning);font-weight:600;">🔒 Free Version — ' + License.getClientLimit() + ' clients, ' + License.getProjectsPerClientLimit() + ' projects/client</span>';
        if (keyInput) keyInput.parentElement.hidden = false;
        if (btnActivate) btnActivate.hidden = false;
        if (btnRemove) btnRemove.hidden = true;
      }
    }

    renderLicenseStatus();

    if (btnActivate) {
      btnActivate.addEventListener('click', function () {
        var val = keyInput ? keyInput.value.trim() : '';
        if (!val) {
          if (msgEl) { msgEl.textContent = 'Please enter a license key.'; msgEl.style.color = 'var(--danger)'; }
          return;
        }
        License.activate(val).then(function (result) {
          if (result.success) {
            if (keyInput) keyInput.value = '';
            if (msgEl) { msgEl.textContent = result.message; msgEl.style.color = 'var(--success)'; }
            renderLicenseStatus();
          } else {
            if (msgEl) { msgEl.textContent = result.message; msgEl.style.color = 'var(--danger)'; }
          }
        });
      });
    }

    if (btnRemove) {
      btnRemove.addEventListener('click', function () {
        if (confirm('Remove license? You will be limited to ' + License.getClientLimit() + ' clients and ' + License.getProjectsPerClientLimit() + ' projects per client.')) {
          License.deactivate();
          renderLicenseStatus();
          if (msgEl) { msgEl.textContent = 'License removed.'; msgEl.style.color = 'var(--text-secondary)'; }
        }
      });
    }

    License.onStateChange(function () {
      renderLicenseStatus();
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function removeInlineForm(container) {
    var existing = container.querySelector('.inline-edit-form');
    if (existing) existing.remove();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(message) {
    var toast = document.getElementById('toast');
    var toastMsg = document.getElementById('toast-message');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.hidden = false;
      setTimeout(function () { toast.hidden = true; }, 3000);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    init: init,
    renderSections: renderSections,
    saveSection: function (section, data) { return Promise.resolve(); },
    exportData: exportData,
    importData: importData,
    renderUnitToggle: renderUnitToggle,
    renderThemeToggle: renderThemeToggle,
    confirmDialog: confirmDialog
  };
})();
