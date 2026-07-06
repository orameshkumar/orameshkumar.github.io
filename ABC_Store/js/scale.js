/**
 * scale.js - Scale Module for ABC Provisional Store
 *
 * Manages serial port connections to digital weighing machines via the Web Serial API.
 * Reads weight data streams, parses ASCII frames, detects stable weight readings,
 * and provides stable weight values to the billing system for auto-fill.
 *
 * Supports Essae, Phoenix, and TVS scales that transmit ASCII frames in the pattern:
 * [polarity][spaces][digits.decimals][space][unit][CR][LF]
 *
 * @requires Web Serial API (Chrome 89+ / Edge 89+)
 */

const Scale = (function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────

  /** @type {SerialPort|null} Active serial port reference */
  var port = null;

  /** @type {ReadableStreamDefaultReader|null} Active reader for the serial port */
  var reader = null;

  /** @type {string} Buffer for incoming partial frame data */
  var buffer = '';

  /** @type {number|null} Last successfully parsed weight in grams */
  var lastWeight = null;

  /** @type {number|null} Timestamp (ms) when stability window started */
  var stableStartTime = null;

  /** @type {boolean} Whether the serial port is currently connected */
  var isConnectedState = false;

  /** @type {boolean} Whether a stable weight has been emitted in the current weighing cycle */
  var stableEmitted = false;

  /** @type {Function|null} Callback invoked with grams when a stable weight is detected */
  var onStableWeightCb = null;

  /** @type {Function|null} Callback invoked with boolean when connection state changes */
  var onConnectionChangeCb = null;

  /** @type {Function|null} Callback invoked with current weight (grams) on each parsed frame */
  var onWeightUpdateCb = null;

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Tolerance in grams for stability detection */
  var STABILITY_TOLERANCE = 2;

  /** Duration in milliseconds for a reading to be classified as stable */
  var STABILITY_DURATION = 500;

  /** Weight threshold in grams below which the scale is considered at zero */
  var ZERO_THRESHOLD = 5;

  /** Regex for parsing weight data frames */
  var FRAME_REGEX = /^[+-]?\s*([\d.]+)\s*(kg|g)\s*$/i;

  // ─── Settings ───────────────────────────────────────────────────────────────

  /**
   * Read scale serial port settings from localStorage.
   * Falls back to safe defaults if settings are missing or corrupt.
   * @returns {{ baudRate: number, dataBits: number, stopBits: number, parity: string }}
   */
  function _getScaleSettings() {
    try {
      var raw = localStorage.getItem('abcstore_upi_settings');
      if (raw) {
        var settings = JSON.parse(raw);
        return {
          baudRate: settings.scaleBaudRate || 9600,
          dataBits: settings.scaleDataBits || 8,
          stopBits: settings.scaleStopBits || 1,
          parity: settings.scaleParity || 'none'
        };
      }
    } catch (e) {
      console.warn('Scale: Failed to read settings from localStorage', e);
    }
    return { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' };
  }

  // ─── Connection Management ──────────────────────────────────────────────────

  /**
   * Connect to a digital weighing scale via the Web Serial API.
   * Prompts the user to select a serial port and opens it with configured settings.
   * Begins continuous reading of weight data frames after connection.
   * @returns {Promise<void>}
   */
  async function connect() {
    if (isConnectedState) {
      console.warn('Scale: Already connected');
      return;
    }

    try {
      port = await navigator.serial.requestPort();
      var settings = _getScaleSettings();

      await port.open({
        baudRate: settings.baudRate,
        dataBits: settings.dataBits,
        stopBits: settings.stopBits,
        parity: settings.parity
      });

      isConnectedState = true;
      buffer = '';
      stableEmitted = false;
      stableStartTime = null;
      lastWeight = null;

      _notifyConnectionChange(true);
      _startReadLoop();

    } catch (e) {
      // User cancelled port selection or port open failed
      console.warn('Scale: Connection failed', e);
      isConnectedState = false;
      port = null;
    }
  }

  /**
   * Disconnect from the weighing scale.
   * Closes the serial port and releases the reader lock.
   * @returns {Promise<void>}
   */
  async function disconnect() {
    var wasConnected = isConnectedState;
    isConnectedState = false;

    try {
      if (reader) {
        await reader.cancel();
        reader.releaseLock();
        reader = null;
      }
    } catch (e) {
      console.warn('Scale: Error releasing reader', e);
      reader = null;
    }

    try {
      if (port) {
        await port.close();
        port = null;
      }
    } catch (e) {
      console.warn('Scale: Error closing port', e);
      port = null;
    }

    buffer = '';
    stableStartTime = null;

    if (wasConnected) {
      _notifyConnectionChange(false);
    }
  }

  // ─── Read Loop ──────────────────────────────────────────────────────────────

  /**
   * Start the continuous read loop for incoming serial data.
   * Reads chunks from the serial port, decodes them, appends to buffer,
   * and processes complete frames.
   * @private
   */
  async function _startReadLoop() {
    var decoder = new TextDecoder();

    try {
      reader = port.readable.getReader();

      while (isConnectedState) {
        var result = await reader.read();

        if (result.done) {
          // Stream closed
          break;
        }

        var chunk = decoder.decode(result.value, { stream: true });
        buffer += chunk;

        _processBuffer();
      }
    } catch (e) {
      console.warn('Scale: Read loop error (unexpected disconnection)', e);
    }

    // Handle unexpected disconnection
    if (isConnectedState) {
      isConnectedState = false;
      _notifyConnectionChange(false);
    }

    // Clean up
    try {
      if (reader) {
        reader.releaseLock();
        reader = null;
      }
    } catch (e) {
      reader = null;
    }
  }

  /**
   * Process the buffer by splitting on line endings.
   * Complete lines are parsed; incomplete tail remains in the buffer.
   * @private
   */
  function _processBuffer() {
    // Split on \r\n or \n
    var lines = buffer.split(/\r?\n/);

    // The last element is either empty (if buffer ended with newline) or an incomplete frame
    buffer = lines.pop() || '';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.length === 0) continue;

      var parsed = parseFrame(line);
      if (parsed) {
        lastWeight = parsed.grams;

        if (onWeightUpdateCb) {
          onWeightUpdateCb(parsed.grams);
        }

        _checkStability(parsed.grams);
      }
    }
  }

  // ─── Frame Parsing ──────────────────────────────────────────────────────────

  /**
   * Parse a single weight data frame string.
   * Extracts the numeric weight value and unit, converts to grams.
   *
   * Supported format: [polarity][spaces][digits.decimals][space][unit]
   * Examples: "+  1.250 kg", "-   450 g", "1.5 kg", "100 g"
   *
   * @param {string} frame - Raw ASCII frame string (without line endings)
   * @returns {{ grams: number, raw: string }|null} Parsed weight object or null for malformed frames
   */
  function parseFrame(frame) {
    if (!frame || typeof frame !== 'string') {
      return null;
    }

    var trimmed = frame.trim();
    if (trimmed.length === 0) {
      return null;
    }

    var match = FRAME_REGEX.exec(trimmed);
    if (!match) {
      return null;
    }

    var value = parseFloat(match[1]);
    var unit = match[2].toLowerCase();

    // Reject NaN, Infinity, or negative values from parseFloat
    if (!isFinite(value) || value < 0) {
      return null;
    }

    var grams;
    if (unit === 'kg') {
      grams = value * 1000;
    } else {
      // unit === 'g'
      grams = value;
    }

    return {
      grams: grams,
      raw: frame
    };
  }

  // ─── Stability Detection ────────────────────────────────────────────────────

  /**
   * Check if the current weight reading constitutes a stable measurement.
   * Stability is detected when consecutive readings remain within ±2g
   * tolerance for at least 500ms.
   *
   * After emitting a stable weight, further emissions are suppressed until
   * the scale returns to zero (below 5g threshold).
   *
   * @param {number} newWeight - Current weight reading in grams
   * @private
   */
  function _checkStability(newWeight) {
    // Zero-crossing reset: if weight drops below threshold, reset the cycle
    if (newWeight < ZERO_THRESHOLD) {
      stableEmitted = false;
      stableStartTime = null;
      lastWeight = newWeight;
      return;
    }

    // If stable weight already emitted this cycle, do nothing
    if (stableEmitted) {
      return;
    }

    var now = Date.now();

    if (lastWeight !== null && Math.abs(newWeight - lastWeight) <= STABILITY_TOLERANCE) {
      // Readings are within tolerance
      if (stableStartTime === null) {
        stableStartTime = now;
      } else if ((now - stableStartTime) >= STABILITY_DURATION) {
        // Stable for long enough — emit callback
        stableEmitted = true;

        if (onStableWeightCb) {
          onStableWeightCb(newWeight);
        }
      }
    } else {
      // Readings are fluctuating — reset stability tracking
      stableStartTime = null;
    }
  }

  // ─── Callbacks ──────────────────────────────────────────────────────────────

  /**
   * Notify connection change callback.
   * @param {boolean} connected - New connection state
   * @private
   */
  function _notifyConnectionChange(connected) {
    if (onConnectionChangeCb) {
      onConnectionChangeCb(connected);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    /**
     * Connect to a weighing scale via Web Serial API.
     * @returns {Promise<void>}
     */
    connect: connect,

    /**
     * Disconnect from the weighing scale.
     * @returns {Promise<void>}
     */
    disconnect: disconnect,

    /**
     * Check if the scale is currently connected.
     * @returns {boolean} True if connected
     */
    isConnected: function () {
      return isConnectedState;
    },

    /**
     * Get the last successfully parsed weight value.
     * @returns {number|null} Weight in grams, or null if no reading available
     */
    getLastWeight: function () {
      return lastWeight;
    },

    /**
     * Register a callback for stable weight detection.
     * The callback is invoked once per weighing cycle with the stable weight in grams.
     * @param {Function} cb - Callback function receiving (grams: number)
     */
    onStableWeight: function (cb) {
      onStableWeightCb = cb;
    },

    /**
     * Register a callback for connection state changes.
     * @param {Function} cb - Callback function receiving (connected: boolean)
     */
    onConnectionChange: function (cb) {
      onConnectionChangeCb = cb;
    },

    /**
     * Register a callback for weight updates on each parsed frame.
     * @param {Function} cb - Callback function receiving (grams: number)
     */
    onWeightUpdate: function (cb) {
      onWeightUpdateCb = cb;
    },

    /**
     * Parse a weight data frame string.
     * Exposed for testing and external use.
     * @param {string} frame - Raw ASCII frame string
     * @returns {{ grams: number, raw: string }|null} Parsed weight or null
     */
    parseFrame: parseFrame
  };

})();
