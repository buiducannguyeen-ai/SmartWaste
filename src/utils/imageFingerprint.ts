/**
 * Advanced Multi-Vector Image Fingerprinting & Anti-Cheat Engine (EcoSort AI STEM 2026)
 * 
 * Provides defense-in-depth against:
 * 1. EXACT_DUPLICATE: Re-uploading or scanning identical image bytes (100% byte checksum / hash distance = 0).
 * 2. MODIFIED_IMAGE: Slightly cropped, zoomed, brightness-tweaked, or filtered versions of prior images.
 * 3. SAME_PHYSICAL_OBJECT: Re-scanning the exact same physical bottle/can repeatedly within a cooldown window.
 * 4. SCREEN_SPOOF: Photographing or holding up mobile phones, tablets, or PC monitor screens (Moiré pattern & bezel detection).
 * 
 * Crucial Precision Guarantee (Anti-False-Lockout):
 * Does NOT falsely lock different physical objects that happen to share standard bottle/can shapes
 * by combining Multi-scale dHash + Center-Crop Hash + 64-bin Color Histogram + Temporal Cooldown.
 */

import { ScannedFingerprintRecord, DuplicateAlertInfo, WasteCategory } from '../types';

export interface ColorHistogram {
  bins: number[]; // 64 normalized color bins (4x4x4 RGB quantization)
  dominantHue: number; // 0-360
  colorEntropy: number;
}

export interface ScreenSpoofIndicators {
  isScreenSpoofRisk: boolean;
  score: number; // 0.0 to 1.0 (higher = greater confidence of screen recapture)
  moireEnergy: number; // High-frequency periodic gradient energy
  bezelDetected: boolean; // Sharp border edges indicative of device frame
  glareArtifacts: boolean; // Specular screen reflection hotspot
  reasons: string[];
}

export interface FingerprintResult {
  checksum: string; // Fast 64-bit hash of image data
  dHash: string; // 64-bit difference hash (9x8) with histogram normalization
  aHash: string; // 64-bit average hash (8x8)
  centerDHash: string; // 64-bit center-crop hash (focuses on object, resistant to background shift / zoom)
  quadrantHashes: string[]; // 4 x 16-bit quadrant hashes for localized tamper detection
  colorHistogram: ColorHistogram;
  screenSpoof: ScreenSpoofIndicators;
  averageLuminance: number;
  contrastRatio: number;
  timestamp: number;
  thumbnail: string; // 64x64 audit thumbnail
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarity: number; // 0.0 to 1.0 (e.g. 0.95 = 95% identical)
  timeSinceLastScanMs: number;
  reason: string;
  suggestedAction: string;
  matchedRecord?: ScannedFingerprintRecord;
  isExactFileMatch?: boolean;
  isScreenSpoof?: boolean;
  detectionTier?: 'exact_file' | 'modified_image' | 'same_physical_object' | 'screen_spoof' | 'suspicious';
  technicalDetails?: {
    dHashSimilarity: number;
    colorSimilarity: number;
    centerSimilarity: number;
    screenSpoofScore: number;
  };
}

const STORAGE_KEY_REGISTRY = 'ecosort_scanned_fingerprints';
const COOLDOWN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes cooldown for same physical object

/**
 * Computes a fast 64-bit hash code string from a raw string/data URI
 */
export function computeFastChecksum(str: string): string {
  if (!str) return '0000000000000000';
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  // Sample uniformly across the entire payload
  const len = str.length;
  const step = Math.max(1, Math.floor(len / 1000));
  for (let i = 0; i < len; i += step) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return part1 + part2;
}

/**
 * Calculates similarity between two binary string hashes (0.0 to 1.0)
 */
export function calculateHashSimilarity(hashA?: string, hashB?: string): number {
  if (!hashA || !hashB || hashA.length === 0 || hashB.length === 0) {
    return 0;
  }
  const minLen = Math.min(hashA.length, hashB.length);
  let matchingBits = 0;
  for (let i = 0; i < minLen; i++) {
    if (hashA[i] === hashB[i]) {
      matchingBits++;
    }
  }
  return matchingBits / minLen;
}

/**
 * Computes a 64-bin quantized color histogram (4x4x4 RGB)
 */
