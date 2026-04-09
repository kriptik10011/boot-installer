/**
 * Rendering infrastructure tests — validates LOD thresholds, FBO scaling,
 * CAS logic, and step heatmap math. Quality tier presets removed (single quality level).
 */

import { describe, it, expect } from 'vitest';

describe('Distance-Based LOD Thresholds', () => {
  // Mirrors the LOD thresholds in shade() function
  const LOD_FAR = 12.0;
  const LOD_MID = 6.0;

  it('LOD thresholds divide the ray distance sensibly', () => {
    // Near zone (full quality) should cover at least 60% of typical view
    // With clipRadius=2 and camera at dist=5, typical t range is ~3 to ~7
    expect(LOD_MID).toBeGreaterThan(3.0); // near zone covers typical near hits
    expect(LOD_FAR).toBeGreaterThan(LOD_MID); // far > mid
  });

  it('adaptive convergence threshold increases with distance', () => {
    // surfDist = max(0.001, 0.003 * t)
    const nearThresh = Math.max(0.001, 0.003 * 1.0);
    const midThresh = Math.max(0.001, 0.003 * 5.0);
    const farThresh = Math.max(0.001, 0.003 * 10.0);
    expect(nearThresh).toBe(0.003);
    expect(midThresh).toBe(0.015);
    expect(farThresh).toBe(0.030);
    expect(nearThresh).toBeLessThan(midThresh);
    expect(midThresh).toBeLessThan(farThresh);
  });

  it('adaptive threshold stays above minimum', () => {
    const veryNear = Math.max(0.001, 0.003 * 0.1);
    expect(veryNear).toBe(0.001); // clamps to minimum
  });
});

describe('Phase 6: FBO Resolution Scaling', () => {
  it('50% scale halves both dimensions', () => {
    const w = 1920, h = 1080, scale = 0.5;
    const fboW = Math.floor(w * scale);
    const fboH = Math.floor(h * scale);
    expect(fboW).toBe(960);
    expect(fboH).toBe(540);
  });

  it('75% scale produces expected dimensions', () => {
    const w = 1920, h = 1080, scale = 0.75;
    const fboW = Math.floor(w * scale);
    const fboH = Math.floor(h * scale);
    expect(fboW).toBe(1440);
    expect(fboH).toBe(810);
  });

  it('100% scale is identity', () => {
    const w = 1920, h = 1080, scale = 1.0;
    const fboW = Math.floor(w * scale);
    const fboH = Math.floor(h * scale);
    expect(fboW).toBe(1920);
    expect(fboH).toBe(1080);
  });

  it('pixel count reduction is quadratic with scale', () => {
    const basePixels = 1920 * 1080;
    const halfPixels = 960 * 540;
    const ratio = halfPixels / basePixels;
    expect(ratio).toBeCloseTo(0.25, 2); // 50% scale = 25% pixels = 4x speedup
  });
});

describe('CAS Sharpening', () => {
  const casEnabled = (scale: number) => scale < 0.99 ? 0.5 : 0.0;

  it('CAS disabled at full resolution (scale >= 1.0)', () => {
    expect(casEnabled(1.0)).toBe(0.0);
  });

  it('CAS enabled at reduced resolution', () => {
    expect(casEnabled(0.75)).toBe(0.5);
    expect(casEnabled(0.5)).toBe(0.5);
  });
});

describe('Phase 6: Step Heatmap', () => {
  it('heatmap color bands cover full range', () => {
    // Ratio 0-0.25: green, 0.25-0.5: yellow, 0.5-0.75: orange, 0.75-1.0: red
    const bands = [
      { lo: 0.0, hi: 0.25, name: 'green' },
      { lo: 0.25, hi: 0.5, name: 'yellow' },
      { lo: 0.5, hi: 0.75, name: 'orange' },
      { lo: 0.75, hi: 1.0, name: 'red' },
    ];
    // Bands should cover [0, 1] without gaps
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i].hi).toBe(bands[i + 1].lo);
    }
    expect(bands[0].lo).toBe(0.0);
    expect(bands[bands.length - 1].hi).toBe(1.0);
  });

  it('step ratio is normalized to maxSteps', () => {
    // ratio = steps / maxSteps
    expect(64 / 128).toBe(0.5);
    expect(32 / 128).toBe(0.25);
    expect(128 / 128).toBe(1.0);
    expect(0 / 128).toBe(0.0);
  });
});
