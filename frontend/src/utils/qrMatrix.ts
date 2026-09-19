/**
 * Pure TypeScript QR Code Matrix Generator (Model 2, Byte Mode, ECC Level M/L)
 * Zero external dependencies. Generates a 2D boolean matrix [row][col] (true = black module, false = white).
 */

// Galois Field 256 for Reed-Solomon error correction
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(function initGF256() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  GF256_LOG[0] = 0;
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], factor);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsComputeECC(data: Uint8Array, eccLen: number): Uint8Array {
  const gen = rsGeneratorPoly(eccLen);
  const remainder = new Uint8Array(eccLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[eccLen - 1] = 0;
    for (let j = 0; j < eccLen; j++) {
      remainder[j] ^= gfMul(gen[j], factor);
    }
  }
  return remainder;
}

// Table of QR versions: total data codewords and ecc codewords for Level L
// [version, totalCodewords, dataCodewords, eccCodewords]
interface QRVersionSpec {
  version: number;
  size: number;
  totalCodewords: number;
  dataCodewords: number;
  eccCodewords: number;
  alignments: number[];
}

const QR_SPECS: QRVersionSpec[] = [
  { version: 1, size: 21, totalCodewords: 26, dataCodewords: 19, eccCodewords: 7, alignments: [] },
  { version: 2, size: 25, totalCodewords: 44, dataCodewords: 34, eccCodewords: 10, alignments: [6, 18] },
  { version: 3, size: 29, totalCodewords: 70, dataCodewords: 55, eccCodewords: 15, alignments: [6, 22] },
  { version: 4, size: 33, totalCodewords: 100, dataCodewords: 80, eccCodewords: 20, alignments: [6, 26] },
  { version: 5, size: 37, totalCodewords: 134, dataCodewords: 108, eccCodewords: 26, alignments: [6, 30] },
  { version: 6, size: 41, totalCodewords: 172, dataCodewords: 136, eccCodewords: 36, alignments: [6, 34] },
];

export function generateQRMatrix(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const dataLen = utf8Bytes.length;

  // Pick suitable QR version
  let spec = QR_SPECS.find((s) => s.dataCodewords >= dataLen + 3);
  if (!spec) {
    spec = QR_SPECS[QR_SPECS.length - 1]; // Fallback to max supported version
  }

  const { size, dataCodewords, eccCodewords } = spec;

  // Build bit stream: 4-bit mode (0100 for Byte mode), 8-bit character count
  const bitStream: number[] = [];
  function pushBits(val: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(Math.min(dataLen, spec.dataCodewords - 3), 8); // Character count indicator

  for (let i = 0; i < dataLen && bitStream.length + 8 <= dataCodewords * 8 - 4; i++) {
    pushBits(utf8Bytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const termBits = Math.min(4, dataCodewords * 8 - bitStream.length);
  pushBits(0, termBits);

  // Pad to byte boundary
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // Pad codewords (0xEC, 0x11 alternating)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < dataCodewords * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bitStream to byte array
  const dataBytes = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitStream[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // Compute Reed-Solomon ECC
  const eccBytes = rsComputeECC(dataBytes, eccCodewords);

  // Combine data + ECC
  const finalCodewords = new Uint8Array(dataCodewords + eccCodewords);
  finalCodewords.set(dataBytes, 0);
  finalCodewords.set(eccBytes, dataCodewords);

  // Initialize QR Matrix and reserved map
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setModule(r: number, c: number, val: boolean, isRes = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (isRes) reserved[r][c] = true;
    }
  }

  // 1. Finder Patterns (7x7 with 1px white border)
  function drawFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            setModule(nr, nc, true);
          } else {
            setModule(nr, nc, false);
          }
        } else {
          setModule(nr, nc, false);
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // 3. Dark module (fixed)
  setModule(size - 8, 8, true);

  // 4. Alignment Patterns (if any)
  if (spec.alignments.length > 0) {
    const coords = spec.alignments;
    for (const r of coords) {
      for (const c of coords) {
        if (reserved[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter);
          }
        }
      }
    }
  }

  // Reserve format info areas (around finders)
  for (let i = 0; i <= 8; i++) {
    setModule(8, i, false, true);
    setModule(i, 8, false, true);
    setModule(8, size - 1 - i, false, true);
    setModule(size - 1 - i, 8, false, true);
  }

  // 5. Place Data bits (zigzag in pairs of columns from right to left)
  let bitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip vertical timing pattern column

    const rowRange = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);

    for (const row of rowRange) {
      for (const c of [col, col - 1]) {
        if (!reserved[row][c]) {
          let bit = false;
          if (bitIdx < totalBits) {
            const bytePos = Math.floor(bitIdx / 8);
            const bitOffset = 7 - (bitIdx % 8);
            bit = ((finalCodewords[bytePos] >> bitOffset) & 1) === 1;
            bitIdx++;
          }
          // Apply standard Mask 0: (row + col) % 2 === 0
          const mask = (row + c) % 2 === 0;
          matrix[row][c] = bit !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 6. Write Format Info (Level L, Mask 0 = format string 0x77c4)
  const formatBits = 0b111011111000100; // Format information code for ECC L, Mask 0
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;
    // Top-left
    if (i < 6) setModule(8, i, bit);
    else if (i === 6) setModule(8, 7, bit);
    else if (i === 7) setModule(8, 8, bit);
    else if (i === 8) setModule(7, 8, bit);
    else setModule(14 - i, 8, bit);

    // Split across top-right and bottom-left
    if (i < 8) {
      setModule(size - 1 - i, 8, bit);
    } else {
      setModule(8, size - 15 + i, bit);
    }
  }

  return matrix;
}
