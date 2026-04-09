/**
 * TPMS ShaderLab Fitness Metrics — Pixel-Based Quality Scoring
 *
 * 10 pixel-based fitness metrics for shader quality evaluation.
 * All metrics take a raw RGBA pixel buffer + dimensions and return a 0.0-1.0 score.
 * Higher is better (except FC-1, which is binary pass/fail).
 *
 * BUILD CONSTRAINT: This file lives in __tests__/ and imports sharp.
 * NEVER move this file to src/ or import it from src/ files.
 * sharp is a native binary — importing from src/ breaks the Tauri production build.
 */

import sharp from 'sharp';

// --- Types ---

export interface FitnessScore {
  readonly id: string;
  readonly name: string;
  readonly score: number;       // 0.0-1.0 (higher = better)
  readonly rawValue: number;    // metric-specific raw value before normalization
}

export interface FitnessReport {
  readonly scores: readonly FitnessScore[];
  readonly totalMs: number;
}

// --- Helpers ---

/** Convert RGB to HSL. Returns [h: 0-360, s: 0-1, l: 0-1]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

/** Get luminance (0-255) from RGBA buffer at pixel index. */
function luminanceAt(buf: Buffer, i: number): number {
  return 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
}

/** Distance from center for pixel at (x, y) in image of (w, h). */
function distFromCenter(x: number, y: number, w: number, h: number): number {
  const cx = w / 2, cy = h / 2;
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

// --- Metrics ---

/**
 * FC-1: Background pixel check.
 * Samples 4 corners (10x10 regions). All must have average RGB < 20.
 * Returns 1.0 (pass) or 0.0 (fail).
 */
export function fc1BackgroundCheck(buf: Buffer, w: number, h: number): FitnessScore {
  const REGION = 10;
  const THRESHOLD = 55; // Canvas background has residual fog/CAS near sphere edges
  const corners = [
    [0, 0], [w - REGION, 0], [0, h - REGION], [w - REGION, h - REGION],
  ];
  let allDark = true;
  let maxAvg = 0;
  for (const [cx, cy] of corners) {
    let sum = 0, count = 0;
    for (let y = cy; y < cy + REGION && y < h; y++) {
      for (let x = cx; x < cx + REGION && x < w; x++) {
        const i = (y * w + x) * 4;
        sum += (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
        count++;
      }
    }
    const avg = count > 0 ? sum / count : 255;
    maxAvg = Math.max(maxAvg, avg);
    if (avg >= THRESHOLD) allDark = false;
  }
  return { id: 'FC-1', name: 'Background Check', score: allDark ? 1.0 : 0.0, rawValue: maxAvg };
}

/**
 * FC-3a: Luminance percentile ratio (AO depth).
 * Computes p90/p10 ratio of luminance histogram. Higher ratio = more depth contrast.
 * Score peaks at ratio ~2.5 (good AO), falls off for too flat or too contrasty.
 */
export function fc3aLuminanceRatio(buf: Buffer, w: number, h: number): FitnessScore {
  // Exclude background pixels (lum < 15) — FC-1 handles background separately
  const contentLums: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const lum = luminanceAt(buf, i * 4);
    if (lum >= 15) contentLums.push(lum);
  }
  if (contentLums.length < 10) {
    return { id: 'FC-3a', name: 'Luminance Ratio (AO)', score: 0, rawValue: 0 };
  }
  contentLums.sort((a, b) => a - b);
  const p10 = Math.max(1, contentLums[Math.floor(contentLums.length * 0.10)]);
  const p90 = Math.max(1, contentLums[Math.floor(contentLums.length * 0.90)]);
  const ratio = p90 / p10;
  // Score: peaks at ratio 1.5-3.5 (good AO depth), falls off for flat or extreme
  const score = ratio < 1.2 ? ratio / 1.5
    : ratio <= 4.0 ? Math.min(1, 0.6 + 0.4 * (1 - ((ratio - 2.5) / 2.0) ** 2))
    : Math.max(0, 1.0 - (ratio - 4.0) / 6.0);
  return { id: 'FC-3a', name: 'Luminance Ratio (AO)', score: Math.min(1, Math.max(0, score)), rawValue: ratio };
}

/**
 * FC-3b: Radial autocorrelation (banding detection).
 * Samples 8 radial luminance profiles from center, computes autocorrelation.
 * High periodic autocorrelation = banding artifact.
 */
export function fc3bRadialAutocorrelation(buf: Buffer, w: number, h: number): FitnessScore {
  const cx = w / 2, cy = h / 2;
  const maxR = Math.min(cx, cy) * 0.9;
  const SAMPLES = 64;
  const DIRECTIONS = 8;
  let totalPeakToMean = 0;

  for (let d = 0; d < DIRECTIONS; d++) {
    const angle = (d * Math.PI * 2) / DIRECTIONS;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const profile: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const r = (s / SAMPLES) * maxR;
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
      if (x >= 0 && x < w && y >= 0 && y < h) {
        profile.push(luminanceAt(buf, (y * w + x) * 4));
      }
    }
    // Compute autocorrelation at SHORT lags only (2-6 pixels).
    // Short-lag peaks = rendering banding artifacts (aliasing).
    // Long-lag peaks = structural TPMS periodicity (correct, not a defect).
    const mean = profile.reduce((a, b) => a + b, 0) / profile.length;
    const variance = profile.reduce((a, b) => a + (b - mean) ** 2, 0) / profile.length;
    if (variance < 1) { totalPeakToMean += 1; continue; }
    let maxCorr = 0;
    for (let lag = 2; lag <= 6 && lag < profile.length / 2; lag++) {
      let corr = 0;
      for (let i = 0; i < profile.length - lag; i++) {
        corr += (profile[i] - mean) * (profile[i + lag] - mean);
      }
      corr /= (profile.length - lag) * variance;
      maxCorr = Math.max(maxCorr, Math.abs(corr));
    }
    totalPeakToMean += maxCorr;
  }
  const avgPeak = totalPeakToMean / DIRECTIONS;
  // Smooth surfaces (TPMS, organic geometry) inherently have high short-lag autocorrelation
  // (~0.7-0.9). Banding artifacts push above 0.95. Only flag extreme values.
  const score = Math.max(0, Math.min(1, 1.0 - Math.max(0, avgPeak - 0.7) / 0.3));
  return { id: 'FC-3b', name: 'Radial Autocorrelation', score, rawValue: avgPeak };
}

