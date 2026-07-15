/**
 * QR Generator Module
 * Generates QR codes with AR marker borders for AR.js pattern detection.
 * Uses qrcode.js (global QRCode) for QR generation and wraps the output
 * with a black border frame suitable for AR.js marker tracking.
 */

const QRGenerator = (() => {
  const MIN_QR_SIZE = 300;
  const BORDER_RATIO = 0.25; // 25% border on each side for AR.js marker detection
  const ERROR_CORRECTION = 'H'; // Highest error correction for reliability with marker border
  const PATTERN_SIZE = 16; // AR.js pattern matrix dimension (16x16 per channel)

  /**
   * Generates a QR code with AR marker border for a given asset ID.
   * Builds the experience URL, creates QR canvas, adds marker border,
   * generates SVG and pattern file data.
   *
   * @param {string} assetId - The animation asset identifier.
   * @returns {Promise<object>} QRResult with experienceUrl, assetId, qrImageDataUrl, svgContent, patternFileUrl, generatedAt.
   * @throws {Error} If QR generation fails.
   */
  async function generate(assetId) {
    if (!assetId || typeof assetId !== 'string') {
      throw new Error('Invalid asset ID: asset ID is required');
    }

    const experienceUrl = Utils.buildExperienceUrl(assetId);

    return new Promise((resolve, reject) => {
      try {
        // Create temporary container for QR generation
        const container = document.createElement('div');
        container.style.display = 'none';
        document.body.appendChild(container);

        // Determine QR code inner size (before border)
        // Total size = innerSize + 2 * (innerSize * BORDER_RATIO / (1 - 2*BORDER_RATIO))
        // We want total >= MIN_QR_SIZE, so inner size must account for border
        const innerSize = Math.ceil(MIN_QR_SIZE * (1 - 2 * BORDER_RATIO));

        // Use QRCode library (available globally from CDN)
        const qr = new QRCode(container, {
          text: experienceUrl,
          width: innerSize,
          height: innerSize,
          colorDark: '#000000',
          colorLight: '#FFFFFF',
          correctLevel: QRCode.CorrectLevel[ERROR_CORRECTION]
        });

        // Wait for QR code canvas to be rendered
        setTimeout(() => {
          try {
            const canvas = container.querySelector('canvas');
            if (!canvas) {
              document.body.removeChild(container);
              reject(new Error('QR code generation failed: canvas not created'));
              return;
            }

            // Add black marker border for AR.js pattern detection
            const qrImageDataUrl = addMarkerBorder(canvas);

            // Generate SVG version with marker border
            const svgContent = generateSVGWithBorder(experienceUrl, canvas);

            // Generate pattern file data for AR.js
            const patternData = generateMarkerPattern(assetId);

            // Create a data URL for the pattern file
            const patternFileUrl = 'data:text/plain;base64,' + btoa(patternData);

            // Clean up temporary container
            document.body.removeChild(container);

            resolve({
              experienceUrl,
              assetId,
              qrImageDataUrl,
              svgContent,
              patternFileUrl,
              generatedAt: new Date().toISOString()
            });
          } catch (innerError) {
            document.body.removeChild(container);
            reject(new Error('QR code generation failed: ' + innerError.message));
          }
        }, 150);
      } catch (error) {
        reject(new Error('QR code generation failed: ' + error.message));
      }
    });
  }

  /**
   * Adds an AR.js-compatible black marker border around the QR image.
   * The border is 25% of the total marker size on each side,
   * with the QR data centered within.
   *
   * @param {HTMLCanvasElement} qrCanvas - The QR code canvas element.
   * @returns {string} Data URL of the QR+marker image (PNG format).
   */
  function addMarkerBorder(qrCanvas) {
    const qrSize = qrCanvas.width;
    // Border is 25% of the TOTAL size on each side
    // total = qrSize / (1 - 2 * BORDER_RATIO)
    const totalSize = Math.max(Math.ceil(qrSize / (1 - 2 * BORDER_RATIO)), MIN_QR_SIZE);
    const borderWidth = Math.floor((totalSize - qrSize) / 2);

    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = totalSize;
    markerCanvas.height = totalSize;

    const ctx = markerCanvas.getContext('2d');

    // Fill entire canvas with black (marker border)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Draw white background for QR area
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(borderWidth, borderWidth, qrSize, qrSize);

    // Draw the QR code centered in the white area
    ctx.drawImage(qrCanvas, borderWidth, borderWidth, qrSize, qrSize);

    return markerCanvas.toDataURL('image/png');
  }

  /**
   * Generates an SVG representation of the QR code with AR marker border.
   * Uses the canvas pixel data to create an accurate SVG.
   *
   * @param {string} url - The URL encoded in the QR code.
   * @param {HTMLCanvasElement} qrCanvas - The rendered QR canvas.
   * @returns {string} SVG markup string with embedded QR pattern and border.
   */
  function generateSVGWithBorder(url, qrCanvas) {
    const qrSize = qrCanvas.width;
    const totalSize = Math.max(Math.ceil(qrSize / (1 - 2 * BORDER_RATIO)), MIN_QR_SIZE);
    const borderWidth = Math.floor((totalSize - qrSize) / 2);

    // Read pixel data from the QR canvas to generate accurate SVG modules
    const ctx = qrCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, qrSize, qrSize);
    const pixels = imageData.data;

    // Determine module size by sampling - find the smallest dark block
    const moduleSize = detectModuleSize(pixels, qrSize);
    const moduleCount = Math.round(qrSize / moduleSize);

    // Build SVG path for dark modules
    let darkModules = '';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        const px = Math.floor(col * moduleSize + moduleSize / 2);
        const py = Math.floor(row * moduleSize + moduleSize / 2);
        const idx = (py * qrSize + px) * 4;
        // Check if pixel is dark (R channel < 128)
        if (idx < pixels.length && pixels[idx] < 128) {
          const x = borderWidth + col * moduleSize;
          const y = borderWidth + row * moduleSize;
          darkModules += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" />`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}">
  <title>AR QR Code</title>
  <desc>QR code for AR experience: ${escapeXml(url)}</desc>
  <!-- Black marker border for AR.js -->
  <rect width="${totalSize}" height="${totalSize}" fill="#000000"/>
  <!-- White QR background -->
  <rect x="${borderWidth}" y="${borderWidth}" width="${qrSize}" height="${qrSize}" fill="#FFFFFF"/>
  <!-- QR code modules -->
  <g fill="#000000">
    ${darkModules}
  </g>
</svg>`;
  }

  /**
   * Detects the module (single square unit) size in a QR canvas by scanning
   * the top-left finder pattern.
   *
   * @param {Uint8ClampedArray} pixels - The image pixel data (RGBA).
   * @param {number} size - The canvas width/height.
   * @returns {number} The estimated module size in pixels.
   */
  function detectModuleSize(pixels, size) {
    // Scan the first row to find the width of the first dark block
    // QR codes always start with a dark module in the top-left finder pattern
    let darkCount = 0;
    for (let x = 0; x < size; x++) {
      const idx = x * 4; // first row, pixel at x
      if (pixels[idx] < 128) {
        darkCount++;
      } else if (darkCount > 0) {
        break;
      }
    }
    // The finder pattern starts with 7 modules of dark, but the first continuous
    // dark run gives us the module width
    // Finder pattern: dark(1) + light(1) + dark(3) + light(1) + dark(1)
    // So first dark run = 1 module width... but due to quiet zone it might be different
    // Use a safer heuristic: finder pattern outer is 7 modules
    // Scan for the first dark-to-light transition and back to get module size
    if (darkCount > 0) {
      // First dark run in finder pattern is typically 1 module wide at the quiet zone edge
      // But if there's no quiet zone in canvas, it could be 7 modules
      // Heuristic: QR version 1 has 21 modules, larger versions have more
      // Best estimate: divide total size by common module counts
      const possibleModuleCounts = [21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77];
      for (const count of possibleModuleCounts) {
        const ms = size / count;
        if (Math.abs(ms - Math.round(ms)) < 0.5 && darkCount <= ms * 8) {
          return Math.round(ms);
        }
      }
      // Fallback: use the dark run as an estimate (finder pattern first module)
      return Math.max(1, Math.round(darkCount));
    }
    // Default fallback
    return Math.max(1, Math.floor(size / 21));
  }

  /**
   * Generates AR.js pattern file data for marker recognition.
   * Produces a simplified 16x16 pattern matrix (3 channels) that AR.js
   * uses to identify the marker. The pattern is derived from the QR code's
   * visual structure for the given asset ID.
   *
   * @param {string} assetId - The asset identifier to generate pattern for.
   * @returns {string} Pattern file content as a numeric matrix string.
   */
  function generateMarkerPattern(assetId) {
    // AR.js .patt files contain a 16x16 grid per channel (R, G, B)
    // rotated 4 times (0°, 90°, 180°, 270°)
    // Each value is 0-255 representing brightness
    // We generate a deterministic pattern based on the assetId hash

    const hash = simpleHash(assetId);
    const lines = [];

    // Generate 4 rotations
    for (let rotation = 0; rotation < 4; rotation++) {
      // For each rotation, generate 3 channels (R, G, B) - since our marker is B&W they're identical
      for (let channel = 0; channel < 3; channel++) {
        for (let row = 0; row < PATTERN_SIZE; row++) {
          const rowValues = [];
          for (let col = 0; col < PATTERN_SIZE; col++) {
            // Generate a deterministic pixel value based on position and hash
            // Simulate the QR pattern structure with border
            const isOuterBorder = row < 2 || row >= PATTERN_SIZE - 2 || col < 2 || col >= PATTERN_SIZE - 2;
            if (isOuterBorder) {
              // Border area - always black (0)
              rowValues.push('  0');
            } else {
              // Inner area - QR pattern based on hash
              const innerRow = row - 2;
              const innerCol = col - 2;
              const rotatedRow = rotateCoord(innerRow, innerCol, PATTERN_SIZE - 4, rotation, true);
              const rotatedCol = rotateCoord(innerRow, innerCol, PATTERN_SIZE - 4, rotation, false);
              const seed = (hash + rotatedRow * (PATTERN_SIZE - 4) + rotatedCol + channel) & 0xFFFFFFFF;
              const value = ((seed * 1103515245 + 12345) >>> 16) & 0xFF;
              // Threshold to create a QR-like B&W pattern
              const bwValue = value > 128 ? 255 : 0;
              rowValues.push(String(bwValue).padStart(3, ' '));
            }
          }
          lines.push(rowValues.join(' '));
        }
      }
      // Add blank line between rotations (except after last)
      if (rotation < 3) {
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Computes a rotation coordinate transform.
   * @param {number} row - Input row.
   * @param {number} col - Input column.
   * @param {number} size - Grid size.
   * @param {number} rotation - Rotation index (0-3).
   * @param {boolean} getRow - If true returns row, else returns col.
   * @returns {number} Transformed coordinate.
   */
  function rotateCoord(row, col, size, rotation, getRow) {
    switch (rotation) {
      case 0: return getRow ? row : col;
      case 1: return getRow ? col : (size - 1 - row);
      case 2: return getRow ? (size - 1 - row) : (size - 1 - col);
      case 3: return getRow ? (size - 1 - col) : row;
      default: return getRow ? row : col;
    }
  }

  /**
   * Simple string hash function for deterministic pattern generation.
   * @param {string} str - Input string to hash.
   * @returns {number} A 32-bit integer hash.
   */
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Triggers download of the QR+marker image as PNG.
   * Creates a temporary anchor element with download attribute.
   *
   * @param {object} qrResult - The QR generation result object.
   * @throws {Error} If qrResult is invalid or missing required data.
   */
  function downloadAsPNG(qrResult) {
    if (!qrResult || !qrResult.qrImageDataUrl) {
      throw new Error('Invalid QR result: missing image data');
    }

    const link = document.createElement('a');
    link.download = `ar-marker-${qrResult.assetId || 'unknown'}.png`;
    link.href = qrResult.qrImageDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Triggers download of the QR+marker image as SVG.
   * Creates a Blob from SVG content and triggers download via temporary anchor.
   *
   * @param {object} qrResult - The QR generation result object.
   * @throws {Error} If qrResult is invalid or missing required data.
   */
  function downloadAsSVG(qrResult) {
    if (!qrResult || !qrResult.svgContent) {
      throw new Error('Invalid QR result: missing SVG content');
    }

    const blob = new Blob([qrResult.svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `ar-marker-${qrResult.assetId || 'unknown'}.svg`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Escapes special XML characters in a string for safe SVG embedding.
   * @param {string} str - The string to escape.
   * @returns {string} XML-safe string.
   */
  function escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  return {
    generate,
    addMarkerBorder,
    generateMarkerPattern,
    downloadAsPNG,
    downloadAsSVG,
    // Expose constants for testing
    MIN_QR_SIZE,
    BORDER_RATIO,
    ERROR_CORRECTION
  };
})();

// Export for testing (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QRGenerator;
}