export function computeColorHistogramFromRgba(
  data: Uint8ClampedArray | number[],
  pixelCount: number
): ColorHistogram {
  const bins = new Array(64).fill(0);
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalR += r;
    totalG += g;
    totalB += b;

    // 4 bins per channel -> 0,1,2,3
    const rBin = Math.min(3, Math.floor(r / 64));
    const gBin = Math.min(3, Math.floor(g / 64));
    const bBin = Math.min(3, Math.floor(b / 64));
    const binIdx = rBin * 16 + gBin * 4 + bBin;
    bins[binIdx]++;
  }

  // Normalize bins so sum is 1.0
  const totalPixels = Math.max(1, pixelCount);
  let entropy = 0;
  for (let i = 0; i < 64; i++) {
    bins[i] = bins[i] / totalPixels;
    if (bins[i] > 0) {
      entropy -= bins[i] * Math.log2(bins[i]);
    }
  }

  // Calculate dominant approximate hue
  const avgR = totalR / totalPixels;
  const avgG = totalG / totalPixels;
  const avgB = totalB / totalPixels;
  const max = Math.max(avgR, avgG, avgB);
  const min = Math.min(avgR, avgG, avgB);
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    if (max === avgR) hue = ((avgG - avgB) / d + (avgG < avgB ? 6 : 0)) * 60;
    else if (max === avgG) hue = ((avgB - avgR) / d + 2) * 60;
    else hue = ((avgR - avgG) / d + 4) * 60;
  }

  return {
    bins,
    dominantHue: Math.round(hue),
    colorEntropy: Number(entropy.toFixed(3)),
  };
}

/**
 * Calculates histogram intersection similarity (0.0 to 1.0)
 */
export function calculateHistogramSimilarity(histA?: number[], histB?: number[]): number {
  if (!histA || !histB || histA.length !== histB.length || histA.length === 0) {
    return 0;
  }
  let intersection = 0;
  for (let i = 0; i < histA.length; i++) {
    intersection += Math.min(histA[i], histB[i]);
  }
  return Math.min(1.0, Math.max(0.0, intersection));
}

/**
 * Detects screen recapture indicators (Moiré high-frequency ripple + Screen border bezels)
 */
