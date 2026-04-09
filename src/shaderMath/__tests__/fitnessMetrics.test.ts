/**
 * Fitness Metrics — Calibration & Unit Tests
 *
 * Phase 3A calibration: synthetic "good" vs "bad" images must produce
 * measurably different scores on 3+ metrics (>5% difference).
 * This is the Glass Sculpture test for Phase 3.
 *
 * Test count tracked separately from the 396 shader math baseline.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateScreenshot,
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
} from './fitnessMetrics';

// --- Synthetic image generators ---

const W = 128, H = 128;

/**
 * Generate a "good" synthetic TPMS-like image:
 * - Dark corners (background < 20)
 * - Bright sphere-like center with gradient falloff
 * - Multiple hues (warm/cool variation across quadrants)
 * - Smooth edges at sphere boundary
 * - Some highlight regions
 */
function generateGoodImage(): Buffer {
  const buf = Buffer.alloc(W * H * 4);
  const cx = W / 2, cy = H / 2;
  const maxR = Math.min(cx, cy) * 0.85;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist > maxR * 1.05) {
        // Background: dark
        buf[idx] = buf[idx + 1] = buf[idx + 2] = 5;
      } else if (dist > maxR * 0.92) {
        // Edge fade: smooth transition
        const t = (dist - maxR * 0.92) / (maxR * 0.13);
        const fade = 1 - t * t; // quadratic fade
        const base = 80 + 60 * fade;
        buf[idx] = Math.round(base * (x > cx ? 1.1 : 0.9));
        buf[idx + 1] = Math.round(base * 0.95);
        buf[idx + 2] = Math.round(base * (x > cx ? 0.85 : 1.15));
      } else {
        // Interior: varied hues, gradient from center
        const radialFade = 1 - (dist / maxR) * 0.4; // gentle falloff
        const hueAngle = Math.atan2(y - cy, x - cx);
        const hueShift = Math.sin(hueAngle) * 30;
        // Base warm color with quadrant variation
        const r = Math.round(Math.min(255, (120 + hueShift + 20 * Math.sin(x * 0.1)) * radialFade));
        const g = Math.round(Math.min(255, (100 - hueShift * 0.3 + 15 * Math.cos(y * 0.1)) * radialFade));
        const b = Math.round(Math.min(255, (90 + hueShift * 0.5 + 10 * Math.sin((x + y) * 0.08)) * radialFade));
        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        // Add some highlight spots
        if (dist < maxR * 0.3 && (x % 17 < 3) && (y % 19 < 3)) {
          buf[idx] = Math.min(255, r + 100);
          buf[idx + 1] = Math.min(255, g + 100);
          buf[idx + 2] = Math.min(255, b + 100);
        }
      }
      buf[idx + 3] = 255; // alpha
    }
  }
  return buf;
}

/**
 * Generate a "bad" synthetic image (degraded preset equivalent):
 * - Bright corners (background NOT dark)
 * - Flat, monochrome center (no hue variation)
 * - Sharp edges (no smooth fade)
 * - No highlights or uniform highlights
 * - No radial gradient (flat luminance)
 */
function generateBadImage(): Buffer {
  const buf = Buffer.alloc(W * H * 4);
  const cx = W / 2, cy = H / 2;
  const maxR = Math.min(cx, cy) * 0.85;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist > maxR) {
        // Background: too bright (fails FC-1, threshold is 55)
        buf[idx] = buf[idx + 1] = buf[idx + 2] = 80;
      } else {
        // Interior: flat monochrome (fails FC-4 hue, FC-8 gradient)
        const flatLum = 128;
        buf[idx] = flatLum;
        buf[idx + 1] = flatLum;
        buf[idx + 2] = flatLum;
      }
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

// --- Unit tests per metric ---

