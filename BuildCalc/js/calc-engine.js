/**
 * calc-engine.js - Calculation Engine for BuildCalc
 *
 * Pure calculation functions for all estimation categories.
 * Reads all parameters from the Config module (not hardcoded).
 * Supports an optional configSource parameter to read from a project snapshot.
 *
 * Dependencies: config.js, formula-engine.js
 */
'use strict';

const CalcEngine = (function () {
  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Round a number to 2 decimal places.
   * @param {number} val
   * @returns {number}
   */
  function round2(val) {
    return Math.round(val * 100) / 100;
  }

  // ─── Snapshot Adapter ────────────────────────────────────────────────────

  /**
   * Wrap a raw snapshot object to provide the same getter interface as Config.
   * @param {Object} snapshot - Raw config snapshot object
   * @returns {Object} Adapter with Config-compatible getter methods
   */
  function wrapSnapshot(snapshot) {
    return {
      getBlockSizes: function() { return snapshot.blockSizes; },
      getLaborRates: function() { return snapshot.laborRates; },
      getSteelPercentages: function() { return snapshot.steelPercentages; },
      getMortarFactor: function() { return snapshot.mortarFactor; },
      getMortarJointThickness: function() { return snapshot.mortarJointThickness || 0.25; },
      getCementBagVolume: function(unit) {
        return unit === 'metric' ? snapshot.cementBagVolume.cum : snapshot.cementBagVolume.cft;
      },
      getConcreteDensity: function() { return snapshot.concreteDensity; },
      getCustomCalculations: function() { return snapshot.customCalculations || []; }
    };
  }

  // ─── Masonry Calculation ─────────────────────────────────────────────────

  /**
   * Compute masonry material estimates.
   *
   * @param {number} volume - Total masonry volume (Cft or Cu.m)
   * @param {Object} blockSize - Block size object { id, label, volCft, volCum }
   * @param {number[]} ratio - Mix ratio [cement, sand] e.g. [1, 6]
   * @param {string} unit - 'imperial' or 'metric'
   * @param {Object} [configSource] - Optional config source (snapshot adapter or Config)
   * @returns {Object} { blocks, mortarVolume, cementBags, sandVolume }
   */
  function masonry(volume, blockSize, ratio, unit, configSource) {
    var source = configSource || Config;

    // Get mortar joint thickness (configurable, default 0.25 inches = 0.00635 meters)
    var mortarJointInches = source.getMortarJointThickness ? source.getMortarJointThickness() : 0.25;

    // Joint is shared between 2 bricks, so each brick gets half the thickness
    var halfJointInches = mortarJointInches / 2;

    // Calculate effective block volume including mortar joints on 4 faces (2 bed + 2 end joints)
    var blockVol = unit === 'metric' ? blockSize.volCum : blockSize.volCft;
    var jointThickness;
    if (unit === 'metric') {
      jointThickness = halfJointInches * 0.0254; // inches to meters
    } else {
      jointThickness = halfJointInches / 12; // inches to feet
    }

    // Effective block volume = blockVol × expansion factor from mortar joints
    // For a standard block, mortar adds ~jointThickness to width and length (4 of 6 faces)
    // Approximation: effectiveVol = blockVol × ((dim + joint) / dim)^2 for 2 dimensions
    // Simplified standard approach: effectiveVol = blockVol + (blockVol * mortarExpansionRatio)
    // Standard formula: effectiveBlockVol = (L + joint) × (H + joint) × W / (L × H × W) × blockVol
    // For 8"×4"×16" block with 0.25" joint: (16.25 × 8.25 × 4) / (16 × 8 × 4) = 1.047
    // General approximation using 2-face expansion:
    var expansionFactor = 1;
    if (blockSize.volCft > 0) {
      // Approximate block as a rectangular solid and add joint to length and height
      // Using cube-root approximation for equivalent dimension
      var dimApprox = unit === 'metric'
        ? Math.cbrt(blockSize.volCum)
        : Math.cbrt(blockSize.volCft);
      var dimWithJoint = dimApprox + jointThickness;
      // Mortar on 4 of 6 faces means joint added to 2 of 3 dimensions
      expansionFactor = Math.pow(dimWithJoint / dimApprox, 2);
    }

    var effectiveBlockVol = blockVol * expansionFactor;
    var blocks = Math.ceil(volume / effectiveBlockVol);

    // Mortar volume = total volume - (blocks × bare block volume)
    var mortarVolume = volume - (blocks * blockVol);
    if (mortarVolume < 0) mortarVolume = 0;

    // Dry mortar volume (wet → dry expansion)
    var mortarFactor = source.getMortarFactor();
    var factor = unit === 'metric' ? mortarFactor.metric : mortarFactor.imperial;
    var dryMortarVolume = mortarVolume * factor;

    // Split mortar by ratio
    var ratioSum = ratio[0] + ratio[1];
    var cementVolume = dryMortarVolume * (ratio[0] / ratioSum);
    var sandVolume = round2(dryMortarVolume * (ratio[1] / ratioSum));

    // Cement bags
    var bagVolume = source.getCementBagVolume(unit);
    var cementBags = round2(cementVolume / bagVolume);

    return {
      blocks: blocks,
      mortarVolume: round2(dryMortarVolume),
      cementBags: cementBags,
      sandVolume: sandVolume
    };
  }

  // ─── Concreting Calculation ──────────────────────────────────────────────

  /**
   * Compute concreting material estimates.
   *
   * @param {number} volume - Wet concrete volume (Cft or Cu.m)
   * @param {number[]} ratio - Mix ratio [cement, sand, crush] e.g. [1, 2, 4]
   * @param {string} unit - 'imperial' or 'metric'
   * @param {Object} [configSource] - Optional config source (snapshot adapter or Config)
   * @returns {Object} { dryVolume, cementBags, sandVolume, crushVolume }
   */
  function concreting(volume, ratio, unit, configSource) {
    var source = configSource || Config;
    var mortarFactor = source.getMortarFactor();
    var factor = unit === 'metric' ? mortarFactor.metric : mortarFactor.imperial;

    // Dry volume = wet volume * factor (accounts for void filling)
    var dryVolume = volume * factor;

    // Split by ratio
    var ratioSum = ratio[0] + ratio[1] + ratio[2];
    var cementVolume = dryVolume * (ratio[0] / ratioSum);
    var sandVolume = round2(dryVolume * (ratio[1] / ratioSum));
    var crushVolume = round2(dryVolume * (ratio[2] / ratioSum));

    // Cement bags
    var bagVolume = source.getCementBagVolume(unit);
    var cementBags = round2(cementVolume / bagVolume);

    return {
      dryVolume: round2(dryVolume),
      cementBags: cementBags,
      sandVolume: sandVolume,
      crushVolume: crushVolume
    };
  }

  // ─── Steel Calculation ───────────────────────────────────────────────────

  /**
   * Compute steel reinforcement estimates.
   *
   * @param {number} volume - Concrete volume (Cft or Cu.m)
   * @param {string} elementType - One of 'foundation', 'column', 'slab', 'stair', 'beam'
   * @param {string} unit - 'imperial' or 'metric'
   * @param {Object} [configSource] - Optional config source (snapshot adapter or Config)
   * @returns {Object} { steelPercentage, volumeCum, weightKg, weightTons }
   */
  function steel(volume, elementType, unit, configSource) {
    var source = configSource || Config;
    var steelPercentages = source.getSteelPercentages();
    var percentage = steelPercentages[elementType];
    var density = source.getConcreteDensity(); // kg/cu.m

    // Convert volume to cubic meters if imperial
    var volumeCum;
    if (unit === 'imperial') {
      volumeCum = volume * 0.0283168; // 1 cft = 0.0283168 cum
    } else {
      volumeCum = volume;
    }

    // Steel weight = volume (cu.m) * percentage * density (kg/cu.m)
    var weightKg = round2(volumeCum * percentage * density);
    var weightTons = round2(weightKg / 1000);

    return {
      steelPercentage: percentage,
      volumeCum: round2(volumeCum),
      weightKg: weightKg,
      weightTons: weightTons
    };
  }

  // ─── Plastering Calculation ──────────────────────────────────────────────

  /**
   * Compute plastering material estimates.
   *
   * @param {number} area - Plastering area (Sft or Sq.m)
   * @param {number} thicknessMm - Plaster thickness in millimeters
   * @param {number[]} ratio - Mix ratio [cement, sand] e.g. [1, 4]
   * @param {string} unit - 'imperial' or 'metric'
   * @param {Object} [configSource] - Optional config source (snapshot adapter or Config)
   * @returns {Object} { plasterVolume, dryVolume, cementBags, sandVolume }
   */
  function plastering(area, thicknessMm, ratio, unit, configSource) {
    var source = configSource || Config;
    var mortarFactor = source.getMortarFactor();
    var factor = unit === 'metric' ? mortarFactor.metric : mortarFactor.imperial;

    // Convert thickness from mm to the appropriate unit
    var plasterVolume;
    if (unit === 'metric') {
      // area in sq.m, thickness in mm → volume in cu.m
      plasterVolume = area * (thicknessMm / 1000);
    } else {
      // area in sft, thickness in mm → volume in cft
      // 1 mm = 0.00328084 ft
      plasterVolume = area * (thicknessMm * 0.00328084);
    }

    // Dry volume
    var dryVolume = plasterVolume * factor;

    // Split by ratio
    var ratioSum = ratio[0] + ratio[1];
    var cementVolume = dryVolume * (ratio[0] / ratioSum);
    var sandVolume = round2(dryVolume * (ratio[1] / ratioSum));

    // Cement bags
    var bagVolume = source.getCementBagVolume(unit);
    var cementBags = round2(cementVolume / bagVolume);

    return {
      plasterVolume: round2(plasterVolume),
      dryVolume: round2(dryVolume),
      cementBags: cementBags,
      sandVolume: sandVolume
    };
  }

  // ─── Tiling Calculation ──────────────────────────────────────────────────

  /**
   * Compute tiling estimates.
   *
   * @param {number} floorArea - Total floor area to tile
   * @param {number} tileArea - Area of a single tile (same unit as floorArea)
   * @param {Object} [configSource] - Optional config source (unused for tiling but kept for API consistency)
   * @returns {Object} { tileCount }
   */
  function tiling(floorArea, tileArea, configSource) {
    var source = configSource || Config;
    var tileCount = round2(floorArea / tileArea);
    return {
      tileCount: tileCount
    };
  }

  // ─── Labor Calculation ───────────────────────────────────────────────────

  /**
   * Compute labor estimates for a given category.
   *
   * @param {number} quantity - Work quantity (volume, area, or weight depending on category)
   * @param {string} category - One of 'masonry', 'concreting', 'plastering', 'tiling', 'steel'
   * @param {string} unit - 'imperial' or 'metric'
   * @param {Object} [configSource] - Optional config source (snapshot adapter or Config)
   * @returns {Object} { crew, ratePerDay, totalDays }
   */
  function labor(quantity, category, unit, configSource) {
    var source = configSource || Config;
    var laborRates = source.getLaborRates();
    var categoryRate = laborRates[category];

    if (!categoryRate) {
      return { crew: [], ratePerDay: 0, totalDays: 0 };
    }

    var crew = categoryRate.crew;
    var dailyRate;

    if (category === 'steel') {
      // Steel uses a single rate regardless of unit system (KG/day)
      dailyRate = categoryRate.rate;
    } else {
      // Other categories have imperial/metric rates
      dailyRate = unit === 'metric' ? categoryRate.metric.rate : categoryRate.imperial.rate;
    }

    var totalDays = round2(quantity / dailyRate);

    return {
      crew: crew,
      ratePerDay: dailyRate,
      totalDays: totalDays
    };
  }

  // ─── Custom Formula Evaluation ───────────────────────────────────────────

  /**
   * Evaluate custom formulas for a given category using FormulaEngine.
   *
   * @param {string} category - Calculation category (e.g. 'masonry', 'concreting')
   * @param {Object} variables - Variables to pass to formula evaluation
   * @param {Object} [configSource] - Optional config source (snapshot adapter or Config)
   * @returns {Array} Array of { name, value, error } results
   */
  function evaluateCustomFormulas(category, variables, configSource) {
    var source = configSource || Config;
    var customs = source.getCustomCalculations ? source.getCustomCalculations() : [];
    var categoryItems = customs.filter(function(c) { return c.category === category; });

    return categoryItems.map(function(item) {
      var result = FormulaEngine.evaluate(item.formula, variables);
      return { name: item.name, value: result.value, error: result.error };
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    masonry: masonry,
    concreting: concreting,
    steel: steel,
    plastering: plastering,
    tiling: tiling,
    labor: labor,
    round2: round2,
    wrapSnapshot: wrapSnapshot,
    evaluateCustomFormulas: evaluateCustomFormulas
  };
})();