export function analyzeScreenSpoofFeatures(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): ScreenSpoofIndicators {
  const reasons: string[] = [];
  let moireEnergy = 0;
  let bezelDetected = false;
  let glareArtifacts = false;

  try {
    // 1. Moiré High-Frequency Spectrum Analysis on a 64x64 central grid
    const sampleSize = 64;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sampleSize;
    sampleCanvas.height = sampleSize;
    const sCtx = sampleCanvas.getContext('2d');

    if (sCtx) {
      sCtx.drawImage(ctx.canvas, 0, 0, sampleSize, sampleSize);
      const imgData = sCtx.getImageData(0, 0, sampleSize, sampleSize).data;

      // Compute horizontal and vertical second-derivative gradient variance
      let highFreqGradients = 0;
      let totalGradients = 0;
      let specularCount = 0;

      for (let y = 1; y < sampleSize - 1; y++) {
        for (let x = 1; x < sampleSize - 1; x++) {
          const idx = (y * sampleSize + x) * 4;
          const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];

          // Check for pure white clipping / screen specular reflection hotspot
          if (lum > 250) {
            specularCount++;
          }

          const idxL = (y * sampleSize + (x - 1)) * 4;
          const idxR = (y * sampleSize + (x + 1)) * 4;
          const lumL = 0.299 * imgData[idxL] + 0.587 * imgData[idxL + 1] + 0.114 * imgData[idxL + 2];
          const lumR = 0.299 * imgData[idxR] + 0.587 * imgData[idxR + 1] + 0.114 * imgData[idxR + 2];

          // 2nd derivative (Laplacian horizontal ripple)
          const d2 = Math.abs(lumL - 2 * lum + lumR);
          if (d2 > 18) {
            highFreqGradients++;
          }
          totalGradients++;
        }
      }

      moireEnergy = totalGradients > 0 ? highFreqGradients / totalGradients : 0;
      if (specularCount > (sampleSize * sampleSize * 0.08)) {
        glareArtifacts = true;
      }
    }

    // 2. Bezel / Screen Frame Boundary Detection
    // Check outer 8% perimeter for sharp, continuous dark borders characteristic of phone/tablet frames
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 32;
    bCanvas.height = 32;
    const bCtx = bCanvas.getContext('2d');
    if (bCtx) {
      bCtx.drawImage(ctx.canvas, 0, 0, 32, 32);
      const bData = bCtx.getImageData(0, 0, 32, 32).data;

      let topBorderDark = 0;
      let bottomBorderDark = 0;
      let leftBorderDark = 0;
      let rightBorderDark = 0;

      for (let x = 0; x < 32; x++) {
        const topLum = (bData[x * 4] + bData[x * 4 + 1] + bData[x * 4 + 2]) / 3;
        const botLum = (bData[(31 * 32 + x) * 4] + bData[(31 * 32 + x) * 4 + 1] + bData[(31 * 32 + x) * 4 + 2]) / 3;
        if (topLum < 35) topBorderDark++;
        if (botLum < 35) bottomBorderDark++;
      }

      for (let y = 0; y < 32; y++) {
        const leftLum = (bData[(y * 32) * 4] + bData[(y * 32) * 4 + 1] + bData[(y * 32) * 4 + 2]) / 3;
        const rightLum = (bData[(y * 32 + 31) * 4] + bData[(y * 32 + 31) * 4 + 1] + bData[(y * 32 + 31) * 4 + 2]) / 3;
        if (leftLum < 35) leftBorderDark++;
        if (rightLum < 35) rightBorderDark++;
      }

      if ((topBorderDark >= 24 && bottomBorderDark >= 24) || (leftBorderDark >= 24 && rightBorderDark >= 24)) {
        bezelDetected = true;
      }
    }
  } catch (e) {
    // Graceful fallback
  }

  // Calculate composite score
  let score = 0;
  if (moireEnergy > 0.35) {
    score += 0.55;
    reasons.push('Phát hiện vân sọc quét Moiré của màn hình điện tử');
  } else if (moireEnergy > 0.25) {
    score += 0.30;
  }

  if (bezelDetected) {
    score += 0.35;
    reasons.push('Phát hiện viền khung bezel thiết bị điện tử trong ảnh');
  }

  if (glareArtifacts && moireEnergy > 0.20) {
    score += 0.20;
    reasons.push('Vệt lóa phản chiếu màn hình kính');
  }

  const isRisk = score >= 0.70;

  return {
    isScreenSpoofRisk: isRisk,
    score: Number(Math.min(1.0, score).toFixed(2)),
    moireEnergy: Number(moireEnergy.toFixed(3)),
    bezelDetected,
    glareArtifacts,
    reasons,
  };
}

/**
 * Computes difference hash (dHash) with contrast normalization for illumination invariance
 */
function computeNormalizedDHash(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { dHash: string; avgLum: number; contrastRatio: number } {
  let minLum = 255;
  let maxLum = 0;
  let totalLum = 0;

  const rawLums: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      row.push(lum);
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      totalLum += lum;
    }
    rawLums.push(row);
  }

  // Stretch contrast to be invariant against dark/bright lighting
  const lumRange = Math.max(1, maxLum - minLum);
  let dHash = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const normCur = (rawLums[y][x] - minLum) / lumRange;
      const normNext = (rawLums[y][x + 1] - minLum) / lumRange;
      dHash += normCur > normNext ? '1' : '0';
    }
  }

  return {
    dHash,
    avgLum: totalLum / (width * height),
    contrastRatio: Number((lumRange / 255).toFixed(2)),
  };
}

/**
 * Computes multi-vector image fingerprint
 */
