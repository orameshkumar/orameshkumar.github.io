/**
 * config.js - Configuration Manager for BuildCalc
 *
 * Manages configuration data with IndexedDB persistence and hardcoded defaults.
 * Provides getters and mutators for all configurable parameters used by CalcEngine.
 *
 * Dependencies: db.js
 */
'use strict';

const Config = (function () {
  // ─── Default Configuration Values ────────────────────────────────────────

  var DEFAULTS = {
    blockSizes: [
      { id: '8x4x16', label: '8"×4"×16"', volCft: 0.296, volCum: 0.00839 },
      { id: '8x8x16', label: '8"×8"×16"', volCft: 0.593, volCum: 0.01678 }
    ],
    laborRates: {
      masonry: {
        crew: [
          { role: 'Mason', count: 1 },
          { role: 'Helper', count: 1 }
        ],
        imperial: { rate: 40, unit: 'Cft/day' },
        metric: { rate: 1.15, unit: 'Cu.m/day' }
      },
      concreting: {
        crew: [
          { role: 'Mason', count: 1 },
          { role: 'Helper', count: 1 }
        ],
        imperial: { rate: 65, unit: 'Cft/day' },
        metric: { rate: 1.9, unit: 'Cu.m/day' }
      },
      plastering: {
        crew: [
          { role: 'Mason', count: 1 },
          { role: 'Helper', count: 1 }
        ],
        imperial: { rate: 90, unit: 'Sft/day' },
        metric: { rate: 9, unit: 'Sq.m/day' }
      },
      tiling: {
        crew: [
          { role: 'Tiler', count: 1 },
          { role: 'Helper', count: 1 }
        ],
        imperial: { rate: 45, unit: 'Sft/day' },
        metric: { rate: 4.5, unit: 'Sq.m/day' }
      },
      steel: {
        crew: [
          { role: 'Bar Bender', count: 1 },
          { role: 'Helper', count: 1 }
        ],
        rate: 125,
        unit: 'KG/day'
      }
    },
    steelPercentages: {
      foundation: 0.0065,
      column: 0.025,
      slab: 0.0085,
      stair: 0.0085,
      beam: 0.015
    },
    mortarFactor: { imperial: 1.33, metric: 1.33 },
    mortarJointThickness: 0.25, // inches (configurable)
    cementBagVolume: { cft: 1.25, cum: 0.035 },
    concreteDensity: 2400,
    customCalculations: [],
    photoSettings: { maxDimension: 1280, quality: 0.72 } // task photo compression
  };

  // ─── Private State ───────────────────────────────────────────────────────

  var config = null;

  // ─── Initialization ──────────────────────────────────────────────────────

  /**
   * Load config from IndexedDB. If none exists, seed with defaults and persist.
   * @returns {Promise<void>}
   */
  function init() {
    return DB.getConfig().then(function (stored) {
      if (stored) {
        config = stored;
      } else {
        config = JSON.parse(JSON.stringify(DEFAULTS));
        config.id = 'main';
        return DB.saveConfig(config);
      }
    });
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  /**
   * @returns {Array} Array of block size objects
   */
  function getBlockSizes() {
    return config.blockSizes;
  }

  /**
   * @returns {Object} Labor rates by category
   */
  function getLaborRates() {
    return config.laborRates;
  }

  /**
   * @returns {Object} Steel percentages by element type
   */
  function getSteelPercentages() {
    return config.steelPercentages;
  }

  /**
   * @returns {Object} Mortar factor { imperial, metric }
   */
  function getMortarFactor() {
    return config.mortarFactor;
  }

  /**
   * Get the mortar joint thickness in inches.
   * @returns {number} Joint thickness in inches (default 0.25)
   */
  function getMortarJointThickness() {
    return config.mortarJointThickness || 0.25;
  }

  /**
   * Get cement bag volume for the given unit system.
   * @param {string} unit - 'imperial' or 'metric'
   * @returns {number} Cement bag volume in Cft or Cu.m
   */
  function getCementBagVolume(unit) {
    if (unit === 'metric') {
      return config.cementBagVolume.cum;
    }
    return config.cementBagVolume.cft;
  }

  /**
   * @returns {number} Concrete density in kg/cu.m
   */
  function getConcreteDensity() {
    return config.concreteDensity;
  }

  /**
   * @returns {{maxDimension:number, quality:number}} Task photo compression settings
   */
  function getPhotoSettings() {
    return config.photoSettings || { maxDimension: 1280, quality: 0.72 };
  }

  // ─── Mutators (all persist to IndexedDB) ─────────────────────────────────

  /**
   * Replace all block sizes.
   * @param {Array} sizes - Array of BlockSize objects
   * @returns {Promise<void>}
   */
  function updateBlockSizes(sizes) {
    config.blockSizes = sizes;
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Add a single block size entry.
   * @param {Object} size - BlockSize object { id, label, volCft, volCum }
   * @returns {Promise<void>}
   */
  function addBlockSize(size) {
    config.blockSizes.push(size);
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Update an existing block size by id.
   * @param {string} id - Block size identifier
   * @param {Object} updatedSize - Fields to merge into existing block size
   * @returns {Promise<void>}
   */
  function updateBlockSize(id, updatedSize) {
    for (var i = 0; i < config.blockSizes.length; i++) {
      if (config.blockSizes[i].id === id) {
        var keys = Object.keys(updatedSize);
        for (var k = 0; k < keys.length; k++) {
          config.blockSizes[i][keys[k]] = updatedSize[keys[k]];
        }
        break;
      }
    }
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Delete a block size by id.
   * @param {string} id - Block size identifier
   * @returns {Promise<void>}
   */
  function deleteBlockSize(id) {
    config.blockSizes = config.blockSizes.filter(function (s) {
      return s.id !== id;
    });
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Replace all labor rates.
   * @param {Object} rates - Labor rates by category
   * @returns {Promise<void>}
   */
  function updateLaborRates(rates) {
    config.laborRates = rates;
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Add a labor rate for a category.
   * @param {string} category - Category name
   * @param {Object} rateObj - Labor rate object
   * @returns {Promise<void>}
   */
  function addLaborRate(category, rateObj) {
    config.laborRates[category] = rateObj;
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Update a labor rate for a category.
   * @param {string} category - Category name
   * @param {Object} rateObj - New labor rate object to overwrite
   * @returns {Promise<void>}
   */
  function updateLaborRate(category, rateObj) {
    config.laborRates[category] = rateObj;
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Delete a labor rate by category.
   * @param {string} category - Category name to remove
   * @returns {Promise<void>}
   */
  function deleteLaborRate(category) {
    delete config.laborRates[category];
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Replace all steel percentages.
   * @param {Object} percentages - Steel percentages by element type
   * @returns {Promise<void>}
   */
  function updateSteelPercentages(percentages) {
    config.steelPercentages = percentages;
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Add a steel percentage for an element type.
   * @param {string} elementType - Element type name
   * @param {number} percentage - Steel percentage factor
   * @returns {Promise<void>}
   */
  function addSteelPercentage(elementType, percentage) {
    config.steelPercentages[elementType] = percentage;
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Update a steel percentage for an element type.
   * @param {string} elementType - Element type name
   * @param {number} percentage - New steel percentage factor
   * @returns {Promise<void>}
   */
  function updateSteelPercentage(elementType, percentage) {
    config.steelPercentages[elementType] = percentage;
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Delete a steel percentage by element type.
   * @param {string} elementType - Element type name to remove
   * @returns {Promise<void>}
   */
  function deleteSteelPercentage(elementType) {
    delete config.steelPercentages[elementType];
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Replace mortar factor.
   * @param {Object} factor - { imperial, metric }
   * @returns {Promise<void>}
   */
  function updateMortarFactor(factor) {
    config.mortarFactor = factor;
    return DB.saveConfig(config).then(function () {});
  }

  // ─── Custom Calculations CRUD ────────────────────────────────────────────

  /**
   * Get all custom calculations.
   * @returns {Array} Array of custom calculation items
   */
  function getCustomCalculations() {
    return config.customCalculations || [];
  }

  /**
   * Add a custom calculation item.
   * @param {Object} item - { id, name, category, formula }
   * @returns {Promise<void>}
   */
  function addCustomCalculation(item) {
    if (!config.customCalculations) {
      config.customCalculations = [];
    }
    config.customCalculations.push(item);
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Update a custom calculation by id.
   * @param {string} id - Custom calculation identifier
   * @param {Object} item - Fields to merge into existing item
   * @returns {Promise<void>}
   */
  function updateCustomCalculation(id, item) {
    if (!config.customCalculations) {
      config.customCalculations = [];
    }
    for (var i = 0; i < config.customCalculations.length; i++) {
      if (config.customCalculations[i].id === id) {
        var keys = Object.keys(item);
        for (var k = 0; k < keys.length; k++) {
          config.customCalculations[i][keys[k]] = item[keys[k]];
        }
        break;
      }
    }
    return DB.saveConfig(config).then(function () {});
  }

  /**
   * Delete a custom calculation by id.
   * @param {string} id - Custom calculation identifier
   * @returns {Promise<void>}
   */
  function deleteCustomCalculation(id) {
    if (!config.customCalculations) {
      config.customCalculations = [];
    }
    config.customCalculations = config.customCalculations.filter(function (c) {
      return c.id !== id;
    });
    return DB.saveConfig(config).then(function () {});
  }

  // ─── Snapshot ────────────────────────────────────────────────────────────

  /**
   * Create a deep copy of the full config excluding the 'id' field.
   * Fills any missing fields from DEFAULTS to ensure completeness.
   * @returns {Object} Config snapshot
   */
  function createSnapshot() {
    var snapshot = JSON.parse(JSON.stringify(config));
    delete snapshot.id;
    // Fill missing fields from DEFAULTS
    if (!snapshot.blockSizes) {
      snapshot.blockSizes = DEFAULTS.blockSizes.slice();
    }
    if (!snapshot.laborRates) {
      snapshot.laborRates = JSON.parse(JSON.stringify(DEFAULTS.laborRates));
    }
    if (!snapshot.steelPercentages) {
      snapshot.steelPercentages = JSON.parse(JSON.stringify(DEFAULTS.steelPercentages));
    }
    if (!snapshot.mortarFactor) {
      snapshot.mortarFactor = JSON.parse(JSON.stringify(DEFAULTS.mortarFactor));
    }
    if (!snapshot.cementBagVolume) {
      snapshot.cementBagVolume = JSON.parse(JSON.stringify(DEFAULTS.cementBagVolume));
    }
    if (!snapshot.concreteDensity) {
      snapshot.concreteDensity = DEFAULTS.concreteDensity;
    }
    if (!snapshot.customCalculations) {
      snapshot.customCalculations = [];
    }
    return snapshot;
  }

  // ─── Bulk Operations ─────────────────────────────────────────────────────

  /**
   * Return the full configuration object.
   * @returns {Object} Complete config data
   */
  function getAll() {
    return config;
  }

  /**
   * Replace entire configuration (used during import).
   * @param {Object} newConfig - Complete config object to replace current
   * @returns {Promise<void>}
   */
  function replaceAll(newConfig) {
    newConfig.id = 'main';
    config = newConfig;
    return DB.saveConfig(config).then(function () {});
  }

  // ─── Public API ──────────────────────────────────────────────────────────

    /**
   * Update task photo compression settings.
   * @param {number} maxDimension - longest side in px after resize
   * @param {number} quality - JPEG quality 0-1
   * @returns {Promise<void>}
   */
  function setPhotoSettings(maxDimension, quality) {
    config.photoSettings = { maxDimension: maxDimension, quality: quality };
    return DB.saveConfig(config);
  }

return {
    init: init,
    getBlockSizes: getBlockSizes,
    getLaborRates: getLaborRates,
    getSteelPercentages: getSteelPercentages,
    getMortarFactor: getMortarFactor,
    getMortarJointThickness: getMortarJointThickness,
    getCementBagVolume: getCementBagVolume,
    getConcreteDensity: getConcreteDensity,
    getPhotoSettings: getPhotoSettings,
    setPhotoSettings: setPhotoSettings,

    // Block Size CRUD
    updateBlockSizes: updateBlockSizes,
    addBlockSize: addBlockSize,
    updateBlockSize: updateBlockSize,
    deleteBlockSize: deleteBlockSize,

    // Labor Rate CRUD
    updateLaborRates: updateLaborRates,
    addLaborRate: addLaborRate,
    updateLaborRate: updateLaborRate,
    deleteLaborRate: deleteLaborRate,

    // Steel Percentage CRUD
    updateSteelPercentages: updateSteelPercentages,
    addSteelPercentage: addSteelPercentage,
    updateSteelPercentage: updateSteelPercentage,
    deleteSteelPercentage: deleteSteelPercentage,

    // Mortar Factor
    updateMortarFactor: updateMortarFactor,

    // Custom Calculations CRUD
    getCustomCalculations: getCustomCalculations,
    addCustomCalculation: addCustomCalculation,
    updateCustomCalculation: updateCustomCalculation,
    deleteCustomCalculation: deleteCustomCalculation,

    // Snapshot
    createSnapshot: createSnapshot,

    // Bulk
    getAll: getAll,
    replaceAll: replaceAll
  };
})();