/**
 * FC-4: Hue variance (color diversity).
 * Measures circular variance of hue across non-dark lattice pixels.
 * Higher variance = more distinct hues = better.
 */
export function fc4HueVariance(buf: Buffer, w: number, h: number): FitnessScore {
  let sinSum = 0, cosSum = 0, count = 0;
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const lum = luminanceAt(buf, idx);
    if (lum < 15) continue; // skip dark background
    const [hue] = rgbToHsl(buf[idx], buf[idx + 1], buf[idx + 2]);
    const rad = (hue * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
    count++;
  }
  if (count === 0) return { id: 'FC-4', name: 'Hue Variance', score: 0, rawValue: 0 };
  const meanLen = Math.sqrt((sinSum / count) ** 2 + (cosSum / count) ** 2);
  const circularVariance = 1 - meanLen; // 0 = all same hue, 1 = uniform distribution
  // Score: map [0, 0.8] -> [0, 1]
  const score = Math.min(1, circularVariance / 0.8);
  return { id: 'FC-4', name: 'Hue Variance', score, rawValue: circularVariance };
}

/**
 * FC-5: Highlight area variance (specular consistency).
 * Finds connected highlight regions (luminance > 200), measures area uniformity.
 * Low coefficient of variation = consistent highlight sizes = good.
 */