export async function computeImageFingerprint(imageSrc: string): Promise<FingerprintResult> {
  return new Promise((resolve) => {
    const checksum = computeFastChecksum(imageSrc);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const fallbackResult: FingerprintResult = {
      checksum,
      dHash: '0'.repeat(64),
      aHash: '0'.repeat(64),
      centerDHash: '0'.repeat(64),
      quadrantHashes: ['0'.repeat(16), '0'.repeat(16), '0'.repeat(16), '0'.repeat(16)],
      colorHistogram: { bins: new Array(64).fill(1 / 64), dominantHue: 0, colorEntropy: 0 },
      screenSpoof: { isScreenSpoofRisk: false, score: 0, moireEnergy: 0, bezelDetected: false, glareArtifacts: false, reasons: [] },
      averageLuminance: 128,
      contrastRatio: 0.5,
      timestamp: Date.now(),
      thumbnail: imageSrc,
    };

    img.onload = () => {
      try {
        const fullCanvas = document.createElement('canvas');
        const imgW = img.naturalWidth || img.width || 320;
        const imgH = img.naturalHeight || img.height || 240;
        fullCanvas.width = imgW;
        fullCanvas.height = imgH;
        const fullCtx = fullCanvas.getContext('2d');

        if (!fullCtx) {
          resolve(fallbackResult);
          return;
        }

        fullCtx.drawImage(img, 0, 0, imgW, imgH);

        // 1. Screen Spoof & Moiré Analysis
        const screenSpoof = analyzeScreenSpoofFeatures(fullCtx, imgW, imgH);

        // 2. Full-frame 9x8 dHash with Illumination Contrast Stretching
        const dCanvas = document.createElement('canvas');
        dCanvas.width = 9;
        dCanvas.height = 8;
        const dCtx = dCanvas.getContext('2d');
        let dHash = '0'.repeat(64);
        let avgLum = 128;
        let contrastRatio = 0.5;

        if (dCtx) {
          dCtx.drawImage(fullCanvas, 0, 0, 9, 8);
          const dData = dCtx.getImageData(0, 0, 9, 8).data;
          const dRes = computeNormalizedDHash(dData, 9, 8);
          dHash = dRes.dHash;
          avgLum = dRes.avgLum;
          contrastRatio = dRes.contrastRatio;
        }

        // 3. Average Hash (aHash) on 8x8
        const aCanvas = document.createElement('canvas');
        aCanvas.width = 8;
        aCanvas.height = 8;
        const aCtx = aCanvas.getContext('2d');
        let aHash = dHash;
        if (aCtx) {
          aCtx.drawImage(fullCanvas, 0, 0, 8, 8);
          const aData = aCtx.getImageData(0, 0, 8, 8).data;
          let aTotal = 0;
          const aLums: number[] = [];
          for (let i = 0; i < aData.length; i += 4) {
            const lum = 0.299 * aData[i] + 0.587 * aData[i + 1] + 0.114 * aData[i + 2];
            aLums.push(lum);
            aTotal += lum;
          }
          const aAvg = aTotal / 64;
          let aBits = '';
          for (let i = 0; i < 64; i++) {
            aBits += aLums[i] >= aAvg ? '1' : '0';
          }
          aHash = aBits;
        }

        // 4. Center-crop dHash (inner 60% of frame): robust against peripheral cropping / zoom
        const cCanvas = document.createElement('canvas');
        cCanvas.width = 9;
        cCanvas.height = 8;
        const cCtx = cCanvas.getContext('2d');
        let centerDHash = dHash;
        if (cCtx) {
          const cropX = Math.floor(imgW * 0.2);
          const cropY = Math.floor(imgH * 0.2);
          const cropW = Math.max(10, Math.floor(imgW * 0.6));
          const cropH = Math.max(10, Math.floor(imgH * 0.6));
          cCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, 9, 8);
          const cData = cCtx.getImageData(0, 0, 9, 8).data;
          centerDHash = computeNormalizedDHash(cData, 9, 8).dHash;
        }

        // 5. 4-Quadrant Hashes (4 x 16-bit)
        const quadrantHashes: string[] = [];
        const qCanvas = document.createElement('canvas');
        qCanvas.width = 5;
        qCanvas.height = 4;
        const qCtx = qCanvas.getContext('2d');
        if (qCtx) {
          const halfW = Math.floor(imgW / 2);
          const halfH = Math.floor(imgH / 2);
          const quads = [
            { sx: 0, sy: 0 },
            { sx: halfW, sy: 0 },
            { sx: 0, sy: halfH },
            { sx: halfW, sy: halfH },
          ];
          for (const q of quads) {
            qCtx.clearRect(0, 0, 5, 4);
            qCtx.drawImage(fullCanvas, q.sx, q.sy, halfW, halfH, 0, 0, 5, 4);
            const qData = qCtx.getImageData(0, 0, 5, 4).data;
            quadrantHashes.push(computeNormalizedDHash(qData, 5, 4).dHash);
          }
        } else {
          quadrantHashes.push('0'.repeat(16), '0'.repeat(16), '0'.repeat(16), '0'.repeat(16));
        }

        // 6. 64-bin Color Histogram (RGB quantized)
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = 32;
        colorCanvas.height = 32;
        const colorCtx = colorCanvas.getContext('2d');
        let colorHistogram: ColorHistogram = {
          bins: new Array(64).fill(1 / 64),
          dominantHue: 0,
          colorEntropy: 0,
        };
        if (colorCtx) {
          colorCtx.drawImage(fullCanvas, 0, 0, 32, 32);
          const cData = colorCtx.getImageData(0, 0, 32, 32).data;
          colorHistogram = computeColorHistogramFromRgba(cData, 32 * 32);
        }

        // 7. Audit thumbnail (64x64)
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 64;
        thumbCanvas.height = 64;
        const thumbCtx = thumbCanvas.getContext('2d');
        let thumbnail = imageSrc;
        if (thumbCtx) {
          thumbCtx.drawImage(fullCanvas, 0, 0, 64, 64);
          thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.65);
        }

        resolve({
          checksum,
          dHash,
          aHash,
          centerDHash,
          quadrantHashes,
          colorHistogram,
          screenSpoof,
          averageLuminance: Number(avgLum.toFixed(1)),
          contrastRatio,
          timestamp: Date.now(),
          thumbnail,
        });
      } catch (err) {
        console.error('Error computing fingerprint:', err);
        resolve(fallbackResult);
      }
    };

    img.onerror = () => {
      resolve(fallbackResult);
    };

    img.src = imageSrc;
  });
}

