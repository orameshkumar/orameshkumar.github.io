// Minimal, self-contained QR code encoder. No CDN, no external dependency.
// Vendored locally after repeated CDN-based QR library failures in this project
// (export-shape mismatches, script-load races, 404s). This is a compact
// implementation of the standard QR encoding algorithm (Reed-Solomon error
// correction + standard mask pattern selection), released as a single
// dependency-free ES module: generateQR(text, options) -> { matrix, size }.

// --- Galois Field math for Reed-Solomon error correction ---
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const generator = rsGeneratorPoly(ecCount);
  const result = data.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coeff = result[i];
    if (coeff !== 0) {
      for (let j = 0; j < generator.length; j++) {
        result[i + j] ^= gfMul(generator[j], coeff);
      }
    }
  }
  return result.slice(data.length);
}

// Total DATA codewords (not including EC codewords) per version (1-10) and EC level.
// This table was previously wrong (had byte-character-capacity-like values instead
// of actual codeword counts), which produced structurally invalid QR codes that
// looked plausible but failed every real decode test. Verified against the
// canonical QR specification (ISO/IEC 18004 Table 7).
const BYTE_CAPACITY = [
  null,
  { L: 19, M: 16, Q: 13, H: 9 },
  { L: 34, M: 28, Q: 22, H: 16 },
  { L: 55, M: 44, Q: 34, H: 26 },
  { L: 80, M: 64, Q: 48, H: 36 },
  { L: 108, M: 86, Q: 62, H: 46 },
  { L: 136, M: 108, Q: 76, H: 60 },
  { L: 156, M: 124, Q: 88, H: 66 },
  { L: 194, M: 154, Q: 110, H: 86 },
  { L: 232, M: 182, Q: 132, H: 100 },
  { L: 274, M: 216, Q: 154, H: 122 },
];

// [ecCodewordsPerBlock, numBlocks] per version + level
const EC_BLOCK_INFO = {
  1: { L: [7, 1], M: [10, 1], Q: [13, 1], H: [17, 1] },
  2: { L: [10, 1], M: [16, 1], Q: [22, 1], H: [28, 1] },
  3: { L: [15, 1], M: [26, 1], Q: [18, 2], H: [22, 2] },
  4: { L: [20, 1], M: [18, 2], Q: [26, 2], H: [16, 4] },
  5: { L: [26, 1], M: [24, 2], Q: [18, 4], H: [22, 4] },
  6: { L: [18, 2], M: [16, 4], Q: [24, 4], H: [28, 4] },
  7: { L: [20, 2], M: [18, 4], Q: [18, 6], H: [26, 5] },
  8: { L: [24, 2], M: [22, 4], Q: [22, 6], H: [26, 6] },
  9: { L: [30, 2], M: [22, 5], Q: [20, 8], H: [24, 8] },
  10: { L: [18, 4], M: [26, 5], Q: [24, 8], H: [28, 8] },
};

function pickVersion(dataLength, level) {
  // Byte mode overhead: 4 bits mode indicator + 8 bits count (for versions 1-9) + 4 bits terminator = 16 bits = 2 bytes,
  // so usable byte capacity is (totalDataCodewords - 2), with some slack since the terminator can be absorbed by padding.
  for (let v = 1; v <= 10; v++) {
    const usableBytes = BYTE_CAPACITY[v][level] - 2;
    if (dataLength <= usableBytes) return v;
  }
  throw new Error(`Data too long for this encoder (max ~${BYTE_CAPACITY[10][level] - 2} bytes at level ${level}). Shorten the input.`);
}

function buildDataCodewords(text, version, level) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const totalCapacity = BYTE_CAPACITY[version][level];
  const bits = [];
  const pushBits = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };

  pushBits(0b0100, 4); // byte mode indicator
  const countBits = version <= 9 ? 8 : 16;
  pushBits(bytes.length, countBits);
  for (const b of bytes) pushBits(b, 8);

  pushBits(0, 4); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const padBytes = [0xec, 0x11];
  let p = 0;
  while (codewords.length < totalCapacity) {
    codewords.push(padBytes[p % 2]);
    p++;
  }
  return codewords;
}