export function fc5HighlightVariance(buf: Buffer, w: number, h: number): FitnessScore {
  const THRESHOLD = 200;
  // Binarize
  const binary = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    binary[i] = luminanceAt(buf, i * 4) > THRESHOLD ? 1 : 0;
  }
  // Connected components via flood fill
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const areas: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (binary[idx] === 0 || labels[idx] !== 0) continue;
      // BFS flood fill
      const queue = [idx];
      labels[idx] = nextLabel;
      let area = 0;
      while (queue.length > 0) {
        const cur = queue.pop()!;
        area++;
        const cx = cur % w, cy = Math.floor(cur / w);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (binary[ni] === 1 && labels[ni] === 0) {
            labels[ni] = nextLabel;
            queue.push(ni);
          }
        }
      }
      if (area >= 4) areas.push(area); // ignore tiny noise clusters
      nextLabel++;
    }
  }
  // For TPMS surfaces, highlight SIZE variation is expected (varying curvature).
  // What matters: highlights exist, are distributed (not clustered), and have reasonable coverage.
  const totalHighlightPixels = areas.reduce((a, b) => a + b, 0);
  const coverage = totalHighlightPixels / (w * h); // fraction of image that's highlight
  const regionCount = areas.length;
  // Score based on: having multiple highlight regions with non-trivial coverage
  // 0 regions = 0, 1 region = 0.3, 3+ regions = good, coverage 0.1-5% = sweet spot
  const countScore = Math.min(1, regionCount / 5); // peaks at 5+ regions
  const coverageScore = coverage < 0.001 ? coverage / 0.001
    : coverage <= 0.08 ? 1.0
    : Math.max(0, 1.0 - (coverage - 0.08) / 0.2); // too much highlight = blown out
  const score = countScore * 0.6 + coverageScore * 0.4;
  return { id: 'FC-5', name: 'Highlight Variance', score, rawValue: coverage };
}

/**
 * FC-6: Silhouette brightness (edge definition).
 * Applies Sobel filter, measures mean luminance at high-gradient edges.
 * Bright edges = well-defined silhouettes = good.
 */
export function fc6SilhouetteBrightness(buf: Buffer, w: number, h: number): FitnessScore {
  // Compute Sobel gradient magnitude
  const gradMag = new Float32Array(w * h);
  let maxGrad = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = luminanceAt(buf, ((y - 1) * w + (x - 1)) * 4);
      const t  = luminanceAt(buf, ((y - 1) * w + x) * 4);
      const tr = luminanceAt(buf, ((y - 1) * w + (x + 1)) * 4);
      const ml = luminanceAt(buf, (y * w + (x - 1)) * 4);
      const mr = luminanceAt(buf, (y * w + (x + 1)) * 4);
      const bl = luminanceAt(buf, ((y + 1) * w + (x - 1)) * 4);
      const b  = luminanceAt(buf, ((y + 1) * w + x) * 4);
      const br = luminanceAt(buf, ((y + 1) * w + (x + 1)) * 4);
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      gradMag[y * w + x] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }
  if (maxGrad < 1) return { id: 'FC-6', name: 'Silhouette Brightness', score: 0, rawValue: 0 };
  // Average luminance at edge pixels (gradient > 50% of max)
  const edgeThreshold = maxGrad * 0.5;
  let edgeLumSum = 0, edgeCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (gradMag[y * w + x] > edgeThreshold) {
        edgeLumSum += luminanceAt(buf, (y * w + x) * 4);
        edgeCount++;
      }
    }
  }
  const avgEdgeLum = edgeCount > 0 ? edgeLumSum / edgeCount : 0;
  const score = avgEdgeLum / 255;
  return { id: 'FC-6', name: 'Silhouette Brightness', score, rawValue: avgEdgeLum };
}

/**
 * FC-8: Radial luminance gradient (fog/depth falloff).
 * Measures luminance falloff from center to edge in concentric rings.
 * A smooth gradual falloff = good depth cue.
 */