/**
 * Evaluates an incoming image fingerprint against the entire audit registry.
 * 
 * Accurately distinguishes:
 * 1. EXACT_DUPLICATE: Identical file or exact same captured frame (100% match).
 * 2. MODIFIED_IMAGE: Cropped, zoomed, brightness-adjusted, or recompressed version of old image.
 * 3. SAME_PHYSICAL_OBJECT: Same physical item re-scanned repeatedly in short timeframe (<5 min).
 * 4. DIFFERENT_OBJECT_SAME_CATEGORY: Different physical objects of similar type (ALLOWED - no false lockout).
 * 5. SCREEN_SPOOF: Phone/computer screen recapture.
 */
export function evaluateAgainstRegistry(
  currentFp: FingerprintResult,
  registry: ScannedFingerprintRecord[],
  options?: {
    cooldownMs?: number;
    allowSameCategoryVariation?: boolean;
  }
): DuplicateCheckResult {
  // Check 1: Screen Spoof / Device Recapture Check
  if (currentFp.screenSpoof.isScreenSpoofRisk) {
    const reasonsStr = currentFp.screenSpoof.reasons.join(', ');
    return {
      isDuplicate: true,
      similarity: currentFp.screenSpoof.score,
      timeSinceLastScanMs: 0,
      isExactFileMatch: false,
      isScreenSpoof: true,
      detectionTier: 'screen_spoof',
      reason: `Phát hiện dấu hiệu chụp lại ảnh từ màn hình thiết bị điện tử (${reasonsStr}).`,
      suggestedAction: 'Không đưa màn hình điện thoại hoặc máy tính trước camera. Hãy chụp vật thể rác thật!',
      technicalDetails: {
        dHashSimilarity: 0,
        colorSimilarity: 0,
        centerSimilarity: 0,
        screenSpoofScore: currentFp.screenSpoof.score,
      },
    };
  }

  if (!registry || registry.length === 0) {
    return {
      isDuplicate: false,
      similarity: 0,
      timeSinceLastScanMs: Infinity,
      reason: '',
      suggestedAction: '',
    };
  }

  const now = currentFp.timestamp || Date.now();
  const cooldownMs = options?.cooldownMs ?? COOLDOWN_WINDOW_MS;

  let bestMatch: ScannedFingerprintRecord | null = null;
  let maxSimilarity = 0;
  let matchedTier: 'exact_file' | 'modified_image' | 'same_physical_object' | 'suspicious' | undefined;
  let matchedDetails = {
    dHashSimilarity: 0,
    colorSimilarity: 0,
    centerSimilarity: 0,
    screenSpoofScore: currentFp.screenSpoof.score,
  };

  for (const record of registry) {
    const isExactChecksum = record.checksum && currentFp.checksum && record.checksum === currentFp.checksum;
    const dSim = calculateHashSimilarity(currentFp.dHash, record.dHash);
    const centerSim = calculateHashSimilarity(currentFp.centerDHash, record.centerDHash || record.dHash);
    const colorSim = record.colorBins
      ? calculateHistogramSimilarity(currentFp.colorHistogram.bins, record.colorBins)
      : 0.85; // neutral fallback if old record lacks colorBins

    // Calculate quadrant match ratio
    let quadrantSim = 0;
    if (currentFp.quadrantHashes && record.quadrantHashes && record.quadrantHashes.length === 4) {
      let qMatches = 0;
      for (let i = 0; i < 4; i++) {
        qMatches += calculateHashSimilarity(currentFp.quadrantHashes[i], record.quadrantHashes[i]);
      }
      quadrantSim = qMatches / 4;
    } else {
      quadrantSim = dSim;
    }

    const timeDiff = Math.max(0, now - record.timestamp);

    // ========================================================
    // TIER 1: EXACT DUPLICATE (Byte-level or Pixel-Exact Match)
    // ========================================================
    if (isExactChecksum || (dSim >= 0.98 && centerSim >= 0.98 && colorSim >= 0.98)) {
      bestMatch = record;
      maxSimilarity = 1.0;
      matchedTier = 'exact_file';
      matchedDetails = { dHashSimilarity: dSim, colorSimilarity: colorSim, centerSimilarity: centerSim, screenSpoofScore: currentFp.screenSpoof.score };
      break;
    }

    // ========================================================
    // TIER 2: MODIFIED IMAGE (Cropped, Zoomed, Brightness-Tweaked)
    // ========================================================
    // If the center crop matches at >=92% OR (global dHash >=88% AND color profile matches >=88%)
    const isModified =
      (centerSim >= 0.92 && colorSim >= 0.85) ||
      (dSim >= 0.88 && colorSim >= 0.88) ||
      (quadrantSim >= 0.90 && colorSim >= 0.86);

    if (isModified) {
      const compositeSim = centerSim * 0.45 + dSim * 0.35 + colorSim * 0.20;
      if (compositeSim > maxSimilarity) {
        maxSimilarity = compositeSim;
        bestMatch = record;
        matchedTier = 'modified_image';
        matchedDetails = { dHashSimilarity: dSim, colorSimilarity: colorSim, centerSimilarity: centerSim, screenSpoofScore: currentFp.screenSpoof.score };
      }
      continue;
    }

    // ========================================================
    // TIER 3: SAME PHYSICAL OBJECT RE-SCANNED WITHIN COOLDOWN
    // ========================================================
    // Student holds same bottle, points camera again with slight angle shift (<5 mins ago)
    const isSamePhysicalObjectInCooldown =
      timeDiff < cooldownMs &&
      dSim >= 0.80 &&
      centerSim >= 0.80 &&
      colorSim >= 0.82;

    if (isSamePhysicalObjectInCooldown) {
      const compositeSim = dSim * 0.4 + centerSim * 0.3 + colorSim * 0.3;
      if (compositeSim > maxSimilarity) {
        maxSimilarity = compositeSim;
        bestMatch = record;
        matchedTier = 'same_physical_object';
        matchedDetails = { dHashSimilarity: dSim, colorSimilarity: colorSim, centerSimilarity: centerSim, screenSpoofScore: currentFp.screenSpoof.score };
      }
      continue;
    }

    // ========================================================
    // TIER 4: DIFFERENT OBJECT, SAME CATEGORY (ALLOWED!)
    // ========================================================
    // Example: Two different bottles or cans. They share cylindrical silhouette
    // (dSim might be 0.70-0.78), but colorSim < 0.78 or centerSim < 0.80.
    // We explicitly DO NOT flag this as a duplicate!
  }

  if (bestMatch && matchedTier) {
    const timeDiff = Math.max(0, now - bestMatch.timestamp);
    const simPercent = Math.round(maxSimilarity * 100);
    const timeStr =
      timeDiff < 60000
        ? `${Math.max(1, Math.round(timeDiff / 1000))} giây trước`
        : `${Math.round(timeDiff / 60000)} phút trước`;

    if (matchedTier === 'exact_file') {
      return {
        isDuplicate: true,
        similarity: 1.0,
        timeSinceLastScanMs: timeDiff,
        isExactFileMatch: true,
        matchedRecord: bestMatch,
        detectionTier: 'exact_file',
        reason: `Tệp ảnh này trùng khớp hoàn toàn (100%) với ảnh đã nhận điểm cho món "${bestMatch.itemName}".`,
        suggestedAction: 'Không dùng lại cùng một tệp ảnh để quét nhiều lần. Hãy chụp món rác thật ngoài đời!',
        technicalDetails: matchedDetails,
      };
    }

    if (matchedTier === 'modified_image') {
      return {
        isDuplicate: true,
        similarity: maxSimilarity,
        timeSinceLastScanMs: timeDiff,
        isExactFileMatch: false,
        matchedRecord: bestMatch,
        detectionTier: 'modified_image',
        reason: `Phát hiện ảnh đã qua chỉnh sửa (thay đổi độ sáng, cắt cúp góc chụp) từ mẫu "${bestMatch.itemName}" (${simPercent}% tương đồng).`,
        suggestedAction: 'Không chỉnh sửa ảnh cũ để gian lận tích điểm. Hãy đưa vật thể rác mới vào khung quét!',
        technicalDetails: matchedDetails,
      };
    }

    if (matchedTier === 'same_physical_object') {
      return {
        isDuplicate: true,
        similarity: maxSimilarity,
        timeSinceLastScanMs: timeDiff,
        isExactFileMatch: false,
        matchedRecord: bestMatch,
        detectionTier: 'same_physical_object',
        reason: `Vật thể này trùng khớp ${simPercent}% với món "${bestMatch.itemName}" vừa được quét và tích điểm (${timeStr}).`,
        suggestedAction: 'Mỗi món rác chỉ được tích điểm 1 lần duy nhất! Vui lòng bỏ rác vào thùng trước khi quét món mới.',
        technicalDetails: matchedDetails,
      };
    }
  }

  // Not a duplicate: legitimate scan or separate physical item
  return {
    isDuplicate: false,
    similarity: maxSimilarity,
    timeSinceLastScanMs: bestMatch ? Math.max(0, now - bestMatch.timestamp) : Infinity,
    reason: '',
    suggestedAction: '',
    technicalDetails: matchedDetails,
  };
}

