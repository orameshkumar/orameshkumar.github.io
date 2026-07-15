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
            // Generate pattern file data for AR.js from actual QR canvas pixels
            const patternData = generateMarkerPattern(canvas);

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
   * Generates AR.js pattern file data from a QR code canvas.
   * Reads actual pixel values from the canvas and produces a 16×16 grid
   * (3 channels × 4 rotations) that AR.js uses to identify the printed marker.
   *
   * @param {HTMLCanvasElement} qrCanvas - The rendered inner QR code canvas.
   * @returns {string} Pattern file content as a numeric matrix string.
   */
  function generateMarkerPattern(qrCanvas) {
    const ctx = qrCanvas.getContext('2d');
    const size = qrCanvas.width;
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    // Sample a PATTERN_SIZE × PATTERN_SIZE grid from the canvas.
    // Returns an array of PATTERN_SIZE*PATTERN_SIZE brightness values (0-255).
    function sampleGrid(rotation) {
      const values = [];
      for (let row = 0; row < PATTERN_SIZE; row++) {
        for (let col = 0; col < PATTERN_SIZE; col++) {
          // Apply rotation by transforming source coordinates
          let srcRow, srcCol;
          switch (rotation) {
            case 1: srcRow = PATTERN_SIZE - 1 - col; srcCol = row; break;
            case 2: srcRow = PATTERN_SIZE - 1 - row; srcCol = PATTERN_SIZE - 1 - col; break;
            case 3: srcRow = col; srcCol = PATTERN_SIZE - 1 - row; break;
            default: srcRow = row; srcCol = col;
          }

          // Map grid cell to pixel region
          const cellX = Math.floor(srcCol * size / PATTERN_SIZE);
          const cellY = Math.floor(srcRow * size / PATTERN_SIZE);
          const cellW = Math.max(1, Math.floor(size / PATTERN_SIZE));
          const cellH = Math.max(1, Math.floor(size / PATTERN_SIZE));

          // Average brightness over the region
          let sum = 0, count = 0;
          for (let py = cellY; py < Math.min(cellY + cellH, size); py++) {
            for (let px = cellX; px < Math.min(cellX + cellW, size); px++) {
              const idx = (py * size + px) * 4;
              sum += (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
              count++;
            }
          }
          values.push(count > 0 ? Math.round(sum / count) : 0);
        }
      }
      return values;
    }

    const lines = [];
    for (let rotation = 0; rotation < 4; rotation++) {
      const grid = sampleGrid(rotation);
      // Each of 3 channels is identical for B&W QR codes
      for (let channel = 0; channel < 3; channel++) {
        for (let row = 0; row < PATTERN_SIZE; row++) {
          const rowValues = [];
          for (let col = 0; col < PATTERN_SIZE; col++) {
            rowValues.push(String(grid[row * PATTERN_SIZE + col]).padStart(3, ' '));
          }
          lines.push(rowValues.join(' '));
        }
      }
      if (rotation < 3) lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generates a pattern data URL from a QR canvas for use as an AR.js marker pattern.
   * @param {HTMLCanvasElement} qrCanvas - The inner QR code canvas (no border).
   * @returns {string} Data URL of the .patt file content.
   */
  function generatePatternFromCanvas(qrCanvas) {
    const patternData = generateMarkerPattern(qrCanvas);
    return 'data:text/plain;base64,' + btoa(patternData);
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
    generatePatternFromCanvas,
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