function interleaveWithEC(dataCodewords, version, level) {
  const [ecPerBlock, numBlocks] = EC_BLOCK_INFO[version][level];
  const totalData = dataCodewords.length;
  const baseBlockSize = Math.floor(totalData / numBlocks);
  const numLongBlocks = totalData % numBlocks;

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const size = baseBlockSize + (i < numLongBlocks ? 1 : 0);
    blocks.push(dataCodewords.slice(offset, offset + size));
    offset += size;
  }

  const ecBlocks = blocks.map((b) => rsEncode(b, ecPerBlock));

  const result = [];
  const maxBlockLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (const b of blocks) if (i < b.length) result.push(b[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const eb of ecBlocks) result.push(eb[i]);
  }
  return result;
}

// Exact alignment pattern center positions per version (verified against the
// reference implementation's pattern_position() — versions 7+ have THREE
// positions per dimension, producing multiple alignment patterns, not just one;
// my original code only ever placed a single centered pattern, which was wrong
// for any version 7 and above).
const ALIGNMENT_POSITIONS = {
  1: [],
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function moduleCount(version) { return version * 4 + 17; }

function placeFinderPattern(matrix, r0, c0) {
  const n = matrix.length;
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const isDark =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      matrix[rr][cc] = isDark ? 1 : 0;
    }
  }
}

function placeAlignmentPattern(matrix, r0, c0) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isDark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      matrix[r0 + r][c0 + c] = isDark ? 1 : 0;
    }
  }
}

function placeTimingPatterns(matrix, n) {
  for (let i = 8; i < n - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }
}

// Format info bit strings, precomputed per the QR specification (ISO/IEC 18004 Annex C)
// for each EC level + mask pattern combination. Using a verified lookup table instead
// of computing the BCH(15,5) remainder at runtime eliminates an entire class of
// polynomial-division edge-case bugs (a runtime version of this had a real bug for
// mask patterns 6 and 7 — caught only by actually decoding test output, not by reading
// the code, which is exactly why a fixed table is safer here).
const FORMAT_INFO_TABLE = {
  L: [0b111011111000100, 0b111001011110011, 0b111110110101000, 0b111100010011111,
      0b110011000101111, 0b110001100011000, 0b110110001000011, 0b110100101110100],
  M: [0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011,
      0b100010111111001, 0b100000011001110, 0b100111110100111, 0b100101010010001],
  Q: [0b011010101011111, 0b011000001101000, 0b011111100110001, 0b011101000000110,
      0b010010010110110, 0b010000110000001, 0b010111011011010, 0b010101111101101],
  H: [0b001011010001001, 0b001001110111110, 0b001110011100101, 0b001100111010010,
      0b000011101100010, 0b000001001010101, 0b000110100001110, 0b000100000111001],
};

function placeFormatInfo(matrix, n, level, maskPattern) {
  const formatBits = FORMAT_INFO_TABLE[level][maskPattern];
  const bit = (i) => (formatBits >> i) & 1;

  // Exact port of the reference implementation's setup_type_info — my original
  // hand-derived version of this mapping had subtle off-by-one errors that
  // shifted several format-info cells, which in turn misaligned the isReserved
  // mask used during data placement, corrupting nearby data bits. Porting the
  // exact index arithmetic (rather than re-deriving it from the spec diagram)
  // removes that entire risk.
  for (let i = 0; i < 15; i++) {
    const mod = bit(i);
    if (i < 6) matrix[i][8] = mod;
    else if (i < 8) matrix[i + 1][8] = mod;
    else matrix[n - 15 + i][8] = mod;
  }
  for (let i = 0; i < 15; i++) {
    const mod = bit(i);
    if (i < 8) matrix[8][n - i - 1] = mod;
    else if (i < 9) matrix[8][15 - i - 1 + 1] = mod;
    else matrix[8][15 - i - 1] = mod;
  }
}

function applyMask(matrix, mask, n, isReserved) {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isReserved[r][c]) continue;
      let invert;
      switch (mask) {
        case 0: invert = (r + c) % 2 === 0; break;
        case 1: invert = r % 2 === 0; break;
        case 2: invert = c % 3 === 0; break;
        case 3: invert = (r + c) % 3 === 0; break;
        case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
        case 5: invert = ((r * c) % 2) + ((r * c) % 3) === 0; break;
        case 6: invert = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        case 7: invert = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
      }
      if (invert) matrix[r][c] ^= 1;
    }
  }
}