/**
 * Loads registry from local storage (with memory fallback)
 */
export function loadFingerprintRegistry(): ScannedFingerprintRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REGISTRY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load fingerprint registry from localStorage', e);
    return [];
  }
}

/**
 * Saves registry to local storage (keeps up to 150 items)
 */
export function saveFingerprintRegistry(registry: ScannedFingerprintRecord[]): void {
  try {
    const trimmed = registry.slice(-150);
    localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save fingerprint registry to localStorage', e);
  }
}

/**
 * Adds a new scan's fingerprint to both local and server-side registry
 */
export async function registerScannedFingerprint(record: ScannedFingerprintRecord): Promise<void> {
  // 1. Update local client storage
  const current = loadFingerprintRegistry();
  const updated = current.filter((r) => r.id !== record.id);
  updated.push(record);
  saveFingerprintRegistry(updated);

  // 2. Sync to backend store so anti-cheat survives cache clearing / multiple devices
  try {
    await fetch('/api/anti-cheat/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.warn('[Anti-Cheat] Notice syncing fingerprint to server store:', err);
  }
}

/**
 * Fetches the master cross-device fingerprint registry from the backend
 */
export async function fetchServerFingerprintRegistry(): Promise<ScannedFingerprintRecord[]> {
  try {
    const res = await fetch('/api/anti-cheat/registry');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.registry)) {
        saveFingerprintRegistry(data.registry);
        return data.registry;
      }
    }
  } catch (e) {
    console.warn('[Anti-Cheat] Could not fetch server registry, using local cache:', e);
  }
  return loadFingerprintRegistry();
}

/**
 * Clears the fingerprint registry on both client and server
 */
export async function clearFingerprintRegistry(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY_REGISTRY);
    await fetch('/api/anti-cheat/clear', { method: 'POST' });
  } catch (e) {
    console.error('Failed to clear fingerprint registry', e);
  }
}
