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

    var estimate = {
      projectId: currentProjectId,
      category: currentCategory,
      inputs: lastInputs,
      materialResults: lastMaterialResults,
      laborResults: lastLaborResults,
      unit: App.getUnit(),
      createdAt: new Date().toISOString()
    };

    return DB.addEstimate(estimate).then(function () {
      showToast('Estimate saved');
      renderSavedEstimates();
      renderCategories();
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
          '<div class="list-item-title">' + escapeHtml(categoryLabel) + '</div>' +
          '<div class="list-item-subtitle">' + dateStr + '</div>' +
          '</div>' +
          '<div class="list-item-meta">' +
          '<span class="list-item-total">' + escapeHtml(detail) + '</span>' +
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

      // Show project total
      projectTotalContainer.hidden = false;
      projectTotalValue.textContent = Math.round(totalBags * 100) / 100 + ' cement bags';
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

      projectSettingsContent.innerHTML = html;

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
      '<div class="form-group"><label>Label *</label>' +
      '<input type="text" name="label" placeholder="e.g. 8×4×16" value="' + (isEdit ? escapeHtml(existing.label) : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label>Volume (Cft) *</label>' +
      '<input type="number" name="volCft" step="any" min="0.001" value="' + (isEdit ? existing.volCft : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label>Volume (Cu.m) *</label>' +
      '<input type="number" name="volCum" step="any" min="0.001" value="' + (isEdit ? existing.volCum : '') + '" required>' +
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
      '<div class="form-group"><label>Category Name *</label>' +
      '<input type="text" name="category" placeholder="e.g. masonry" value="' + escapeHtml(cat) + '" ' + (isEdit ? 'readonly' : '') + ' required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label>Imperial Rate *</label>' +
      '<div class="rate-input-row"><input type="number" name="imperialRate" step="any" min="0.01" value="' + (data.imperial ? data.imperial.rate : (data.rate || '')) + '">' +
      '<input type="text" name="imperialUnit" placeholder="Cft/day" value="' + escapeHtml(data.imperial ? data.imperial.unit : (data.unit || '')) + '"></div>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label>Metric Rate *</label>' +
      '<div class="rate-input-row"><input type="number" name="metricRate" step="any" min="0.01" value="' + (data.metric ? data.metric.rate : '') + '">' +
      '<input type="text" name="metricUnit" placeholder="Cu.m/day" value="' + escapeHtml(data.metric ? data.metric.unit : '') + '"></div>' +
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
      '<div class="form-group"><label>Element Type *</label>' +
      '<input type="text" name="elementType" placeholder="e.g. foundation" value="' + (isEdit ? escapeHtml(existing.type) : '') + '" ' + (isEdit ? 'readonly' : '') + ' required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label>Percentage Factor * (e.g. 0.0085)</label>' +
      '<input type="number" name="percentage" step="any" min="0.0001" value="' + (isEdit ? existing.percentage : '') + '" required>' +
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
      '<div class="form-group"><label>Name *</label>' +
      '<input type="text" name="calcName" placeholder="e.g. Extra Cement" value="' + (isEdit ? escapeHtml(existing.name) : '') + '" required>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label>Category *</label>' +
      '<select name="calcCategory" required>' + optionsHtml + '</select>' +
      '<span class="validation-msg"></span></div>' +
      '<div class="form-group"><label>Formula *</label>' +
      '<textarea name="formula" rows="2" placeholder="e.g. volume * ratio_cement" required>' + (isEdit ? escapeHtml(existing.formula) : '') + '</textarea>' +
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
    renderSavedEstimates: renderSavedEstimates,
    showCategoryForm: showCategoryForm,
    calculate: calculate,
    saveEstimate: saveEstimate,
    showProjectSettings: showProjectSettings,
    hideProjectSettings: hideProjectSettings,
    showEstimateDetail: function (id) { return Promise.resolve(); }
  };
})();