function maskPenalty(matrix, n) {
  let penalty = 0;
  for (let r = 0; r < n; r++) {
    let runColor = matrix[r][0], runLen = 1;
    for (let c = 1; c < n; c++) {
      if (matrix[r][c] === runColor) { runLen++; }
      else { if (runLen >= 5) penalty += 3 + (runLen - 5); runColor = matrix[r][c]; runLen = 1; }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  for (let c = 0; c < n; c++) {
    let runColor = matrix[0][c], runLen = 1;
    for (let r = 1; r < n; r++) {
      if (matrix[r][c] === runColor) { runLen++; }
      else { if (runLen >= 5) penalty += 3 + (runLen - 5); runColor = matrix[r][c]; runLen = 1; }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += matrix[r][c];
  const ratio = Math.abs((dark * 100) / (n * n) - 50) / 5;
  penalty += Math.floor(ratio) * 10;
  return penalty;
}

/**
 * Generates a QR code matrix for the given text.
 * @param {string} text - data to encode (byte mode; ASCII/UTF-8 safe)
 * @param {{errorCorrectionLevel?: 'L'|'M'|'Q'|'H'}} options
 * @returns {{matrix: number[][], size: number}}
 */
export function generateQR(text, options = {}) {
  const level = options.errorCorrectionLevel || "M";
  const version = pickVersion(new TextEncoder().encode(text).length, level);
  const dataCodewords = buildDataCodewords(text, version, level);
  const finalCodewords = interleaveWithEC(dataCodewords, version, level);

  const n = moduleCount(version);
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const isReserved = Array.from({ length: n }, () => new Array(n).fill(false));

  const markReserved = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n) isReserved[rr][cc] = true;
    }
  };

  placeFinderPattern(matrix, 0, 0);
  placeFinderPattern(matrix, 0, n - 7);
  placeFinderPattern(matrix, n - 7, 0);
  markReserved(0, 0);
  markReserved(0, n - 7);
  markReserved(n - 7, 0);

  placeTimingPatterns(matrix, n);
  for (let i = 8; i < n - 8; i++) { isReserved[6][i] = true; isReserved[i][6] = true; }

  if (version >= 2) {
    const positions = ALIGNMENT_POSITIONS[version];
    for (const row of positions) {
      for (const col of positions) {
        // Skip any position that overlaps a finder pattern (top-left, top-right, bottom-left) —
        // matches the reference implementation's "already placed" guard.
        if (isReserved[row] && isReserved[row][col]) continue;
        placeAlignmentPattern(matrix, row, col);
        for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) isReserved[row + r][col + c] = true;
      }
    }
  }

  // Reserve exactly the cells that placeFormatInfo() will write to (same index
  // formulas, kept in lockstep deliberately rather than re-deriving a separate
  // reservation pattern that could drift out of sync with the actual placement).
  for (let i = 0; i < 15; i++) {
    if (i < 6) isReserved[i][8] = true;
    else if (i < 8) isReserved[i + 1][8] = true;
    else isReserved[n - 15 + i][8] = true;
  }
  for (let i = 0; i < 15; i++) {
    if (i < 8) isReserved[8][n - i - 1] = true;
    else if (i < 9) isReserved[8][15 - i - 1 + 1] = true;
    else isReserved[8][15 - i - 1] = true;
  }
  isReserved[n - 8][8] = true;
  matrix[n - 8][8] = 1; // the "dark module" — always black, per spec; previously only reserved, never actually set

  let bitIndex = 0;
  let bitInByte = 7;
  let dir = -1;
  let row = n - 1;

  for (let col = n - 1; col > 0; col -= 2) {
    let pairCol = col;
    if (pairCol <= 6) pairCol -= 1;

    while (true) {
      for (const c of [pairCol, pairCol - 1]) {
        if (!isReserved[row][c]) {
          const cw = bitIndex < finalCodewords.length ? finalCodewords[bitIndex] : 0;
          const bit = (cw >> bitInByte) & 1;
          matrix[row][c] = bit;
          bitInByte -= 1;
          if (bitInByte === -1) { bitIndex += 1; bitInByte = 7; }
        }
      }
      row += dir;
      if (row < 0 || row >= n) {
        row -= dir;
        dir = -dir;
        break;
      }
    }
  }

  let bestPenalty = Infinity, bestMatrix = null;
  for (let mask = 0; mask < 8; mask++) {
    const trial = matrix.map((row) => row.slice());
    applyMask(trial, mask, n, isReserved);
    placeFormatInfo(trial, n, level, mask);
    const penalty = maskPenalty(trial, n);
    if (penalty < bestPenalty) { bestPenalty = penalty; bestMatrix = trial; }
  }

  return { matrix: bestMatrix, size: n };
}