describe('fitnessMetrics unit tests', () => {
  const goodBuf = generateGoodImage();
  const badBuf = generateBadImage();

  describe('FC-1: Background Check', () => {
    it('good image passes (dark corners)', () => {
      const result = fc1BackgroundCheck(goodBuf, W, H);
      expect(result.score).toBe(1.0);
    });

    it('bad image fails (bright corners)', () => {
      const result = fc1BackgroundCheck(badBuf, W, H);
      expect(result.score).toBe(0.0);
    });
  });

  describe('FC-3a: Luminance Ratio', () => {
    it('good image has meaningful luminance spread', () => {
      const result = fc3aLuminanceRatio(goodBuf, W, H);
      expect(result.score).toBeGreaterThan(0.1);
      expect(result.rawValue).toBeGreaterThan(1.0);
    });

    it('bad image has flat luminance', () => {
      const result = fc3aLuminanceRatio(badBuf, W, H);
      // Flat image has ratio near 1 (all same luminance) — different from good
      expect(result.rawValue).toBeLessThan(5);
    });
  });

  describe('FC-3b: Radial Autocorrelation', () => {
    it('returns valid score for good image', () => {
      const result = fc3bRadialAutocorrelation(goodBuf, W, H);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('FC-4: Hue Variance', () => {
    it('good image has hue diversity', () => {
      const result = fc4HueVariance(goodBuf, W, H);
      expect(result.score).toBeGreaterThan(0.1);
    });

    it('bad image has no hue diversity (monochrome)', () => {
      const result = fc4HueVariance(badBuf, W, H);
      expect(result.score).toBeLessThan(0.15);
    });
  });

  describe('FC-5: Highlight Variance', () => {
    it('returns valid score', () => {
      const result = fc5HighlightVariance(goodBuf, W, H);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('FC-6: Silhouette Brightness', () => {
    it('good image has bright edges', () => {
      const result = fc6SilhouetteBrightness(goodBuf, W, H);
      expect(result.score).toBeGreaterThan(0.1);
    });
  });

  describe('FC-8: Radial Gradient', () => {
    it('good image has radial falloff', () => {
      const result = fc8RadialGradient(goodBuf, W, H);
      expect(result.rawValue).toBeLessThan(0); // negative slope = dimmer at edges
    });

    it('bad image has flat radial profile', () => {
      const result = fc8RadialGradient(badBuf, W, H);
      // Flat interior with hard cutoff — different gradient shape
      expect(Math.abs(result.rawValue)).toBeLessThan(Math.abs(
        fc8RadialGradient(goodBuf, W, H).rawValue) * 3);
    });
  });

  describe('FC-10: Hue Shift', () => {
    it('good image has spatial hue variation', () => {
      const result = fc10HueShift(goodBuf, W, H);
      expect(result.rawValue).toBeGreaterThan(5); // some spread in degrees
    });

    it('bad image has zero hue shift (monochrome)', () => {
      const result = fc10HueShift(badBuf, W, H);
      expect(result.rawValue).toBeLessThan(5);
    });
  });

  describe('FC-11: Boundary Discontinuity', () => {
    it('returns valid score', () => {
      const result = fc11BoundaryDiscontinuity(goodBuf, W, H);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('FC-12: Edge Smoothness', () => {
    it('good image has smooth sphere edge', () => {
      const result = fc12EdgeSmoothness(goodBuf, W, H);
      expect(result.score).toBeGreaterThan(0.3);
    });
  });
});

// --- Calibration test: the Glass Sculpture test for Phase 3 ---

describe('fitnessMetrics calibration', () => {
  it('good image scores measurably better than bad on 3+ metrics (>5%)', () => {
    const goodBuf = generateGoodImage();
    const badBuf = generateBadImage();

    const goodScores = [
      fc1BackgroundCheck(goodBuf, W, H),
      fc3aLuminanceRatio(goodBuf, W, H),
      fc3bRadialAutocorrelation(goodBuf, W, H),
      fc4HueVariance(goodBuf, W, H),
      fc5HighlightVariance(goodBuf, W, H),
      fc6SilhouetteBrightness(goodBuf, W, H),
      fc8RadialGradient(goodBuf, W, H),
      fc10HueShift(goodBuf, W, H),
      fc11BoundaryDiscontinuity(goodBuf, W, H),
      fc12EdgeSmoothness(goodBuf, W, H),
    ];

    const badScores = [
      fc1BackgroundCheck(badBuf, W, H),
      fc3aLuminanceRatio(badBuf, W, H),
      fc3bRadialAutocorrelation(badBuf, W, H),
      fc4HueVariance(badBuf, W, H),
      fc5HighlightVariance(badBuf, W, H),
      fc6SilhouetteBrightness(badBuf, W, H),
      fc8RadialGradient(badBuf, W, H),
      fc10HueShift(badBuf, W, H),
      fc11BoundaryDiscontinuity(badBuf, W, H),
      fc12EdgeSmoothness(badBuf, W, H),
    ];

    // Count metrics where good > bad by at least 5%
    let betterCount = 0;
    const details: string[] = [];
    for (let i = 0; i < goodScores.length; i++) {
      const diff = goodScores[i].score - badScores[i].score;
      const pct = Math.abs(diff) * 100;
      const better = diff > 0.05;
      if (better) betterCount++;
      details.push(
        `  ${goodScores[i].id}: good=${goodScores[i].score.toFixed(3)} bad=${badScores[i].score.toFixed(3)} diff=${(diff * 100).toFixed(1)}% ${better ? 'BETTER' : ''}`,
      );
    }

    if (betterCount < 3) {
      throw new Error(
        `Calibration FAILED: good image only scored better on ${betterCount}/10 metrics (need 3+).\n` +
        details.join('\n'),
      );
    }
    expect(betterCount).toBeGreaterThanOrEqual(3);
  });

  it('evaluateScreenshot aggregates all 10 metrics', async () => {
    const buf = generateGoodImage();
    const report = await evaluateScreenshot({ buf, width: W, height: H });
    expect(report.scores).toHaveLength(10);
    expect(report.totalMs).toBeGreaterThanOrEqual(0);
    for (const s of report.scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });
});
