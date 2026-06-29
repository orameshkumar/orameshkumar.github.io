/**
 * estimation.js - Estimation Module for BuildCalc
 *
 * Manages category estimate forms, calculations, and saved estimates.
 * Handles category selection, form display, calculation execution,
 * result display, and estimate persistence.
 *
 * Dependencies: db.js, calc-engine.js, config.js
 */
'use strict';

const Estimation = (function () {
  // ─── State ───────────────────────────────────────────────────────────────

  var currentProjectId = null;
  var currentCategory = null;
  var lastMaterialResults = null;
  var lastLaborResults = null;
  var lastInputs = null;
  var editingEstimateId = null;

  // ─── DOM References ──────────────────────────────────────────────────────

  var projectNameEl;
  var categoryGrid;
  var categoryForms;
  var resultsContainer;
  var materialResultsContent;
  var laborResultsContent;
  var btnSaveEstimate;
  var btnNewEstimate;
  var savedEstimatesList;
  var projectTotalContainer;
  var projectTotalValue;
  var btnProjectSettings;
  var projectSettingsPanel;
  var projectSettingsContent;
  var btnBackToEstimation;
  var btnQuickEntry;
  var quickEntryPanel;
  var quickEntryText;
  var btnQuickApply;
  var btnQuickCancel;
  var quickEntryError;
  var noProjectNotice;
  // concreting quick entry
  var btnQuickEntryConcreting;
  var quickEntryPanelConcreting;
  var quickEntryTextConcreting;
  var btnQuickApplyConcreting;
  var btnQuickCancelConcreting;
  var quickEntryErrorConcreting;
  // steel quick entry
  var btnQuickEntrySteel;
  var quickEntryPanelSteel;
  var quickEntryTextSteel;
  var btnQuickApplySteel;
  var btnQuickCancelSteel;
  var quickEntryErrorSteel;
  // plastering quick entry
  var btnQuickEntryPlastering;
  var quickEntryPanelPlastering;
  var quickEntryTextPlastering;
  var btnQuickApplyPlastering;
  var btnQuickCancelPlastering;
  var quickEntryErrorPlastering;
  // tiling quick entry
  var btnQuickEntryTiling;
  var quickEntryPanelTiling;
  var quickEntryTextTiling;
  var btnQuickApplyTiling;
  var btnQuickCancelTiling;
  var quickEntryErrorTiling;

  // ─── Initialization ──────────────────────────────────────────────────────

  function init() {
    projectNameEl = document.getElementById('estimation-project-name');
    categoryGrid = document.getElementById('category-grid');
    categoryForms = document.getElementById('category-forms');
    resultsContainer = document.getElementById('estimation-results');
    materialResultsContent = document.getElementById('material-results-content');
    laborResultsContent = document.getElementById('labor-results-content');
    btnSaveEstimate = document.getElementById('btn-save-estimate');
    btnNewEstimate = document.getElementById('btn-new-estimate');
    savedEstimatesList = document.getElementById('saved-estimates-list');
    projectTotalContainer = document.getElementById('project-total');
    projectTotalValue = document.getElementById('project-total-value');
    btnProjectSettings = document.getElementById('btn-project-settings');
    projectSettingsPanel = document.getElementById('project-settings-panel');
    projectSettingsContent = document.getElementById('project-settings-content');
    btnBackToEstimation = document.getElementById('btn-back-to-estimation');
    btnQuickEntry   = document.getElementById('btn-quick-entry');
    quickEntryPanel = document.getElementById('quick-entry-panel');
    quickEntryText  = document.getElementById('quick-entry-text');
    btnQuickApply   = document.getElementById('btn-quick-apply');
    btnQuickCancel   = document.getElementById('btn-quick-cancel');
    quickEntryError = document.getElementById('quick-entry-error');
    noProjectNotice = document.getElementById('no-project-notice');
    // ── Inline no-project selector ──────────────────────────────────────
    var _noProjectSel = document.getElementById('est-project-select');
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

    // concreting
    btnQuickEntryConcreting   = document.getElementById('btn-quick-entry-concreting');
    quickEntryPanelConcreting = document.getElementById('quick-entry-panel-concreting');
    quickEntryTextConcreting  = document.getElementById('quick-entry-text-concreting');
    btnQuickApplyConcreting   = document.getElementById('btn-quick-apply-concreting');
    btnQuickCancelConcreting  = document.getElementById('btn-quick-cancel-concreting');
    quickEntryErrorConcreting = document.getElementById('quick-entry-error-concreting');
    // steel
    btnQuickEntrySteel   = document.getElementById('btn-quick-entry-steel');
    quickEntryPanelSteel = document.getElementById('quick-entry-panel-steel');
    quickEntryTextSteel  = document.getElementById('quick-entry-text-steel');
    btnQuickApplySteel   = document.getElementById('btn-quick-apply-steel');
    btnQuickCancelSteel  = document.getElementById('btn-quick-cancel-steel');
    quickEntryErrorSteel = document.getElementById('quick-entry-error-steel');
    // plastering
    btnQuickEntryPlastering   = document.getElementById('btn-quick-entry-plastering');
    quickEntryPanelPlastering = document.getElementById('quick-entry-panel-plastering');
    quickEntryTextPlastering  = document.getElementById('quick-entry-text-plastering');
    btnQuickApplyPlastering   = document.getElementById('btn-quick-apply-plastering');
    btnQuickCancelPlastering  = document.getElementById('btn-quick-cancel-plastering');
    quickEntryErrorPlastering = document.getElementById('quick-entry-error-plastering');
    // tiling
    btnQuickEntryTiling   = document.getElementById('btn-quick-entry-tiling');
    quickEntryPanelTiling = document.getElementById('quick-entry-panel-tiling');
    quickEntryTextTiling  = document.getElementById('quick-entry-text-tiling');
    btnQuickApplyTiling   = document.getElementById('btn-quick-apply-tiling');
    btnQuickCancelTiling  = document.getElementById('btn-quick-cancel-tiling');
    quickEntryErrorTiling = document.getElementById('quick-entry-error-tiling');

    // Bind quick entry — masonry
    _bindQuickEntry(btnQuickEntry, quickEntryPanel, quickEntryText,
                    btnQuickApply, btnQuickCancel, quickEntryError,
                    'masonry-volume', 3);
    // Bind quick entry — concreting
    _bindQuickEntry(btnQuickEntryConcreting, quickEntryPanelConcreting, quickEntryTextConcreting,
                    btnQuickApplyConcreting, btnQuickCancelConcreting, quickEntryErrorConcreting,
                    'concreting-volume', 3);
    // Bind quick entry — steel
    _bindQuickEntry(btnQuickEntrySteel, quickEntryPanelSteel, quickEntryTextSteel,
                    btnQuickApplySteel, btnQuickCancelSteel, quickEntryErrorSteel,
                    'steel-volume', 2);
    // Bind quick entry — plastering
    _bindQuickEntry(btnQuickEntryPlastering, quickEntryPanelPlastering, quickEntryTextPlastering,
                    btnQuickApplyPlastering, btnQuickCancelPlastering, quickEntryErrorPlastering,
                    'plastering-area', 2);
    // Bind quick entry — tiling
    _bindQuickEntry(btnQuickEntryTiling, quickEntryPanelTiling, quickEntryTextTiling,
                    btnQuickApplyTiling, btnQuickCancelTiling, quickEntryErrorTiling,
                    'tiling-floor-area', 2);

    // Bind category buttons
    var categoryBtns = categoryGrid.querySelectorAll('.category-btn:not(.placeholder-category)');
    categoryBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        showCategoryForm(btn.getAttribute('data-category'));
      });
    });

    // Bind placeholder category buttons (toast)
    var placeholderBtns = categoryGrid.querySelectorAll('.placeholder-category');
    placeholderBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        showToast(btn.querySelector('.category-label').textContent + ' - Coming Soon!');
      });
    });

    // Bind form submits
    var masonryForm = document.getElementById('masonry-form');
    var concretingForm = document.getElementById('concreting-form');
    var steelForm = document.getElementById('steel-form');
    var plasteringForm = document.getElementById('plastering-form');
    var tilingForm = document.getElementById('tiling-form');

    masonryForm.addEventListener('submit', function (e) { e.preventDefault(); calculate('masonry'); });
    concretingForm.addEventListener('submit', function (e) { e.preventDefault(); calculate('concreting'); });
    steelForm.addEventListener('submit', function (e) { e.preventDefault(); calculate('steel'); });
    plasteringForm.addEventListener('submit', function (e) { e.preventDefault(); calculate('plastering'); });
    tilingForm.addEventListener('submit', function (e) { e.preventDefault(); calculate('tiling'); });

    // Bind back buttons
    var backBtns = document.querySelectorAll('.btn-back-category');
    backBtns.forEach(function (btn) {
      btn.addEventListener('click', renderCategories);
    });

    // Bind save/new estimate buttons
    btnSaveEstimate.addEventListener('click', saveEstimate);
    btnNewEstimate.addEventListener('click', function () {
      renderCategories();
    });

    // Bind project settings buttons
    if (btnProjectSettings) {
      btnProjectSettings.addEventListener('click', function () {
        showProjectSettings();
      });
    }
    if (btnBackToEstimation) {
      btnBackToEstimation.addEventListener('click', function () {
        hideProjectSettings();
      });
    }
  }

  // ─── Set Project Context ─────────────────────────────────────────────────

  function setProject(projectId) {
    currentProjectId = projectId;
    return DB.getProject(projectId).then(function (project) {
      if (project) {
        projectNameEl.textContent = project.name;
        // Show project settings button when a project is loaded
        if (btnProjectSettings) btnProjectSettings.hidden = false;
      } else {
        projectNameEl.textContent = '';
        if (btnProjectSettings) btnProjectSettings.hidden = true;
      }
      hideProjectSettings();
      renderCategories();
      return renderSavedEstimates();
    });
  }

  // ─── Render Categories Grid ──────────────────────────────────────────────

  function renderCategories() {
    categoryGrid.hidden = false;
    categoryForms.hidden = true;
    resultsContainer.hidden = true;

    // Hide all forms
    var forms = categoryForms.querySelectorAll('.calc-form');
    forms.forEach(function (f) { f.hidden = true; });

    currentCategory = null;
    lastMaterialResults = null;
    lastLaborResults = null;
    lastInputs = null;

    // Reset editing state
    editingEstimateId = null;
    if (btnSaveEstimate) btnSaveEstimate.textContent = 'Save Estimate';

    // Close all quick entry panels
    _closeAllQuickEntryPanels();

    // Show notice and lock category buttons when no project is loaded
    var hasProject = !!currentProjectId;
    if (noProjectNotice) noProjectNotice.hidden = hasProject;
    var categoryBtns = categoryGrid.querySelectorAll('.category-btn:not(.placeholder-category)');
    categoryBtns.forEach(function (btn) {
      btn.classList.toggle('category-locked', !hasProject);
      btn.setAttribute('aria-disabled', hasProject ? 'false' : 'true');
    });
  }

  // ─── Show Category Form ──────────────────────────────────────────────────

  function showCategoryForm(category) {
    currentCategory = category;
    categoryGrid.hidden = true;
    categoryForms.hidden = false;
    resultsContainer.hidden = true;

    // Hide all forms, show the selected one
    var forms = categoryForms.querySelectorAll('.calc-form');
    forms.forEach(function (f) { f.hidden = true; });

    var targetForm = document.getElementById(category + '-form');
    if (targetForm) {
      targetForm.hidden = false;
    }

    // Populate block size dropdown for masonry
    if (category === 'masonry') {
      var blockSizeSelect = document.getElementById('masonry-block-size');
      // Use project snapshot block sizes if available
      var populateBlockSizes = function (blockSizes) {
        var html = '<option value="">Select block size</option>';
        blockSizes.forEach(function (bs) {
          html += '<option value="' + bs.id + '">' + escapeHtml(bs.label) + '</option>';
        });
        blockSizeSelect.innerHTML = html;
      };

      if (currentProjectId) {
        DB.getProject(currentProjectId).then(function (project) {
          var blockSizes = (project && project.configSnapshot) ? project.configSnapshot.blockSizes : Config.getBlockSizes();
          populateBlockSizes(blockSizes);
        });
      } else {
        populateBlockSizes(Config.getBlockSizes());
      }
    }

    // Clear previous validation
    clearFormValidation(category);
  }

  // ─── Quick Entry helpers ──────────────────────────────────────────────────

  /**
   * Generic quick-entry wiring for any volume field.
   * btnIcon toggles the panel; Apply parses rows and writes the sum of L*W*H
   * into the given volumeInputId; Cancel collapses the panel.
   */
  function _bindQuickEntry(btnIcon, panel, textarea, btnApply, btnCancel, errorEl, inputId, dims) {
    if (!btnIcon || !panel) return;
    dims = dims || 3;
    var labels = dims === 2 ? ['L', 'W'] : ['L', 'W', 'H'];

    btnIcon.addEventListener('click', function () {
      var opening = panel.hidden;
      panel.hidden = !opening;
      btnIcon.setAttribute('aria-expanded', opening ? 'true' : 'false');
      if (opening) { textarea.focus(); errorEl.textContent = ''; }
    });

    function doApply() {
      errorEl.textContent = '';
      var raw = textarea.value.trim();
      if (!raw) {
        errorEl.textContent = 'Please enter at least one row of dimensions.';
        return;
      }
      var lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      var total = 0;
      for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].split(/[,\s]+/).filter(Boolean);
        if (parts.length !== dims) {
          errorEl.textContent = 'Row ' + (i + 1) + ': expected ' + dims + ' values (' + labels.join(', ') + '), got ' + parts.length + '.';
          return;
        }
        var nums = parts.map(function (p) { return parseFloat(p); });
        for (var j = 0; j < dims; j++) {
          if (isNaN(nums[j]) || nums[j] <= 0) {
            errorEl.textContent = 'Row ' + (i + 1) + ': value ' + (j + 1) + ' must be a positive number.';
            return;
          }
        }
        var product = 1;
        for (var k = 0; k < dims; k++) { product *= nums[k]; }
        total += product;
      }
      total = Math.round(total * 10000) / 10000;
      var targetInput = document.getElementById(inputId);
      targetInput.value = total;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      _closeQuickEntryPanel(btnIcon, panel, textarea);
    }

    btnApply.addEventListener('click', doApply);
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { doApply(); }
    });
    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        _closeQuickEntryPanel(btnIcon, panel, textarea);
      });
    }
  }

  function _closeQuickEntryPanel(btnIcon, panel, textarea) {
    panel.hidden = true;
    btnIcon.setAttribute('aria-expanded', 'false');
    if (textarea) textarea.value = '';
  }

  function _closeAllQuickEntryPanels() {
    if (quickEntryPanel && !quickEntryPanel.hidden)
      _closeQuickEntryPanel(btnQuickEntry, quickEntryPanel, quickEntryText);
    if (quickEntryPanelConcreting && !quickEntryPanelConcreting.hidden)
      _closeQuickEntryPanel(btnQuickEntryConcreting, quickEntryPanelConcreting, quickEntryTextConcreting);
    if (quickEntryPanelSteel && !quickEntryPanelSteel.hidden)
      _closeQuickEntryPanel(btnQuickEntrySteel, quickEntryPanelSteel, quickEntryTextSteel);
    if (quickEntryPanelPlastering && !quickEntryPanelPlastering.hidden)
      _closeQuickEntryPanel(btnQuickEntryPlastering, quickEntryPanelPlastering, quickEntryTextPlastering);
    if (quickEntryPanelTiling && !quickEntryPanelTiling.hidden)
      _closeQuickEntryPanel(btnQuickEntryTiling, quickEntryPanelTiling, quickEntryTextTiling);
  }

  // ─── Calculate ───────────────────────────────────────────────────────────

  function calculate(category) {
    clearFormValidation(category);
    var unit = App.getUnit();
    var inputs = {};
    var materialResults;
    var laborResults;
    var laborQuantity;

    // Load project to check for configSnapshot
    var calcPromise;
    if (currentProjectId) {
      calcPromise = DB.getProject(currentProjectId);
    } else {
      calcPromise = Promise.resolve(null);
    }

    calcPromise.then(function (project) {
      var configSource;
      if (project && project.configSnapshot) {
        configSource = CalcEngine.wrapSnapshot(project.configSnapshot);
      }

      switch (category) {
        case 'masonry':
          inputs = getMasonryInputs();
          if (!inputs) return;
          var blockSizes = configSource ? configSource.getBlockSizes() : Config.getBlockSizes();
          var blockSize = blockSizes.find(function (bs) { return bs.id === inputs.blockSizeId; });
          if (!blockSize) {
            showFieldError('masonry-block-size-error', 'Please select a block size');
            return;
          }
          materialResults = CalcEngine.masonry(inputs.volume, blockSize, inputs.ratio, unit, configSource);
          laborQuantity = inputs.volume;
          laborResults = CalcEngine.labor(laborQuantity, 'masonry', unit, configSource);
          break;

        case 'concreting':
          inputs = getConcretingInputs();
          if (!inputs) return;
          materialResults = CalcEngine.concreting(inputs.volume, inputs.ratio, unit, configSource);
          laborQuantity = inputs.volume;
          laborResults = CalcEngine.labor(laborQuantity, 'concreting', unit, configSource);
          break;

        case 'steel':
          inputs = getSteelInputs();
          if (!inputs) return;
          materialResults = CalcEngine.steel(inputs.volume, inputs.elementType, unit, configSource);
          laborQuantity = materialResults.weightKg;
          laborResults = CalcEngine.labor(laborQuantity, 'steel', unit, configSource);
          break;

        case 'plastering':
          inputs = getPlasteringInputs();
          if (!inputs) return;
          materialResults = CalcEngine.plastering(inputs.area, inputs.thicknessMm, inputs.ratio, unit, configSource);
          laborQuantity = inputs.area;
          laborResults = CalcEngine.labor(laborQuantity, 'plastering', unit, configSource);
          break;

        case 'tiling':
          inputs = getTilingInputs();
          if (!inputs) return;
          materialResults = CalcEngine.tiling(inputs.floorArea, inputs.tileArea, configSource);
          laborQuantity = inputs.floorArea;
          laborResults = CalcEngine.labor(laborQuantity, 'tiling', unit, configSource);
          break;

        default:
          return;
      }

      lastMaterialResults = materialResults;
      lastLaborResults = laborResults;
      lastInputs = inputs;

      // Evaluate custom formulas
      var customResults = CalcEngine.evaluateCustomFormulas(category, buildFormulaVariables(category, inputs, materialResults, unit, configSource), configSource);

      // Display results
      showResults(category, materialResults, laborResults, unit, customResults);
    });
  }

  // ─── Input Extraction with Validation ────────────────────────────────────

  function getMasonryInputs() {
    var volume = parseFloat(document.getElementById('masonry-volume').value);
    var blockSizeId = document.getElementById('masonry-block-size').value;
    var ratioCement = parseInt(document.getElementById('masonry-ratio-cement').value);
    var ratioSand = parseInt(document.getElementById('masonry-ratio-sand').value);

    if (!volume || volume <= 0) {
      showFieldError('masonry-volume-error', 'Volume must be greater than zero');
      return null;
    }
    if (!blockSizeId) {
      showFieldError('masonry-block-size-error', 'Please select a block size');
      return null;
    }
    if (!ratioCement || ratioCement < 1) {
      showFieldError('masonry-ratio-error', 'Ratio values must be positive integers');
      return null;
    }
    if (!ratioSand || ratioSand < 1) {
      showFieldError('masonry-ratio-error', 'Ratio values must be positive integers');
      return null;
    }

    return { volume: volume, blockSizeId: blockSizeId, ratio: [ratioCement, ratioSand] };
  }

  function getConcretingInputs() {
    var volume = parseFloat(document.getElementById('concreting-volume').value);
    var ratioCement = parseInt(document.getElementById('concreting-ratio-cement').value);
    var ratioSand = parseInt(document.getElementById('concreting-ratio-sand').value);
    var ratioCrush = parseInt(document.getElementById('concreting-ratio-crush').value);

    if (!volume || volume <= 0) {
      showFieldError('concreting-volume-error', 'Volume must be greater than zero');
      return null;
    }
    if (!ratioCement || ratioCement < 1 || !ratioSand || ratioSand < 1 || !ratioCrush || ratioCrush < 1) {
      showFieldError('concreting-ratio-error', 'Ratio values must be positive integers');
      return null;
    }

    return { volume: volume, ratio: [ratioCement, ratioSand, ratioCrush] };
  }

  function getSteelInputs() {
    var volume = parseFloat(document.getElementById('steel-volume').value);
    var elementType = document.getElementById('steel-element-type').value;

    if (!volume || volume <= 0) {
      showFieldError('steel-volume-error', 'Volume must be greater than zero');
      return null;
    }
    if (!elementType) {
      showFieldError('steel-element-type-error', 'Please select an element type');
      return null;
    }

    return { volume: volume, elementType: elementType };
  }

  function getPlasteringInputs() {
    var area = parseFloat(document.getElementById('plastering-area').value);
    var thicknessMm = parseInt(document.getElementById('plastering-thickness').value);
    var ratioCement = parseInt(document.getElementById('plastering-ratio-cement').value);
    var ratioSand = parseInt(document.getElementById('plastering-ratio-sand').value);

    if (!area || area <= 0) {
      showFieldError('plastering-area-error', 'Area must be greater than zero');
      return null;
    }
    if (!thicknessMm || thicknessMm < 1) {
      showFieldError('plastering-thickness-error', 'Thickness must be at least 1 mm');
      return null;
    }
    if (!ratioCement || ratioCement < 1 || !ratioSand || ratioSand < 1) {
      showFieldError('plastering-ratio-error', 'Ratio values must be positive integers');
      return null;
    }

    return { area: area, thicknessMm: thicknessMm, ratio: [ratioCement, ratioSand] };
  }

  function getTilingInputs() {
    var floorArea = parseFloat(document.getElementById('tiling-floor-area').value);
    var tileArea = parseFloat(document.getElementById('tiling-tile-area').value);

    if (!floorArea || floorArea <= 0) {
      showFieldError('tiling-floor-area-error', 'Floor area must be greater than zero');
      return null;
    }
    if (!tileArea || tileArea <= 0) {
      showFieldError('tiling-tile-area-error', 'Tile area must be greater than zero');
      return null;
    }

    return { floorArea: floorArea, tileArea: tileArea };
  }

  // ─── Show Results ────────────────────────────────────────────────────────

  function showResults(category, materialResults, laborResults, unit, customResults) {
    resultsContainer.hidden = false;

    var unitLabel = unit === 'metric' ? 'Cu.m' : 'Cft';
    var areaLabel = unit === 'metric' ? 'Sq.m' : 'Sft';
    var matHtml = '';

    switch (category) {
      case 'masonry':
        matHtml =
          '<div class="result-item"><span class="result-label">Blocks</span><span class="result-value">' + materialResults.blocks + '</span></div>' +
          '<div class="result-item"><span class="result-label">Mortar Volume</span><span class="result-value">' + materialResults.mortarVolume + ' ' + unitLabel + '</span></div>' +
          '<div class="result-item"><span class="result-label">Cement Bags</span><span class="result-value">' + materialResults.cementBags + '</span></div>' +
          '<div class="result-item"><span class="result-label">Sand</span><span class="result-value">' + materialResults.sandVolume + ' ' + unitLabel + '</span></div>';
        break;

      case 'concreting':
        matHtml =
          '<div class="result-item"><span class="result-label">Dry Volume</span><span class="result-value">' + materialResults.dryVolume + ' ' + unitLabel + '</span></div>' +
          '<div class="result-item"><span class="result-label">Cement Bags</span><span class="result-value">' + materialResults.cementBags + '</span></div>' +
          '<div class="result-item"><span class="result-label">Sand</span><span class="result-value">' + materialResults.sandVolume + ' ' + unitLabel + '</span></div>' +
          '<div class="result-item"><span class="result-label">Crush</span><span class="result-value">' + materialResults.crushVolume + ' ' + unitLabel + '</span></div>';
        break;

      case 'steel':
        matHtml =
          '<div class="result-item"><span class="result-label">Steel %</span><span class="result-value">' + (materialResults.steelPercentage * 100).toFixed(2) + '%</span></div>' +
          '<div class="result-item"><span class="result-label">Volume (Cu.m)</span><span class="result-value">' + materialResults.volumeCum + '</span></div>' +
          '<div class="result-item"><span class="result-label">Steel Weight</span><span class="result-value">' + materialResults.weightKg + ' kg</span></div>' +
          '<div class="result-item"><span class="result-label">Steel (Tons)</span><span class="result-value">' + materialResults.weightTons + '</span></div>';
        break;

      case 'plastering':
        matHtml =
          '<div class="result-item"><span class="result-label">Plaster Volume</span><span class="result-value">' + materialResults.plasterVolume + ' ' + unitLabel + '</span></div>' +
          '<div class="result-item"><span class="result-label">Dry Volume</span><span class="result-value">' + materialResults.dryVolume + ' ' + unitLabel + '</span></div>' +
          '<div class="result-item"><span class="result-label">Cement Bags</span><span class="result-value">' + materialResults.cementBags + '</span></div>' +
          '<div class="result-item"><span class="result-label">Sand</span><span class="result-value">' + materialResults.sandVolume + ' ' + unitLabel + '</span></div>';
        break;

      case 'tiling':
        matHtml =
          '<div class="result-item"><span class="result-label">Tiles Required</span><span class="result-value">' + materialResults.tileCount + '</span></div>';
        break;
    }

    // Append custom formula results
    if (customResults && customResults.length > 0) {
      matHtml += '<div class="result-divider"></div>';
      matHtml += '<h5 class="custom-results-header">Custom Calculations</h5>';
      customResults.forEach(function (cr) {
        if (cr.error) {
          matHtml += '<div class="result-item result-error"><span class="result-label">' + escapeHtml(cr.name) + '</span><span class="result-value">Error: ' + escapeHtml(cr.error) + '</span></div>';
        } else {
          matHtml += '<div class="result-item"><span class="result-label">' + escapeHtml(cr.name) + '</span><span class="result-value">' + cr.value + '</span></div>';
        }
      });
    }

    materialResultsContent.innerHTML = matHtml;

    // Labor results
    var laborHtml = '';
    if (laborResults && laborResults.crew && laborResults.crew.length > 0) {
      laborHtml += '<div class="result-item"><span class="result-label">Total Days</span><span class="result-value">' + laborResults.totalDays + '</span></div>';
      laborResults.crew.forEach(function (member) {
        laborHtml += '<div class="result-item"><span class="result-label">' + escapeHtml(member.role) + '</span><span class="result-value">' + member.count + ' × ' + laborResults.totalDays + ' days</span></div>';
      });
    } else {
      laborHtml = '<p>No labor data available for this category.</p>';
    }
    laborResultsContent.innerHTML = laborHtml;
  }

  // ─── Save Estimate ───────────────────────────────────────────────────────

  function saveEstimate() {
    if (!currentProjectId || !currentCategory || !lastMaterialResults) {
      showToast('No calculation to save');
      return;
    }

    var tagInput = document.getElementById('estimate-tag');
    var tag = tagInput ? tagInput.value.trim() : '';

    // If editing an existing estimate, update it
    if (editingEstimateId) {
      var updatedEstimate = {
        id: editingEstimateId,
        projectId: currentProjectId,
        category: currentCategory,
        inputs: lastInputs,
        materialResults: lastMaterialResults,
        laborResults: lastLaborResults,
        unit: App.getUnit(),
        tag: tag,
        createdAt: new Date().toISOString()
      };

      return DB.updateEstimate(updatedEstimate).then(function () {
        if (tagInput) tagInput.value = '';
        editingEstimateId = null;
        btnSaveEstimate.textContent = 'Save Estimate';
        showToast('Estimate updated: ' + (tag || updatedEstimate.category));
        renderSavedEstimates();
        renderCategories();
      });
    }

    // Auto-generate tag if blank: "{Category}-{seq#}"
    var savePromise;
    if (!tag) {
      savePromise = DB.getEstimatesByProject(currentProjectId).then(function (estimates) {
        var categoryCount = estimates.filter(function (e) { return e.category === currentCategory; }).length;
        var categoryLabel = currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1);
        return categoryLabel + '-' + (categoryCount + 1);
      });
    } else {
      savePromise = Promise.resolve(tag);
    }

    return savePromise.then(function (finalTag) {
      var estimate = {
        projectId: currentProjectId,
        category: currentCategory,
        inputs: lastInputs,
        materialResults: lastMaterialResults,
        laborResults: lastLaborResults,
        unit: App.getUnit(),
        tag: finalTag,
        createdAt: new Date().toISOString()
      };

      return DB.addEstimate(estimate).then(function () {
        if (tagInput) tagInput.value = '';
        showToast('Estimate saved: ' + finalTag);
        renderSavedEstimates();
        renderCategories();
      });
    });
  }

  // ─── Render Saved Estimates ──────────────────────────────────────────────

  function renderSavedEstimates() {
    if (!currentProjectId) {
      savedEstimatesList.innerHTML = '<div class="empty-state"><p>No estimates saved for this project yet.</p></div>';
      projectTotalContainer.hidden = true;
      return Promise.resolve();
    }

    return DB.getEstimatesByProject(currentProjectId).then(function (estimates) {
      if (estimates.length === 0) {
        savedEstimatesList.innerHTML = '<div class="empty-state"><p>No estimates saved for this project yet.</p></div>';
        projectTotalContainer.hidden = true;
        return;
      }

      // Sort by date descending
      estimates.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      var html = '';
      var totalBags = 0;

      estimates.forEach(function (est) {
        var categoryLabel = est.category.charAt(0).toUpperCase() + est.category.slice(1);
        var detail = '';

        if (est.materialResults) {
          if (est.materialResults.cementBags !== undefined) {
            detail += est.materialResults.cementBags + ' bags';
            totalBags += est.materialResults.cementBags;
          } else if (est.materialResults.tileCount !== undefined) {
            detail += est.materialResults.tileCount + ' tiles';
          } else if (est.materialResults.weightKg !== undefined) {
            detail += est.materialResults.weightKg + ' kg steel';
          }
        }

        var dateStr = new Date(est.createdAt).toLocaleDateString();

        html +=
          '<div class="list-item" data-id="' + est.id + '">' +
          '<div class="list-item-content">' +
          '<div class="list-item-title">' + escapeHtml(categoryLabel) + (est.tag ? ' — ' + escapeHtml(est.tag) : '') + '</div>' +
          '<div class="list-item-subtitle">' + dateStr + '</div>' +
          '</div>' +
          '<div class="list-item-meta">' +
          '<span class="list-item-total">' + escapeHtml(detail) + '</span>' +
          '<button class="btn-icon btn-print-estimate" data-id="' + est.id + '" aria-label="Print estimate" title="Print">🖨️</button>' +
          '<button class="btn-icon btn-edit-estimate" data-id="' + est.id + '" aria-label="Edit estimate" title="Edit">✏️</button>' +
          '<button class="btn-icon btn-delete-estimate" data-id="' + est.id + '" aria-label="Delete estimate" title="Delete">🗑️</button>' +
          '</div>' +
          '</div>';
      });

      savedEstimatesList.innerHTML = html;

      // Bind delete buttons
      savedEstimatesList.querySelectorAll('.btn-delete-estimate').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-id');
          if (confirm('Delete this estimate?')) {
            DB.deleteEstimate(id).then(function () {
              showToast('Estimate deleted');
              renderSavedEstimates();
            });
          }
        });
      });

      // Bind edit buttons
      savedEstimatesList.querySelectorAll('.btn-edit-estimate').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-id');
          editEstimate(id);
        });
      });

      // Bind print buttons
      savedEstimatesList.querySelectorAll('.btn-print-estimate').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-id');
          printSingleEstimate(id);
        });
      });

      // Show project total
      projectTotalContainer.hidden = false;
      projectTotalValue.textContent = Math.round(totalBags * 100) / 100 + ' cement bags';
    });
  }

  // ─── Edit Estimate ─────────────────────────────────────────────────────

  function editEstimate(id) {
    DB.getEstimate(id).then(function (est) {
      if (!est) {
        showToast('Estimate not found');
        return;
      }

      currentCategory = est.category;
      showCategoryForm(est.category);

      // Populate form inputs based on category
      var inputs = est.inputs;
      switch (est.category) {
        case 'masonry':
          document.getElementById('masonry-volume').value = inputs.volume || '';
          // Wait for block size dropdown to populate, then set value
          setTimeout(function () {
            document.getElementById('masonry-block-size').value = inputs.blockSizeId || '';
          }, 100);
          document.getElementById('masonry-ratio-cement').value = inputs.ratio ? inputs.ratio[0] : 1;
          document.getElementById('masonry-ratio-sand').value = inputs.ratio ? inputs.ratio[1] : 6;
          break;
        case 'concreting':
          document.getElementById('concreting-volume').value = inputs.volume || '';
          document.getElementById('concreting-ratio-cement').value = inputs.ratio ? inputs.ratio[0] : 1;
          document.getElementById('concreting-ratio-sand').value = inputs.ratio ? inputs.ratio[1] : 2;
          document.getElementById('concreting-ratio-crush').value = inputs.ratio ? inputs.ratio[2] : 4;
          break;
        case 'steel':
          document.getElementById('steel-volume').value = inputs.volume || '';
          document.getElementById('steel-element-type').value = inputs.elementType || '';
          break;
        case 'plastering':
          document.getElementById('plastering-area').value = inputs.area || '';
          document.getElementById('plastering-thickness').value = inputs.thicknessMm || 12;
          document.getElementById('plastering-ratio-cement').value = inputs.ratio ? inputs.ratio[0] : 1;
          document.getElementById('plastering-ratio-sand').value = inputs.ratio ? inputs.ratio[1] : 4;
          break;
        case 'tiling':
          document.getElementById('tiling-floor-area').value = inputs.floorArea || '';
          document.getElementById('tiling-tile-area').value = inputs.tileArea || '';
          break;
      }

      // Set tag input
      document.getElementById('estimate-tag').value = est.tag || '';

      // Store editing state
      editingEstimateId = est.id;
      btnSaveEstimate.textContent = 'Update Estimate';
    });
  }

  // ─── Print Single Estimate ───────────────────────────────────────────────

  function printSingleEstimate(id) {
    DB.getEstimate(id).then(function (est) {
      if (!est) { showToast('Estimate not found'); return; }
      return DB.getProject(est.projectId).then(function (project) {
        return DB.getClient(project.clientId).then(function (client) {
          var catLabel = est.category.charAt(0).toUpperCase() + est.category.slice(1);
          var dateStr = new Date(est.createdAt).toLocaleDateString();
          var unit = est.unit || 'imperial';
          var unitLabel = unit === 'metric' ? 'Cu.m' : 'Cft';

          var html = '<!DOCTYPE html><html><head>';
          html += '<title>Estimate - ' + escapeHtml(catLabel) + (est.tag ? ' - ' + escapeHtml(est.tag) : '') + '</title>';
          html += '<style>';
          html += 'body { font-family: Arial, sans-serif; padding: 20px; color: #1a1a2e; max-width: 600px; margin: 0 auto; }';
          html += 'h1 { font-size: 1.3rem; border-bottom: 2px solid #2563eb; padding-bottom: 8px; color: #2563eb; }';
          html += 'h2 { font-size: 1rem; color: #333; margin-top: 16px; }';
          html += '.meta { color: #666; font-size: 0.85rem; margin-bottom: 16px; }';
          html += 'table { width: 100%; border-collapse: collapse; margin: 8px 0; }';
          html += 'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 0.9rem; }';
          html += 'th { background: #f5f5f5; font-weight: 600; }';
          html += '</style></head><body>';

          html += '<h1>' + escapeHtml(catLabel) + (est.tag ? ' — ' + escapeHtml(est.tag) : '') + '</h1>';
          html += '<div class="meta">';
          html += '<div>Client: ' + escapeHtml(client ? client.name : 'N/A') + ' | Project: ' + escapeHtml(project ? project.name : 'N/A') + '</div>';
          html += '<div>Date: ' + dateStr + ' | Unit: ' + (unit === 'metric' ? 'Metric' : 'Imperial') + '</div>';
          html += '</div>';

          // Inputs
          html += '<h2>Inputs</h2><table><thead><tr><th>Parameter</th><th>Value</th></tr></thead><tbody>';
          if (est.inputs) {
            var inp = est.inputs;
            if (inp.volume !== undefined) html += '<tr><td>Volume</td><td>' + inp.volume + ' ' + unitLabel + '</td></tr>';
            if (inp.area !== undefined) html += '<tr><td>Area</td><td>' + inp.area + ' ' + (unit === 'metric' ? 'Sq.m' : 'Sft') + '</td></tr>';
            if (inp.floorArea !== undefined) html += '<tr><td>Floor Area</td><td>' + inp.floorArea + '</td></tr>';
            if (inp.tileArea !== undefined) html += '<tr><td>Tile Area</td><td>' + inp.tileArea + '</td></tr>';
            if (inp.thicknessMm !== undefined) html += '<tr><td>Thickness</td><td>' + inp.thicknessMm + ' mm</td></tr>';
            if (inp.blockSizeId) html += '<tr><td>Block Size</td><td>' + escapeHtml(inp.blockSizeId) + '</td></tr>';
            if (inp.elementType) html += '<tr><td>Element Type</td><td>' + escapeHtml(inp.elementType) + '</td></tr>';
            if (inp.ratio) html += '<tr><td>Mix Ratio</td><td>' + inp.ratio.join(' : ') + '</td></tr>';
          }
          html += '</tbody></table>';

          // Material Results
          html += '<h2>Material Results</h2><table><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody>';
          if (est.materialResults) {
            var mr = est.materialResults;
            if (mr.blocks !== undefined) html += '<tr><td>Blocks</td><td>' + mr.blocks + '</td></tr>';
            if (mr.mortarVolume !== undefined) html += '<tr><td>Mortar Volume</td><td>' + mr.mortarVolume + ' ' + unitLabel + '</td></tr>';
            if (mr.cementBags !== undefined) html += '<tr><td>Cement Bags</td><td>' + mr.cementBags + '</td></tr>';
            if (mr.sandVolume !== undefined) html += '<tr><td>Sand</td><td>' + mr.sandVolume + ' ' + unitLabel + '</td></tr>';
            if (mr.crushVolume !== undefined) html += '<tr><td>Crush</td><td>' + mr.crushVolume + ' ' + unitLabel + '</td></tr>';
            if (mr.dryVolume !== undefined) html += '<tr><td>Dry Volume</td><td>' + mr.dryVolume + ' ' + unitLabel + '</td></tr>';
            if (mr.weightKg !== undefined) html += '<tr><td>Steel (kg)</td><td>' + mr.weightKg + '</td></tr>';
            if (mr.weightTons !== undefined) html += '<tr><td>Steel (tons)</td><td>' + mr.weightTons + '</td></tr>';
            if (mr.tileCount !== undefined) html += '<tr><td>Tiles</td><td>' + mr.tileCount + '</td></tr>';
            if (mr.plasterVolume !== undefined) html += '<tr><td>Plaster Volume</td><td>' + mr.plasterVolume + ' ' + unitLabel + '</td></tr>';
          }
          html += '</tbody></table>';

          // Labor
          if (est.laborResults && est.laborResults.crew && est.laborResults.crew.length > 0) {
            html += '<h2>Labor</h2><table><thead><tr><th>Role</th><th>Count</th><th>Days</th></tr></thead><tbody>';
            est.laborResults.crew.forEach(function (m) {
              html += '<tr><td>' + escapeHtml(m.role) + '</td><td>' + m.count + '</td><td>' + est.laborResults.totalDays + '</td></tr>';
            });
            html += '</tbody></table>';
          }

          html += '</body></html>';

          var printWin = window.open('', '_blank');
          if (printWin) {
            printWin.document.write(html);
            printWin.document.close();
            printWin.focus();
            setTimeout(function () { printWin.print(); }, 500);
          }
        });
      });
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function showFieldError(errorId, message) {
    var el = document.getElementById(errorId);
    if (el) el.textContent = message;
  }

  function clearFormValidation(category) {
    var form = document.getElementById(category + '-form');
    if (form) {
      var errors = form.querySelectorAll('.validation-msg');
      errors.forEach(function (el) { el.textContent = ''; });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  // ─── Build Formula Variables ───────────────────────────────────────────────

  function buildFormulaVariables(category, inputs, materialResults, unit, configSource) {
    var source = configSource || Config;
    var vars = {};

    switch (category) {
      case 'masonry':
        var blockSizes = source.getBlockSizes ? source.getBlockSizes() : Config.getBlockSizes();
        var bs = blockSizes.find(function (b) { return b.id === inputs.blockSizeId; });
        vars.volume = inputs.volume;
        vars.blockVol = bs ? (unit === 'metric' ? bs.volCum : bs.volCft) : 0;
        vars.ratio_cement = inputs.ratio[0];
        vars.ratio_sand = inputs.ratio[1];
        var mf = source.getMortarFactor ? source.getMortarFactor() : Config.getMortarFactor();
        vars.mortarFactor = unit === 'metric' ? mf.metric : mf.imperial;
        vars.bagVolume = source.getCementBagVolume ? source.getCementBagVolume(unit) : Config.getCementBagVolume(unit);
        break;
      case 'concreting':
        vars.volume = inputs.volume;
        vars.ratio_cement = inputs.ratio[0];
        vars.ratio_sand = inputs.ratio[1];
        vars.ratio_crush = inputs.ratio[2];
        var mf2 = source.getMortarFactor ? source.getMortarFactor() : Config.getMortarFactor();
        vars.mortarFactor = unit === 'metric' ? mf2.metric : mf2.imperial;
        vars.bagVolume = source.getCementBagVolume ? source.getCementBagVolume(unit) : Config.getCementBagVolume(unit);
        break;
      case 'steel':
        vars.volume = inputs.volume;
        vars.percentage = materialResults.steelPercentage;
        vars.density = source.getConcreteDensity ? source.getConcreteDensity() : Config.getConcreteDensity();
        vars.volumeCum = materialResults.volumeCum;
        break;
      case 'plastering':
        vars.area = inputs.area;
        vars.thickness = inputs.thicknessMm;
        vars.ratio_cement = inputs.ratio[0];
        vars.ratio_sand = inputs.ratio[1];
        var mf3 = source.getMortarFactor ? source.getMortarFactor() : Config.getMortarFactor();
        vars.mortarFactor = unit === 'metric' ? mf3.metric : mf3.imperial;
        vars.bagVolume = source.getCementBagVolume ? source.getCementBagVolume(unit) : Config.getCementBagVolume(unit);
        break;
      case 'tiling':
        vars.floorArea = inputs.floorArea;
        vars.tileArea = inputs.tileArea;
        break;
    }
    return vars;
  }

  // ─── Project Settings View ───────────────────────────────────────────────

  function showProjectSettings() {
    if (!currentProjectId) return;

    // Hide estimation content
    categoryGrid.hidden = true;
    categoryForms.hidden = true;
    resultsContainer.hidden = true;
    document.getElementById('saved-estimates').hidden = true;

    // Show project settings panel
    projectSettingsPanel.hidden = false;

    renderProjectSettings(currentProjectId);
  }

  function hideProjectSettings() {
    if (projectSettingsPanel) projectSettingsPanel.hidden = true;
    var savedEstimates = document.getElementById('saved-estimates');
    if (savedEstimates) savedEstimates.hidden = false;
    renderCategories();
  }

  function renderProjectSettings(projectId) {
    DB.getProject(projectId).then(function (project) {
      if (!project) {
        projectSettingsContent.innerHTML = '<p>Project not found.</p>';
        return;
      }

      // Ensure configSnapshot exists
      if (!project.configSnapshot) {
        project.configSnapshot = Config.createSnapshot();
        DB.updateProject(project);
      }

      var snapshot = project.configSnapshot;
      var html = '';

      // Block Sizes Section
      html += '<div class="settings-card"><div class="settings-card-header"><h3>Block Sizes</h3>';
      html += '<button class="btn-outlined btn-sm btn-ps-add-block" aria-label="Add block size">+ Add</button></div>';
      html += '<div class="config-list" id="ps-block-sizes-list">';
      if (snapshot.blockSizes && snapshot.blockSizes.length > 0) {
        snapshot.blockSizes.forEach(function (bs) {
          html += '<div class="config-item" data-id="' + escapeHtml(bs.id) + '">';
          html += '<div class="config-item-info"><span class="config-item-label">' + escapeHtml(bs.label) + '</span>';
          html += '<span class="config-item-value">Cft: ' + bs.volCft + ' | Cu.m: ' + bs.volCum + '</span></div>';
          html += '<div class="config-item-actions">';
          html += '<button class="btn-icon btn-ps-edit-block" data-id="' + escapeHtml(bs.id) + '" title="Edit">✏️</button>';
          html += '<button class="btn-icon btn-ps-delete-block" data-id="' + escapeHtml(bs.id) + '" title="Delete">🗑️</button>';
          html += '</div></div>';
        });
      } else {
        html += '<p class="empty-hint">No block sizes configured.</p>';
      }
      html += '</div></div>';

      // Labor Rates Section
      html += '<div class="settings-card"><div class="settings-card-header"><h3>Labor Rates</h3>';
      html += '<button class="btn-outlined btn-sm btn-ps-add-labor" aria-label="Add labor rate">+ Add</button></div>';
      html += '<div class="config-list" id="ps-labor-rates-list">';
      if (snapshot.laborRates && Object.keys(snapshot.laborRates).length > 0) {
        Object.keys(snapshot.laborRates).forEach(function (cat) {
          var rate = snapshot.laborRates[cat];
          var label = cat.charAt(0).toUpperCase() + cat.slice(1);
          var rateStr = '';
          if (cat === 'steel') {
            rateStr = (rate.rate || '') + ' ' + (rate.unit || '');
          } else {
            rateStr = (rate.imperial ? rate.imperial.rate + ' ' + rate.imperial.unit : '') +
                      (rate.imperial && rate.metric ? ' | ' : '') +
                      (rate.metric ? rate.metric.rate + ' ' + rate.metric.unit : '');
          }
          html += '<div class="config-item" data-category="' + escapeHtml(cat) + '">';
          html += '<div class="config-item-info"><span class="config-item-label">' + escapeHtml(label) + '</span>';
          html += '<span class="config-item-value">' + escapeHtml(rateStr) + '</span></div>';
          html += '<div class="config-item-actions">';
          html += '<button class="btn-icon btn-ps-edit-labor" data-category="' + escapeHtml(cat) + '" title="Edit">✏️</button>';
          html += '<button class="btn-icon btn-ps-delete-labor" data-category="' + escapeHtml(cat) + '" title="Delete">🗑️</button>';
          html += '</div></div>';
        });
      } else {
        html += '<p class="empty-hint">No labor rates configured.</p>';
      }
      html += '</div></div>';

      // Steel Percentages Section
      html += '<div class="settings-card"><div class="settings-card-header"><h3>Steel Percentages</h3>';
      html += '<button class="btn-outlined btn-sm btn-ps-add-steel" aria-label="Add steel percentage">+ Add</button></div>';
      html += '<div class="config-list" id="ps-steel-pct-list">';
      if (snapshot.steelPercentages && Object.keys(snapshot.steelPercentages).length > 0) {
        Object.keys(snapshot.steelPercentages).forEach(function (type) {
          var pct = snapshot.steelPercentages[type];
          var label = type.replace(/_/g, ' ');
          label = label.charAt(0).toUpperCase() + label.slice(1);
          html += '<div class="config-item" data-type="' + escapeHtml(type) + '">';
          html += '<div class="config-item-info"><span class="config-item-label">' + escapeHtml(label) + '</span>';
          html += '<span class="config-item-value">' + pct + ' (' + (pct * 100).toFixed(2) + '%)</span></div>';
          html += '<div class="config-item-actions">';
          html += '<button class="btn-icon btn-ps-edit-steel" data-type="' + escapeHtml(type) + '" title="Edit">✏️</button>';
          html += '<button class="btn-icon btn-ps-delete-steel" data-type="' + escapeHtml(type) + '" title="Delete">🗑️</button>';
          html += '</div></div>';
        });
      } else {
        html += '<p class="empty-hint">No steel percentages configured.</p>';
      }
      html += '</div></div>';

      // Custom Calculations Section
      html += '<div class="settings-card"><div class="settings-card-header"><h3>Custom Calculations</h3>';
      html += '<button class="btn-outlined btn-sm btn-ps-add-calc" aria-label="Add custom calculation">+ Add</button></div>';
      html += '<div class="config-list" id="ps-custom-calcs-list">';
      var customs = snapshot.customCalculations || [];
      if (customs.length > 0) {
        customs.forEach(function (calc) {
          html += '<div class="config-item" data-id="' + escapeHtml(calc.id) + '">';
          html += '<div class="config-item-info"><span class="config-item-label">' + escapeHtml(calc.name) + '</span>';
          html += '<span class="config-item-value">Category: ' + escapeHtml(calc.category) + '</span>';
          html += '<span class="config-item-hint">Formula: ' + escapeHtml(calc.formula) + '</span></div>';
          html += '<div class="config-item-actions">';
          html += '<button class="btn-icon btn-ps-edit-calc" data-id="' + escapeHtml(calc.id) + '" title="Edit">✏️</button>';
          html += '<button class="btn-icon btn-ps-delete-calc" data-id="' + escapeHtml(calc.id) + '" title="Delete">🗑️</button>';
          html += '</div></div>';
        });
      } else {
        html += '<p class="empty-hint">No custom calculations configured.</p>';
      }
      html += '</div></div>';

      // Base Assumptions Section
      html += '<div class="settings-card"><h3>Base Assumptions</h3>';
      html += '<p class="setting-hint">Core constants for this project\'s calculations.</p>';
      html += '<div class="form-group"><label>Cement Bag Volume (Cft)</label>';
      html += '<input type="number" id="ps-cement-bag-cft" step="0.01" min="0.01" value="' + (snapshot.cementBagVolume ? snapshot.cementBagVolume.cft : 1.25) + '"></div>';
      html += '<div class="form-group"><label>Cement Bag Volume (Cu.m)</label>';
      html += '<input type="number" id="ps-cement-bag-cum" step="0.001" min="0.001" value="' + (snapshot.cementBagVolume ? snapshot.cementBagVolume.cum : 0.035) + '"></div>';
      html += '<div class="form-group"><label>Dry Volume Factor (Imperial)</label>';
      html += '<input type="number" id="ps-mortar-factor-imp" step="0.01" min="1" value="' + (snapshot.mortarFactor ? snapshot.mortarFactor.imperial : 1.33) + '"></div>';
      html += '<div class="form-group"><label>Dry Volume Factor (Metric)</label>';
      html += '<input type="number" id="ps-mortar-factor-met" step="0.01" min="1" value="' + (snapshot.mortarFactor ? snapshot.mortarFactor.metric : 1.33) + '"></div>';
      html += '<div class="form-group"><label>Concrete Density (kg/Cu.m)</label>';
      html += '<input type="number" id="ps-concrete-density" step="10" min="1000" value="' + (snapshot.concreteDensity || 2400) + '"></div>';
      html += '<div class="form-group"><label>Mortar Joint Thickness (inches)</label>';
      html += '<input type="number" id="ps-mortar-joint" step="0.05" min="0.1" value="' + (snapshot.mortarJointThickness || 0.25) + '"></div>';
      html += '<button class="btn-outlined btn-sm" id="btn-ps-save-assumptions">Save Assumptions</button>';
      html += '</div>';

      projectSettingsContent.innerHTML = html;

      // Bind base assumptions save
      var btnPsSaveAssumptions = document.getElementById('btn-ps-save-assumptions');
      if (btnPsSaveAssumptions) {
        btnPsSaveAssumptions.addEventListener('click', function () {
          var cft = parseFloat(document.getElementById('ps-cement-bag-cft').value);
          var cum = parseFloat(document.getElementById('ps-cement-bag-cum').value);
          var mfImp = parseFloat(document.getElementById('ps-mortar-factor-imp').value);
          var mfMet = parseFloat(document.getElementById('ps-mortar-factor-met').value);
          var density = parseFloat(document.getElementById('ps-concrete-density').value);
          var joint = parseFloat(document.getElementById('ps-mortar-joint').value);

          if (isNaN(cft) || cft <= 0 || isNaN(cum) || cum <= 0 || isNaN(mfImp) || mfImp < 1 || isNaN(mfMet) || mfMet < 1 || isNaN(density) || density <= 0 || isNaN(joint) || joint <= 0) {
            showToast('Please enter valid positive numbers');
            return;
          }

          snapshot.cementBagVolume = { cft: cft, cum: cum };
          snapshot.mortarFactor = { imperial: mfImp, metric: mfMet };
          snapshot.concreteDensity = density;
          snapshot.mortarJointThickness = joint;
          saveProjectSnapshot(projectId, snapshot);
        });
      }

      // Bind project settings CRUD actions
      bindProjectSettingsActions(projectId, snapshot);
    });
  }

  function bindProjectSettingsActions(projectId, snapshot) {
    // Block size actions
    projectSettingsContent.querySelectorAll('.btn-ps-delete-block').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (confirm('Delete this block size from project settings?')) {
          snapshot.blockSizes = snapshot.blockSizes.filter(function (bs) { return bs.id !== id; });
          saveProjectSnapshot(projectId, snapshot);
        }
      });
    });
    projectSettingsContent.querySelectorAll('.btn-ps-edit-block').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var item = snapshot.blockSizes.find(function (bs) { return bs.id === id; });
        if (item) showPsBlockForm(projectId, snapshot, item);
      });
    });
    var addBlockBtn = projectSettingsContent.querySelector('.btn-ps-add-block');
    if (addBlockBtn) addBlockBtn.addEventListener('click', function () { showPsBlockForm(projectId, snapshot, null); });

    // Labor rate actions
    projectSettingsContent.querySelectorAll('.btn-ps-delete-labor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-category');
        if (confirm('Delete the "' + cat + '" labor rate from project settings?')) {
          delete snapshot.laborRates[cat];
          saveProjectSnapshot(projectId, snapshot);
        }
      });
    });
    projectSettingsContent.querySelectorAll('.btn-ps-edit-labor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-category');
        showPsLaborForm(projectId, snapshot, { category: cat, data: snapshot.laborRates[cat] });
      });
    });
    var addLaborBtn = projectSettingsContent.querySelector('.btn-ps-add-labor');
    if (addLaborBtn) addLaborBtn.addEventListener('click', function () { showPsLaborForm(projectId, snapshot, null); });

    // Steel percentage actions
    projectSettingsContent.querySelectorAll('.btn-ps-delete-steel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-type');
        if (confirm('Delete the "' + type + '" steel percentage from project settings?')) {
          delete snapshot.steelPercentages[type];
          saveProjectSnapshot(projectId, snapshot);
        }
      });
    });
    projectSettingsContent.querySelectorAll('.btn-ps-edit-steel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-type');
        showPsSteelForm(projectId, snapshot, { type: type, percentage: snapshot.steelPercentages[type] });
      });
    });
    var addSteelBtn = projectSettingsContent.querySelector('.btn-ps-add-steel');
    if (addSteelBtn) addSteelBtn.addEventListener('click', function () { showPsSteelForm(projectId, snapshot, null); });

    // Custom calculation actions
    projectSettingsContent.querySelectorAll('.btn-ps-delete-calc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (confirm('Delete this custom calculation from project settings?')) {
          snapshot.customCalculations = (snapshot.customCalculations || []).filter(function (c) { return c.id !== id; });
          saveProjectSnapshot(projectId, snapshot);
        }
      });
    });
    projectSettingsContent.querySelectorAll('.btn-ps-edit-calc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var item = (snapshot.customCalculations || []).find(function (c) { return c.id === id; });
        if (item) showPsCalcForm(projectId, snapshot, item);
      });
    });
    var addCalcBtn = projectSettingsContent.querySelector('.btn-ps-add-calc');
    if (addCalcBtn) addCalcBtn.addEventListener('click', function () { showPsCalcForm(projectId, snapshot, null); });
  }

  function saveProjectSnapshot(projectId, snapshot) {
    DB.getProject(projectId).then(function (project) {
      project.configSnapshot = snapshot;
      return DB.updateProject(project);
    }).then(function () {
      renderProjectSettings(projectId);
      showToast('Project settings saved');
    });
  }

  // ─── Project Settings Inline Forms ───────────────────────────────────────

  function showPsBlockForm(projectId, snapshot, existing) {
    var container = document.getElementById('ps-block-sizes-list');
    if (!container) return;
    removeInlineForm(container);

    var isEdit = !!existing;
    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.innerHTML =
      '<div class="form-group"><label for="ps-bs-label">Label *</label>' +
      '<input id="ps-bs-label" type="text" name="label" autocomplete="off" placeholder="e.g. 8×4×16" value="' + (isEdit ? escapeHtml(existing.label) : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label for="ps-bs-volCft">Volume (Cft) *</label>' +
      '<input id="ps-bs-volCft" type="number" name="volCft" autocomplete="off" step="any" min="0.001" value="' + (isEdit ? existing.volCft : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label for="ps-bs-volCum">Volume (Cu.m) *</label>' +
      '<input id="ps-bs-volCum" type="number" name="volCum" autocomplete="off" step="any" min="0.001" value="' + (isEdit ? existing.volCum : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button></div>';

    container.insertBefore(form, container.firstChild);

    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var label = form.querySelector('input[name="label"]').value.trim();
      var volCft = parseFloat(form.querySelector('input[name="volCft"]').value);
      var volCum = parseFloat(form.querySelector('input[name="volCum"]').value);
      var msgs = form.querySelectorAll('.validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });
      var valid = true;
      if (!label) { msgs[0].textContent = 'Label is required'; valid = false; }
      if (isNaN(volCft) || volCft <= 0) { msgs[1].textContent = 'A positive number is required'; valid = false; }
      if (isNaN(volCum) || volCum <= 0) { msgs[2].textContent = 'A positive number is required'; valid = false; }
      if (!valid) return;

      if (isEdit) {
        var idx = snapshot.blockSizes.findIndex(function (bs) { return bs.id === existing.id; });
        if (idx >= 0) { snapshot.blockSizes[idx] = { id: existing.id, label: label, volCft: volCft, volCum: volCum }; }
      } else {
        snapshot.blockSizes.push({ id: label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '_' + Date.now(), label: label, volCft: volCft, volCum: volCum });
      }
      saveProjectSnapshot(projectId, snapshot);
    });
    form.querySelector('.btn-cancel-item').addEventListener('click', function () { form.remove(); });
  }

  function showPsLaborForm(projectId, snapshot, existing) {
    var container = document.getElementById('ps-labor-rates-list');
    if (!container) return;
    removeInlineForm(container);

    var isEdit = !!(existing && existing.data);
    var data = isEdit ? existing.data : {};
    var cat = isEdit ? existing.category : '';

    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.innerHTML =
      '<div class="form-group"><label for="ps-lr-cat">Category Name *</label>' +
      '<input id="ps-lr-cat" type="text" name="category" autocomplete="off" placeholder="e.g. masonry" value="' + escapeHtml(cat) + '" ' + (isEdit ? 'readonly' : '') + ' required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label for="ps-lr-imp">Imperial Rate *</label>' +
      '<div class="rate-input-row"><input id="ps-lr-imp" type="number" name="imperialRate" autocomplete="off" step="any" min="0.01" value="' + (data.imperial ? data.imperial.rate : (data.rate || '')) + '">' +
      '<input aria-label="Imperial unit" type="text" name="imperialUnit" autocomplete="off" placeholder="Cft/day" value="' + escapeHtml(data.imperial ? data.imperial.unit : (data.unit || '')) + '"></div>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label for="ps-lr-met">Metric Rate *</label>' +
      '<div class="rate-input-row"><input id="ps-lr-met" type="number" name="metricRate" autocomplete="off" step="any" min="0.01" value="' + (data.metric ? data.metric.rate : '') + '">' +
      '<input aria-label="Metric unit" type="text" name="metricUnit" autocomplete="off" placeholder="Cu.m/day" value="' + escapeHtml(data.metric ? data.metric.unit : '') + '"></div>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button></div>';

    container.insertBefore(form, container.firstChild);

    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var categoryName = form.querySelector('input[name="category"]').value.trim().toLowerCase();
      var imperialRate = parseFloat(form.querySelector('input[name="imperialRate"]').value);
      var imperialUnit = form.querySelector('input[name="imperialUnit"]').value.trim();
      var metricRate = parseFloat(form.querySelector('input[name="metricRate"]').value);
      var metricUnit = form.querySelector('input[name="metricUnit"]').value.trim();
      var msgs = form.querySelectorAll('.form-group > .validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });
      var valid = true;
      if (!categoryName) { msgs[0].textContent = 'Category is required'; valid = false; }
      if (isNaN(imperialRate) || imperialRate <= 0) { msgs[1].textContent = 'A positive number is required'; valid = false; }
      if (isNaN(metricRate) || metricRate <= 0) { msgs[2].textContent = 'A positive number is required'; valid = false; }
      if (!valid) return;

      snapshot.laborRates[categoryName] = {
        crew: data.crew || [{ role: 'Worker', count: 1 }],
        imperial: { rate: imperialRate, unit: imperialUnit || 'units/day' },
        metric: { rate: metricRate, unit: metricUnit || 'units/day' }
      };
      saveProjectSnapshot(projectId, snapshot);
    });
    form.querySelector('.btn-cancel-item').addEventListener('click', function () { form.remove(); });
  }

  function showPsSteelForm(projectId, snapshot, existing) {
    var container = document.getElementById('ps-steel-pct-list');
    if (!container) return;
    removeInlineForm(container);

    var isEdit = !!(existing && existing.type);
    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.innerHTML =
      '<div class="form-group"><label for="ps-sp-type">Element Type *</label>' +
      '<input id="ps-sp-type" type="text" name="elementType" autocomplete="off" placeholder="e.g. foundation" value="' + (isEdit ? escapeHtml(existing.type) : '') + '" ' + (isEdit ? 'readonly' : '') + ' required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label for="ps-sp-pct">Percentage Factor * (e.g. 0.0085)</label>' +
      '<input id="ps-sp-pct" type="number" name="percentage" autocomplete="off" step="any" min="0.0001" value="' + (isEdit ? existing.percentage : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button></div>';

    container.insertBefore(form, container.firstChild);

    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var elementType = form.querySelector('input[name="elementType"]').value.trim().toLowerCase();
      var percentage = parseFloat(form.querySelector('input[name="percentage"]').value);
      var msgs = form.querySelectorAll('.validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });
      var valid = true;
      if (!elementType) { msgs[0].textContent = 'Element type is required'; valid = false; }
      if (isNaN(percentage) || percentage <= 0) { msgs[1].textContent = 'A positive number is required'; valid = false; }
      if (!valid) return;

      snapshot.steelPercentages[elementType] = percentage;
      saveProjectSnapshot(projectId, snapshot);
    });
    form.querySelector('.btn-cancel-item').addEventListener('click', function () { form.remove(); });
  }

  function showPsCalcForm(projectId, snapshot, existing) {
    var container = document.getElementById('ps-custom-calcs-list');
    if (!container) return;
    removeInlineForm(container);

    var isEdit = !!existing;
    var categories = ['masonry', 'concreting', 'steel', 'plastering', 'tiling', 'labor'];
    var optionsHtml = '<option value="">Select category</option>';
    categories.forEach(function (cat) {
      var selected = (isEdit && existing.category === cat) ? ' selected' : '';
      optionsHtml += '<option value="' + cat + '"' + selected + '>' + cat.charAt(0).toUpperCase() + cat.slice(1) + '</option>';
    });

    var form = document.createElement('div');
    form.className = 'inline-edit-form';
    form.innerHTML =
      '<div class="form-group"><label for="ps-cc-name">Name *</label>' +
      '<input id="ps-cc-name" type="text" name="calcName" autocomplete="off" placeholder="e.g. Extra Cement" value="' + (isEdit ? escapeHtml(existing.name) : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label for="ps-cc-cat">Category *</label>' +
      '<select id="ps-cc-cat" name="calcCategory" autocomplete="off" required>' + optionsHtml + '</select>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label for="ps-cc-formula">Formula *</label>' +
      '<textarea id="ps-cc-formula" name="formula" autocomplete="off" rows="2" placeholder="e.g. volume * ratio_cement" required>' + (isEdit ? escapeHtml(existing.formula) : '') + '</textarea>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-sm btn-save-item">Save</button>' +
      '<button type="button" class="btn-outlined btn-sm btn-cancel-item">Cancel</button></div>';

    container.insertBefore(form, container.firstChild);

    form.querySelector('.btn-save-item').addEventListener('click', function () {
      var name = form.querySelector('input[name="calcName"]').value.trim();
      var category = form.querySelector('select[name="calcCategory"]').value;
      var formula = form.querySelector('textarea[name="formula"]').value.trim();
      var msgs = form.querySelectorAll('.form-group > .validation-msg');
      msgs.forEach(function (m) { m.textContent = ''; });
      var valid = true;
      if (!name) { msgs[0].textContent = 'Name is required'; valid = false; }
      if (!category) { msgs[1].textContent = 'Category is required'; valid = false; }
      if (!formula) { msgs[2].textContent = 'Formula is required'; valid = false; }
      if (!valid) return;

      if (!snapshot.customCalculations) snapshot.customCalculations = [];
      if (isEdit) {
        var idx = snapshot.customCalculations.findIndex(function (c) { return c.id === existing.id; });
        if (idx >= 0) { snapshot.customCalculations[idx] = { id: existing.id, name: name, category: category, formula: formula }; }
      } else {
        snapshot.customCalculations.push({ id: 'calc_' + Date.now(), name: name, category: category, formula: formula });
      }
      saveProjectSnapshot(projectId, snapshot);
    });
    form.querySelector('.btn-cancel-item').addEventListener('click', function () { form.remove(); });
  }

  function removeInlineForm(container) {
    var existing = container.querySelector('.inline-edit-form');
    if (existing) existing.remove();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    init: init,
    setProject: setProject,
    renderCategories: renderCategories,
    refreshIfActive: function (projectId) {
      if (currentProjectId === projectId) { renderSavedEstimates(); }
    },
    renderSavedEstimates: renderSavedEstimates,
    showCategoryForm: showCategoryForm,
    calculate: calculate,
    saveEstimate: saveEstimate,
    showProjectSettings: showProjectSettings,
    hideProjectSettings: hideProjectSettings,
    showEstimateDetail: function (id) { return Promise.resolve(); }
  };
})();