export function fc8RadialGradient(buf: Buffer, w: number, h: number): FitnessScore {
  const cx = w / 2, cy = h / 2;
  const maxR = Math.min(cx, cy) * 0.95;
  const RINGS = 10;
  // Single-pass ring assignment — O(n) instead of O(n * RINGS)
  const ringLumSum = new Float64Array(RINGS);
  const ringCount = new Int32Array(RINGS);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = distFromCenter(x, y, w, h);
      if (dist >= maxR) continue;
      const ring = Math.min(RINGS - 1, Math.floor((dist / maxR) * RINGS));
      ringLumSum[ring] += luminanceAt(buf, (y * w + x) * 4);
      ringCount[ring]++;
    }
  }
  const ringLum = Array.from({ length: RINGS }, (_, i) =>
    ringCount[i] > 0 ? ringLumSum[i] / ringCount[i] : 0,
  );
  // Linear regression: luminance vs ring index
  const n = ringLum.length;
  const xMean = (n - 1) / 2;
  const yMean = ringLum.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ringLum[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  // Negative slope = dimmer at edges = fog effect. Normalize slope to 0-1 score.
  // Real shader data: atmoFog=0.15 produces slope ~0.5-1.0 per ring. Heavy fog ~5-10.
  // Sweet spot: any detectable negative slope (>0.2) up to moderate fog (<8).
  const absSlope = Math.abs(slope);
  const score = absSlope < 0.1 ? absSlope / 0.3 // nearly flat = no fog
    : absSlope <= 8 ? Math.min(1, 0.4 + 0.6 * Math.min(1, absSlope / 2)) // gentle to moderate
    : Math.max(0, 1.0 - (absSlope - 8) / 10); // too steep = fog overwhelming
  return { id: 'FC-8', name: 'Radial Gradient', score: Math.max(0, Math.min(1, score)), rawValue: slope };
}

/**
 * FC-10: Hue shift across lattice (spatial color variation).
 * Samples dominant hue at 4 quadrants, measures angular spread.
 * Controlled spread (30-60 degrees) = good spatial color variation.
 */
export function fc10HueShift(buf: Buffer, w: number, h: number): FitnessScore {
  const cx = w / 2, cy = h / 2;
  const quadrants = [
    [Math.round(cx * 0.5), Math.round(cy * 0.5)],
    [Math.round(cx * 1.5), Math.round(cy * 0.5)],
    [Math.round(cx * 0.5), Math.round(cy * 1.5)],
    [Math.round(cx * 1.5), Math.round(cy * 1.5)],
  ];
  const REGION = 10;
  const hues: number[] = [];
  for (const [qx, qy] of quadrants) {
    let sinSum = 0, cosSum = 0, count = 0;
    for (let dy = -REGION; dy <= REGION; dy++) {
      for (let dx = -REGION; dx <= REGION; dx++) {
        const x = Math.min(w - 1, Math.max(0, qx + dx));
        const y = Math.min(h - 1, Math.max(0, qy + dy));
        const idx = (y * w + x) * 4;
        const lum = luminanceAt(buf, idx);
        if (lum < 15) continue;
        const [hue] = rgbToHsl(buf[idx], buf[idx + 1], buf[idx + 2]);
        sinSum += Math.sin((hue * Math.PI) / 180);
        cosSum += Math.cos((hue * Math.PI) / 180);
        count++;
      }
    }
    if (count > 0) {
      hues.push(Math.atan2(sinSum / count, cosSum / count) * (180 / Math.PI));
    }
  }
  if (hues.length < 2) return { id: 'FC-10', name: 'Hue Shift', score: 0, rawValue: 0 };
  // Compute max angular distance between any two quadrants
  let maxSpread = 0;
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      let diff = Math.abs(hues[i] - hues[j]);
      if (diff > 180) diff = 360 - diff;
      maxSpread = Math.max(maxSpread, diff);
    }
  }
  // Sweet spot: 20-175 degrees. Multi-domain TPMS uses 4 distinct palettes,
  // legitimately producing 100-175 degree spread. Only near-uniform (>178) is noise.
  const score = maxSpread < 5 ? maxSpread / 20
    : maxSpread <= 175 ? Math.min(1, 0.25 + 0.75 * ((maxSpread - 5) / 170))
    : Math.max(0, 1.0 - (maxSpread - 175) / 5);
  return { id: 'FC-10', name: 'Hue Shift', score, rawValue: maxSpread };
}

/**
 * FC-11: Domain boundary discontinuity.
 * Measures gradient magnitude discontinuity — sharp jumps indicate harsh boundaries.
 * Low discontinuity = smooth domain transitions = good.
 */
