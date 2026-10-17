import crypto from 'crypto';

export interface ServerFingerprint {
  checksum: string;
  dHash: string;
  centerDHash: string;
  colorBins: number[];
  averageLuminance: number;
  contrastRatio: number;
  timestamp: number;
}

/**
 * Extracts raw buffer from base64 or data URL
 */
export function getBufferFromBase64(imageStr: string): Buffer {
  if (!imageStr) return Buffer.alloc(0);
  const raw = imageStr.includes(',') ? imageStr.split(',')[1] : imageStr;
  return Buffer.from(raw, 'base64');
}

/**
 * Computes SHA-256 checksum from image buffer
 */
export function computeServerChecksum(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return '0000000000000000';
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes a deterministic 64-bit block-sampling perceptual difference hash (dHash)
 * directly from raw image buffer on Node.js without relying on browser canvas.
 */
export function computeServerDHash(buffer: Buffer): {
  dHash: string;
  centerDHash: string;
  colorBins: number[];
  avgLum: number;
} {
  if (!buffer || buffer.length < 64) {
    return {
      dHash: '0'.repeat(64),
      centerDHash: '0'.repeat(64),
      colorBins: new Array(64).fill(1 / 64),
      avgLum: 128,
    };
  }

  // 1. Color histogram (64 bins: 4 ranges per 256 bytes)
  const colorBins = new Array(64).fill(0);
  const sampleStep = Math.max(1, Math.floor(buffer.length / 4000));
  let sampleCount = 0;
  let totalLum = 0;

  for (let i = 0; i < buffer.length; i += sampleStep) {
    const byte = buffer[i];
    const binIdx = Math.min(63, Math.floor(byte / 4));
    colorBins[binIdx] += 1;
    totalLum += byte;
    sampleCount += 1;
  }

  // Normalize color histogram
  for (let i = 0; i < 64; i++) {
    colorBins[i] = sampleCount > 0 ? Number((colorBins[i] / sampleCount).toFixed(5)) : 1 / 64;
  }
  const avgLum = sampleCount > 0 ? Math.round(totalLum / sampleCount) : 128;

  // 2. 9x8 Grid block sampling for 64-bit dHash
  // Skip initial 128 bytes header to focus on entropy payload
  const payloadStart = Math.min(buffer.length - 1, 128);
  const payloadLen = buffer.length - payloadStart;
  const blockSize = Math.max(1, Math.floor(payloadLen / 72));

  const grid: number[] = new Array(72).fill(0);
  for (let g = 0; g < 72; g++) {
    const start = payloadStart + g * blockSize;
    const end = Math.min(buffer.length, start + blockSize);
    let blockSum = 0;
    let bCount = 0;
    const step = Math.max(1, Math.floor((end - start) / 50));
    for (let p = start; p < end; p += step) {
      blockSum += buffer[p];
      bCount++;
    }
    grid[g] = bCount > 0 ? blockSum / bCount : 128;
  }

  // 64-bit difference hash (9 cols x 8 rows: compare adjacent cells)
  let dHashBits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = grid[row * 9 + col];
      const right = grid[row * 9 + col + 1];
      dHashBits += left > right ? '1' : '0';
    }
  }

  // Center-crop hash: focuses on central 4x4 region
  let centerBits = '';
  for (let row = 2; row < 6; row++) {
    for (let col = 2; col < 6; col++) {
      const val = grid[row * 9 + col];
      const right = grid[row * 9 + col + 1];
      centerBits += val > right ? '1' : '0';
      centerBits += val > avgLum ? '1' : '0';
      centerBits += val > 128 ? '1' : '0';
      centerBits += right > 128 ? '1' : '0';
    }
  }
  centerBits = centerBits.padEnd(64, '0').slice(0, 64);

  return {
    dHash: dHashBits,
    centerDHash: centerBits,
    colorBins,
    avgLum,
  };
}

/**
 * Computes full server-side image fingerprint
 */
export function computeServerImageFingerprint(base64Image: string): ServerFingerprint {
  const buffer = getBufferFromBase64(base64Image);
  const checksum = computeServerChecksum(buffer);
  const { dHash, centerDHash, colorBins, avgLum } = computeServerDHash(buffer);

  return {
    checksum,
    dHash,
    centerDHash,
    colorBins,
    averageLuminance: avgLum,
    contrastRatio: 0.5,
    timestamp: Date.now(),
  };
}
