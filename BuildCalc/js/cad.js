/**
 * cad.js - CAD Import Module for BuildCalc
 *
 * Parses DXF files (and DWG via conversion hint) in-browser.
 * Extracts entities, computes dimensions, maps to BuildCalc
 * estimation categories, and bulk-saves estimates.
 *
 * Dependencies: db.js, calc-engine.js, config.js, app.js
 */
'use strict';

const CAD = (function () {

  // ── State ──────────────────────────────────────────────────────────────
  var currentProjectId = null;
  var parsedRows = [];      // { id, layer, type, label, value, unit, category, inputs, selected }

  // ── DOM refs ───────────────────────────────────────────────────────────
  var cadScreen;
  var cadProjectNotice;
  var cadUploadZone;
  var cadFileInput;
  var cadFileName;
  var cadProgress;
  var cadProgressBar;
  var cadProgressText;
  var cadGrid;
  var cadGridBody;
  var cadGridCount;
  var cadSelCount;
  var btnCadSelectAll;
  var btnCadDeselectAll;
  var btnCadPush;
  var cadPushResult;
  var cadFilterCategory;
  var cadFilterLayer;

  // ── Category mapping ───────────────────────────────────────────────────
  var LAYER_PATTERNS = [
    { pattern: /wall|brick|block|mason/i,    category: 'masonry'    },
    { pattern: /slab|concrete|conc|found/i,  category: 'concreting' },
    { pattern: /steel|rebar|reinf|column|beam|struct/i, category: 'steel' },
    { pattern: /plaster|render|stucco/i,     category: 'plastering' },
    { pattern: /tile|floor|tiling|ceramic/i, category: 'tiling'     },
  ];

  function guessCategory(layer, entityType) {
    var src = (layer || '') + ' ' + (entityType || '');
    for (var i = 0; i < LAYER_PATTERNS.length; i++) {
      if (LAYER_PATTERNS[i].pattern.test(src)) return LAYER_PATTERNS[i].category;
    }
    // Fallback by entity type
    if (entityType === 'TEXT' || entityType === 'MTEXT') return 'annotation';
    if (entityType === 'INSERT') return 'block';
    return 'concreting'; // generic solid default
  }

  // ── Initialisation ─────────────────────────────────────────────────────
  function init() {
    cadScreen          = document.getElementById('cad-screen');
    cadProjectNotice   = document.getElementById('cad-no-project');
    cadUploadZone      = document.getElementById('cad-upload-zone');
    cadFileInput       = document.getElementById('cad-file-input');
    cadFileName        = document.getElementById('cad-file-name');
    cadProgress        = document.getElementById('cad-progress');
    cadProgressBar     = document.getElementById('cad-progress-bar');
    cadProgressText    = document.getElementById('cad-progress-text');
    cadGrid            = document.getElementById('cad-grid');
    cadGridBody        = document.getElementById('cad-grid-body');
    cadGridCount       = document.getElementById('cad-grid-count');
    cadSelCount        = document.getElementById('cad-sel-count');
    btnCadSelectAll    = document.getElementById('btn-cad-select-all');
    btnCadDeselectAll  = document.getElementById('btn-cad-deselect-all');
    btnCadPush         = document.getElementById('btn-cad-push');
    cadPushResult      = document.getElementById('cad-push-result');
    cadFilterCategory  = document.getElementById('cad-filter-category');
    cadFilterLayer     = document.getElementById('cad-filter-layer');

    // Upload zone
    cadUploadZone.addEventListener('click', function () { cadFileInput.click(); });
    cadUploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      cadUploadZone.classList.add('drag-over');
    });
    cadUploadZone.addEventListener('dragleave', function () {
      cadUploadZone.classList.remove('drag-over');
    });
    cadUploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      cadUploadZone.classList.remove('drag-over');
      var file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    cadFileInput.addEventListener('change', function () {
      if (cadFileInput.files[0]) handleFile(cadFileInput.files[0]);
    });

    btnCadSelectAll.addEventListener('click', function () {
      parsedRows.forEach(function (r) { if (matchesFilter(r)) r.selected = true; });
      renderGrid();
    });
    btnCadDeselectAll.addEventListener('click', function () {
      parsedRows.forEach(function (r) { r.selected = false; });
      renderGrid();
    });
    btnCadPush.addEventListener('click', pushEstimates);

    cadFilterCategory.addEventListener('change', renderGrid);
    cadFilterLayer.addEventListener('change', renderGrid);
  }

  // ── Project context ────────────────────────────────────────────────────
  function setProject(projectId) {
    currentProjectId = projectId;
    updateProjectNotice();
  }

  function updateProjectNotice() {
    if (cadProjectNotice) cadProjectNotice.hidden = !!currentProjectId;
    if (btnCadPush) btnCadPush.disabled = !currentProjectId;
  }

  // ── File handling ──────────────────────────────────────────────────────
  function handleFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    cadFileName.textContent = file.name;
    cadPushResult.textContent = '';
    cadPushResult.className = 'cad-push-result';

    if (ext === 'dwg') {
      showProgress('DWG detected — reading binary format…', 10);
      readDWG(file);
    } else if (ext === 'dxf') {
      showProgress('Reading DXF…', 10);
      readDXF(file);
    } else {
      showError('Unsupported file type. Please upload a .dxf or .dwg file.');
    }
  }

  // ── DXF reader ─────────────────────────────────────────────────────────
  function readDXF(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      showProgress('Parsing DXF entities…', 40);
      try {
        var rows = parseDXF(e.target.result);
        showProgress('Building grid…', 80);
        finishParse(rows, file.name);
      } catch (err) {
        showError('DXF parse error: ' + err.message);
      }
    };
    reader.onerror = function () { showError('Could not read file.'); };
    reader.readAsText(file);
  }

  // ── DWG reader — binary, extract embedded DXF via ASCII scan ──────────
  function readDWG(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      showProgress('Scanning DWG binary for entity data…', 30);
      try {
        var text = decodeDWGAsText(e.target.result);
        showProgress('Extracting text annotations and blocks…', 60);
        var rows = extractDWGEntities(text, file.name);
        showProgress('Building grid…', 80);
        finishParse(rows, file.name);
      } catch (err) {
        showError('DWG parse error: ' + err.message);
      }
    };
    reader.onerror = function () { showError('Could not read file.'); };
    reader.readAsArrayBuffer(file);
  }

  /**
   * DWG binary: decode readable ASCII strings from the buffer.
   * DWG is proprietary binary; we extract layer names and text
   * strings that are stored as ASCII runs inside it.
   */
  function decodeDWGAsText(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunks = [];
    var cur = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b >= 0x20 && b < 0x7F) {
        cur += String.fromCharCode(b);
      } else {
        if (cur.length >= 3) chunks.push(cur);
        cur = '';
      }
    }
    if (cur.length >= 3) chunks.push(cur);
    return chunks.join('\n');
  }

  /**
   * From the extracted ASCII runs of a DWG file, infer entities.
   * We look for dimension-like strings (numbers with units) and layer names.
   */
  function extractDWGEntities(text, filename) {
    var lines = text.split('\n');
    var rows = [];
    var seenLayers = {};
    var idCounter = 1;

    // Regex: a number (with optional decimal) followed by optional unit keywords
    var dimRe = /^(\d+\.?\d*)\s*(m2?|ft2?|mm|cm|sft|cft|sqft|sqm)?$/i;
    // Layer-name-like strings: alphanumeric with hyphens/underscores, 3-30 chars
    var layerRe = /^[A-Za-z][A-Za-z0-9_\-]{2,29}$/;

    var currentLayer = '0';
    lines.forEach(function (line) {
      line = line.trim();
      if (layerRe.test(line) && !dimRe.test(line)) {
        var cat = guessCategory(line, '');
        if (cat !== 'annotation' && cat !== 'block') {
          currentLayer = line;
          if (!seenLayers[line]) seenLayers[line] = true;
        }
      }
      var m = line.match(dimRe);
      if (m) {
        var val = parseFloat(m[1]);
        var unitHint = (m[2] || '').toLowerCase();
        if (val > 0 && val < 100000) {
          var cat = guessCategory(currentLayer, 'LWPOLYLINE');
          var dimType = (unitHint.indexOf('2') >= 0 || unitHint === 'sft' || unitHint === 'sqft' || unitHint === 'sqm' || unitHint === 'm2') ? 'area' : 'volume';
          rows.push(makeRow(idCounter++, currentLayer, 'DWG-ENTITY', dimType === 'area' ? 'Area' : 'Volume', val, 'Cft', cat));
        }
      }
    });

    // If nothing found, return a placeholder so user sees the file was read
    if (rows.length === 0) {
      rows.push(makeRow(1, '0', 'DWG-SCAN', 'No numeric entities found', 0, '-', 'annotation'));
    }
    return rows;
  }

  // ── DXF parser ─────────────────────────────────────────────────────────
  function parseDXF(text) {
    // Normalise line endings
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var rows = [];
    var idCounter = 1;

    // Read group-code / value pairs
    var pairs = [];
    for (var i = 0; i + 1 < lines.length; i += 2) {
      pairs.push({ code: parseInt(lines[i].trim(), 10), value: lines[i + 1].trim() });
    }

    // Walk ENTITIES section
    var inEntities = false;
    var j = 0;
    while (j < pairs.length) {
      var p = pairs[j];

      if (p.code === 2 && p.value === 'ENTITIES') { inEntities = true; j++; continue; }
      if (p.code === 0 && p.value === 'ENDSEC' && inEntities) { inEntities = false; j++; continue; }

      if (inEntities && p.code === 0) {
        var entityType = p.value;
        var entityStart = j;
        j++;
        // Collect all group-code pairs for this entity until next code-0
        var ep = {};
        while (j < pairs.length && pairs[j].code !== 0) {
          var gp = pairs[j];
          // Store first occurrence keyed by code
          if (ep[gp.code] === undefined) ep[gp.code] = gp.value;
          j++;
        }

        var layer = ep[8] || '0';
        var row = entityToRow(idCounter, entityType, layer, ep, pairs, entityStart);
        if (row) { rows.push(row); idCounter++; }
      } else {
        j++;
      }
    }

    return rows;
  }

  function entityToRow(id, type, layer, ep, allPairs, startIdx) {
    var cat = guessCategory(layer, type);
    var unit = 'Cft';

    switch (type) {

      case 'LINE': {
        var x1 = parseFloat(ep[10] || 0), y1 = parseFloat(ep[20] || 0);
        var x2 = parseFloat(ep[11] || 0), y2 = parseFloat(ep[21] || 0);
        var len = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        len = round4(len);
        if (len <= 0) return null;
        return makeRow(id, layer, type, 'Length', len, 'units', cat);
      }

      case 'CIRCLE': {
        var r = parseFloat(ep[40] || 0);
        var area = round4(Math.PI * r * r);
        return makeRow(id, layer, type, 'Area (circle)', area, 'sq.units', cat);
      }

      case 'ARC': {
        var r2 = parseFloat(ep[40] || 0);
        var startA = parseFloat(ep[50] || 0) * Math.PI / 180;
        var endA   = parseFloat(ep[51] || 0) * Math.PI / 180;
        if (endA < startA) endA += 2 * Math.PI;
        var arcLen = round4(r2 * (endA - startA));
        return makeRow(id, layer, type, 'Arc length', arcLen, 'units', cat);
      }

      case 'LWPOLYLINE': {
        // Collect all x/y vertex coords (codes 10, 20 repeat)
        var verts = collectPolylineVerts(allPairs, startIdx);
        var info = polylineInfo(verts, ep[70]);
        return makeRow(id, layer, type, info.closed ? 'Area' : 'Perimeter', info.value, info.closed ? 'sq.units' : 'units', cat);
      }

      case 'POLYLINE': {
        // 3D polyline — just do perimeter approximation from VERTEX entities if available
        return makeRow(id, layer, type, 'Polyline', 0, 'units', cat);
      }

      case 'SPLINE': {
        // Use fit points (code 11) or control points (code 10) to approximate length
        return makeRow(id, layer, type, 'Spline', 0, 'units', cat);
      }

      case 'TEXT':
      case 'MTEXT': {
        var txt = ep[1] || '';
        // Strip MTEXT formatting codes
        txt = txt.replace(/\\[a-zA-Z][^;]*;/g, '').replace(/[{}]/g, '').trim();
        if (!txt) return null;
        // Check if text looks like a dimension measurement
        var numMatch = txt.match(/(\d+\.?\d*)\s*(m2?|ft2?|mm|cm|sft|cft|sqft|sqm)?/i);
        if (numMatch) {
          var val = parseFloat(numMatch[1]);
          var hasAreaUnit = /m2|sft|sqft|sqm/i.test(numMatch[2] || '');
          return makeRow(id, layer, type, 'Annotation: ' + txt, val, hasAreaUnit ? 'sq.units' : 'units', 'annotation');
        }
        return makeRow(id, layer, type, 'Label: ' + txt.slice(0, 40), 0, '-', 'annotation');
      }

      case 'INSERT': {
        var blockName = ep[2] || '';
        var sx = parseFloat(ep[41] || 1), sy = parseFloat(ep[42] || 1);
        return makeRow(id, layer, type, 'Block: ' + blockName, round4(sx * sy), 'scale', guessCategory(blockName, type));
      }

      case 'HATCH': {
        // HATCH stores area in code 47 (pattern scale) but actual area isn't in standard DXF codes easily
        // Use bounding approach: skip for now and flag
        return makeRow(id, layer, type, 'Hatch region', 0, 'sq.units', cat);
      }

      case 'SOLID':
      case '3DFACE': {
        var corners = [
          [parseFloat(ep[10]||0), parseFloat(ep[20]||0)],
          [parseFloat(ep[11]||0), parseFloat(ep[21]||0)],
          [parseFloat(ep[12]||0), parseFloat(ep[22]||0)],
          [parseFloat(ep[13]||0), parseFloat(ep[23]||0)],
        ];
        var a = polygonArea(corners);
        return makeRow(id, layer, type, 'Face area', round4(a), 'sq.units', cat);
      }

      case 'DIMENSION': {
        var dimVal = parseFloat(ep[42] || 0);
        return makeRow(id, layer, type, 'Dimension', round4(dimVal), 'units', cat);
      }

      default:
        return null;
    }
  }

  // ── Geometry helpers ───────────────────────────────────────────────────
  function collectPolylineVerts(allPairs, startIdx) {
    var verts = [];
    var j = startIdx + 1;
    var xs = [], ys = [];
    // Collect repeating code 10 (X) and code 20 (Y) pairs
    while (j < allPairs.length && allPairs[j].code !== 0) {
      if (allPairs[j].code === 10) xs.push(parseFloat(allPairs[j].value));
      if (allPairs[j].code === 20) ys.push(parseFloat(allPairs[j].value));
      j++;
    }
    for (var k = 0; k < xs.length; k++) {
      verts.push([xs[k], ys[k] !== undefined ? ys[k] : 0]);
    }
    return verts;
  }

  function polylineInfo(verts, flagCode) {
    var closed = parseInt(flagCode || 0) & 1;
    if (verts.length < 2) return { closed: false, value: 0 };
    if (closed && verts.length >= 3) {
      return { closed: true, value: round4(Math.abs(polygonArea(verts))) };
    }
    var perim = 0;
    for (var i = 0; i < verts.length - 1; i++) {
      perim += Math.sqrt(Math.pow(verts[i+1][0]-verts[i][0],2)+Math.pow(verts[i+1][1]-verts[i][1],2));
    }
    return { closed: false, value: round4(perim) };
  }

  function polygonArea(pts) {
    var n = pts.length, a = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      a += pts[i][0] * pts[j][1];
      a -= pts[j][0] * pts[i][1];
    }
    return a / 2;
  }

  function round4(v) { return Math.round(v * 10000) / 10000; }

  function makeRow(id, layer, type, label, value, unit, category) {
    return {
      id: id, layer: layer, type: type, label: label,
      value: value, unit: unit, category: category, selected: false
    };
  }

  // ── After parse ────────────────────────────────────────────────────────
  function finishParse(rows, filename) {
    parsedRows = rows;
    showProgress('Done — ' + rows.length + ' entities found.', 100);
    setTimeout(function () { cadProgress.hidden = true; }, 600);

    // Populate layer filter
    var layers = {};
    rows.forEach(function (r) { layers[r.layer] = true; });
    var layerHtml = '<option value="">All layers</option>';
    Object.keys(layers).sort().forEach(function (l) {
      layerHtml += '<option value="' + escHtml(l) + '">' + escHtml(l) + '</option>';
    });
    cadFilterLayer.innerHTML = layerHtml;

    cadGrid.hidden = false;
    renderGrid();
  }

  // ── Grid rendering ─────────────────────────────────────────────────────
  function matchesFilter(row) {
    var cf = cadFilterCategory.value;
    var lf = cadFilterLayer.value;
    if (cf && row.category !== cf) return false;
    if (lf && row.layer !== lf) return false;
    return true;
  }

  var CAT_LABELS = {
    masonry: 'Masonry', concreting: 'Concreting', steel: 'Steel',
    plastering: 'Plastering', tiling: 'Tiling',
    annotation: 'Annotation', block: 'Block'
  };

  function renderGrid() {
    var filtered = parsedRows.filter(matchesFilter);
    var selected = parsedRows.filter(function (r) { return r.selected; }).length;

    cadGridCount.textContent = filtered.length + ' entities';
    cadSelCount.textContent = selected + ' selected';

    if (filtered.length === 0) {
      cadGridBody.innerHTML = '<tr><td colspan="6" class="cad-empty">No entities match the current filter.</td></tr>';
      return;
    }

    var html = '';
    filtered.forEach(function (row) {
      var catLabel = CAT_LABELS[row.category] || row.category;
      var catClass = 'cad-cat-' + (row.category || 'other');
      var valueDisplay = row.value > 0 ? row.value : '—';
      html += '<tr class="cad-row' + (row.selected ? ' cad-row-selected' : '') + '" data-id="' + row.id + '">'
        + '<td><input type="checkbox" class="cad-chk" data-id="' + row.id + '"' + (row.selected ? ' checked' : '') + (row.category === 'annotation' ? ' title="Annotations cannot be pushed as estimates"' : '') + '></td>'
        + '<td class="cad-layer">' + escHtml(row.layer) + '</td>'
        + '<td class="cad-type">' + escHtml(row.type) + '</td>'
        + '<td class="cad-label">' + escHtml(row.label) + '</td>'
        + '<td class="cad-value">' + valueDisplay + ' <span class="cad-unit">' + escHtml(row.unit) + '</span></td>'
        + '<td><span class="cad-cat-badge ' + catClass + '">' + catLabel + '</span></td>'
        + '</tr>';
    });
    cadGridBody.innerHTML = html;

    // Bind row checkboxes
    cadGridBody.querySelectorAll('.cad-chk').forEach(function (chk) {
      chk.addEventListener('change', function () {
        var id = parseInt(this.getAttribute('data-id'));
        var row = parsedRows.find(function (r) { return r.id === id; });
        if (row) {
          if (row.category === 'annotation') { this.checked = false; return; }
          row.selected = this.checked;
          updateSelCount();
          var tr = this.closest('tr');
          if (tr) tr.classList.toggle('cad-row-selected', row.selected);
        }
      });
    });
  }

  function updateSelCount() {
    var selected = parsedRows.filter(function (r) { return r.selected; }).length;
    cadSelCount.textContent = selected + ' selected';
  }

  // ── Push to estimates ──────────────────────────────────────────────────
  function pushEstimates() {
    if (!currentProjectId) {
      showPushResult('Please select a project first.', 'error');
      return;
    }
    var selected = parsedRows.filter(function (r) { return r.selected && r.value > 0; });
    if (selected.length === 0) {
      showPushResult('No rows selected (or selected rows have zero value).', 'error');
      return;
    }

    btnCadPush.disabled = true;
    btnCadPush.textContent = 'Pushing…';

    DB.getProject(currentProjectId).then(function (project) {
      var configSource = (project && project.configSnapshot)
        ? CalcEngine.wrapSnapshot(project.configSnapshot)
        : null;
      var unit = App.getUnit();

      // Default params used when DXF doesn't specify them
      var defaultBlockSizes = configSource ? configSource.getBlockSizes() : Config.getBlockSizes();
      var defaultBlock = defaultBlockSizes[0];
      var masonryRatio = [1, 6];
      var concretingRatio = [1, 2, 4];
      var plasteringThickness = 12;
      var plasteringRatio = [1, 4];
      var defaultTileArea = 1; // 1 sq unit tile default

      // Serial promise chain
      return selected.reduce(function (chain, row, idx) {
        return chain.then(function () {
          return buildEstimate(row, unit, configSource, defaultBlock, masonryRatio,
            concretingRatio, plasteringThickness, plasteringRatio, defaultTileArea, idx + 1);
        }).then(function (estimate) {
          if (estimate) return DB.addEstimate(estimate);
        });
      }, Promise.resolve());

    }).then(function () {
      showPushResult(selected.length + ' estimate(s) saved successfully.', 'success');
      // Deselect all
      parsedRows.forEach(function (r) { r.selected = false; });
      renderGrid();
      // Notify estimation module to refresh
      if (Estimation && Estimation.refreshIfActive) Estimation.refreshIfActive(currentProjectId);
    }).catch(function (err) {
      showPushResult('Error saving estimates: ' + err.message, 'error');
    }).finally(function () {
      btnCadPush.disabled = !currentProjectId;
      btnCadPush.textContent = 'Push to Estimates';
    });
  }

  function buildEstimate(row, unit, configSource, defaultBlock, masonryRatio,
      concretingRatio, plasteringThickness, plasteringRatio, defaultTileArea, seq) {

    var cat = row.category;
    var val = row.value;
    var inputs, materialResults, laborResults, laborQty;
    var tag = row.label.slice(0, 50) + ' (CAD-' + seq + ')';

    try {
      switch (cat) {
        case 'masonry':
          inputs = { volume: val, blockSizeId: defaultBlock ? defaultBlock.id : '', ratio: masonryRatio };
          materialResults = CalcEngine.masonry(val, defaultBlock, masonryRatio, unit, configSource);
          laborResults = CalcEngine.labor(val, 'masonry', unit, configSource);
          break;

        case 'concreting':
          inputs = { volume: val, ratio: concretingRatio };
          materialResults = CalcEngine.concreting(val, concretingRatio, unit, configSource);
          laborResults = CalcEngine.labor(val, 'concreting', unit, configSource);
          break;

        case 'steel':
          inputs = { volume: val, elementType: 'slab' };
          materialResults = CalcEngine.steel(val, 'slab', unit, configSource);
          laborQty = materialResults.weightKg;
          laborResults = CalcEngine.labor(laborQty, 'steel', unit, configSource);
          break;

        case 'plastering':
          inputs = { area: val, thicknessMm: plasteringThickness, ratio: plasteringRatio };
          materialResults = CalcEngine.plastering(val, plasteringThickness, plasteringRatio, unit, configSource);
          laborResults = CalcEngine.labor(val, 'plastering', unit, configSource);
          break;

        case 'tiling':
          inputs = { floorArea: val, tileArea: defaultTileArea };
          materialResults = CalcEngine.tiling(val, defaultTileArea, configSource);
          laborResults = CalcEngine.labor(val, 'tiling', unit, configSource);
          break;

        default:
          return Promise.resolve(null); // skip annotations etc.
      }
    } catch (e) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      projectId: currentProjectId,
      category: cat,
      inputs: inputs,
      materialResults: materialResults,
      laborResults: laborResults,
      unit: unit,
      tag: tag,
      createdAt: new Date().toISOString(),
      source: 'cad'
    });
  }

  // ── Progress / error helpers ───────────────────────────────────────────
  function showProgress(msg, pct) {
    cadProgress.hidden = false;
    cadProgressText.textContent = msg;
    cadProgressBar.style.width = pct + '%';
    cadProgressBar.setAttribute('aria-valuenow', pct);
  }

  function showError(msg) {
    cadProgress.hidden = true;
    showPushResult(msg, 'error');
  }

  function showPushResult(msg, type) {
    cadPushResult.textContent = msg;
    cadPushResult.className = 'cad-push-result cad-push-' + type;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    init: init,
    setProject: setProject,
    updateProjectNotice: updateProjectNotice
  };

})();