export function fc11BoundaryDiscontinuity(buf: Buffer, w: number, h: number): FitnessScore {
  // Compute gradient magnitude via Sobel (reuse FC-6 pattern)
  const gradMag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = luminanceAt(buf, ((y - 1) * w + (x - 1)) * 4);
      const t  = luminanceAt(buf, ((y - 1) * w + x) * 4);
      const tr = luminanceAt(buf, ((y - 1) * w + (x + 1)) * 4);
      const ml = luminanceAt(buf, (y * w + (x - 1)) * 4);
      const mr = luminanceAt(buf, (y * w + (x + 1)) * 4);
      const bl = luminanceAt(buf, ((y + 1) * w + (x - 1)) * 4);
      const b  = luminanceAt(buf, ((y + 1) * w + x) * 4);
      const br = luminanceAt(buf, ((y + 1) * w + (x + 1)) * 4);
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      gradMag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  // Second derivative of gradient magnitude (Laplacian of gradient)
  // High Laplacian = sudden change in gradient = boundary discontinuity
  let discSum = 0, discCount = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const center = gradMag[y * w + x];
      const lap = gradMag[(y - 1) * w + x] + gradMag[(y + 1) * w + x]
        + gradMag[y * w + (x - 1)] + gradMag[y * w + (x + 1)] - 4 * center;
      if (Math.abs(lap) > 50) { // significant discontinuity
        discSum += Math.abs(lap);
        discCount++;
      }
    }
  }
  const meanDisc = discCount > 0 ? discSum / discCount : 0;
  // Low discontinuity = good. Score: 1/(1 + meanDisc/100)
  const score = 1.0 / (1.0 + meanDisc / 100);
  return { id: 'FC-11', name: 'Boundary Discontinuity', score, rawValue: meanDisc };
}

/**
 * FC-12: Edge alpha smoothness.
 * Samples luminance profiles at sphere boundary (92-100% radius).
 * Smooth fade = good. Abrupt cutoff = bad.
 */
export function fc12EdgeSmoothness(buf: Buffer, w: number, h: number): FitnessScore {
  const cx = w / 2, cy = h / 2;
  const maxR = Math.min(cx, cy);
  const innerR = maxR * 0.85;
  const outerR = maxR * 1.0;
  const PROFILES = 16;
  const SAMPLES = 8;
  let smoothnessSum = 0;

  for (let p = 0; p < PROFILES; p++) {
    const angle = (p * Math.PI * 2) / PROFILES;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const samples: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const r = innerR + (s / (SAMPLES - 1)) * (outerR - innerR);
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      if (x >= 0 && x < w && y >= 0 && y < h) {
        samples.push(luminanceAt(buf, (y * w + x) * 4));
      }
    }
    if (samples.length < 3) continue;
    // Measure monotonicity: how consistently does luminance decrease?
    let monotoneSteps = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] <= samples[i - 1] + 5) monotoneSteps++; // allow small noise
    }
    smoothnessSum += monotoneSteps / (samples.length - 1);
  }
  const score = smoothnessSum / PROFILES;
  return { id: 'FC-12', name: 'Edge Smoothness', score, rawValue: smoothnessSum };
}

// --- Aggregate ---

const ALL_METRICS = [
  fc1BackgroundCheck,
  fc3aLuminanceRatio,
  fc3bRadialAutocorrelation,
  fc4HueVariance,
  fc5HighlightVariance,
  fc6SilhouetteBrightness,
  fc8RadialGradient,
  fc10HueShift,
  fc11BoundaryDiscontinuity,
  fc12EdgeSmoothness,
] as const;

/**
 * Run all 10 fitness metrics on a screenshot.
 * Input: PNG file path or raw RGBA buffer + dimensions.
 */
export async function evaluateScreenshot(input: string | { buf: Buffer; width: number; height: number }): Promise<FitnessReport> {
  const start = performance.now();
  let buf: Buffer, width: number, height: number;

  if (typeof input === 'string') {
    const img = sharp(input).ensureAlpha();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) {
      throw new Error(`evaluateScreenshot: could not read dimensions from "${input}"`);
    }
    width = meta.width;
    height = meta.height;
    buf = await img.raw().toBuffer();
  } else {
    buf = input.buf;
    width = input.width;
    height = input.height;
  }

  const scores = ALL_METRICS.map((fn) => fn(buf, width, height));
  const totalMs = performance.now() - start;
  return { scores, totalMs };
}
