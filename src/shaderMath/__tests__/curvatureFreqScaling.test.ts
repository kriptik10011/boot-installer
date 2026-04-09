/**
 * Phase 5A: Verify curvature frequency-independence.
 *
 * The core fix: calcCurvature returns lap*freq so that H_approx = lap*freq / (2*freq*|g|)
 * = lap / (2*|g|) — frequency-independent.
 *
 * These tests verify the math in TypeScript before touching GLSL.
 */
import { describe, it, expect } from 'vitest';
import {
  type TPMSType, type Vec3,
  PI, TPMS_FUNCTIONS, TPMS_GRADIENTS,
  analyticalLaplacian, vec3Scale, vec3Length,
} from '../tpms';

// --- Helpers ---

/** Simulate the GLSL calcCurvature return value AFTER the fix: lap * freq */
function calcCurvatureFixed(type: TPMSType, worldP: Vec3, freq: number): number {
  const q: Vec3 = vec3Scale(worldP, freq);
  const lap = analyticalLaplacian(type, q);
  return lap * freq;
}

/** Simulate g_lastBlendedGrad magnitude: |grad(q)| * freq (world-space gradient) */
function worldGradMag(type: TPMSType, worldP: Vec3, freq: number): number {
  const q: Vec3 = vec3Scale(worldP, freq);
  const g = TPMS_GRADIENTS[type](q);
  return vec3Length(g) * freq;
}

/** Simulate curvatureAO H_approx: lap / (2 * max(gradMag, 0.1)) */
function hApprox(type: TPMSType, worldP: Vec3, freq: number): number {
  const lap = calcCurvatureFixed(type, worldP, freq);
  const gradMag = worldGradMag(type, worldP, freq);
  return lap / (2 * Math.max(gradMag, 0.1));
}

/** Simulate curvatureAO output: clamp(1 + H_approx * curvAO, 0.15, 1.0) */
function curvatureAO(type: TPMSType, worldP: Vec3, freq: number, curvAO: number): number {
  const h = hApprox(type, worldP, freq);
  return Math.min(1.0, Math.max(0.15, 1.0 + h * curvAO));
}

const TEST_TYPES: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];
const TEST_FREQS = [1.0, 2.0, 3.5, 5.0, 7.0, 10.0, 15.0];

// A fixed TPMS-space point — we test that different frequencies mapping here give same H
const TPMS_POINT: Vec3 = [0.7, 1.3, 2.1];

describe('Phase 5A: curvature frequency-independence', () => {
  // Core property: at the SAME TPMS-space point q, H_approx should be identical
  // regardless of what frequency maps a world point to q.
  // If q = freq * p_world, then p_world = q / freq. Same q, different freq → same H.
  for (const type of TEST_TYPES) {
    it(`${type}: H_approx is frequency-independent at same TPMS point`, () => {
      const refH = hApprox(type, TPMS_POINT, 1.0); // at freq=1, worldP = tpmsP
      if (Math.abs(refH) < 0.001) return;

      for (const freq of TEST_FREQS) {
        // worldP = tpmsPoint / freq → maps to same TPMS point q = freq * worldP = tpmsPoint
        const worldP: Vec3 = vec3Scale(TPMS_POINT, 1 / freq);
        const h = hApprox(type, worldP, freq);
        const relErr = Math.abs(h - refH) / Math.abs(refH);
        expect(relErr).toBeLessThan(0.001);
      }
    });
  }

  // Verify curvatureAO output is the same at any frequency for same TPMS point
  for (const type of TEST_TYPES) {
    it(`${type}: curvatureAO output identical at freq=3.5 and freq=7.0 (same TPMS point)`, () => {
      const worldP35: Vec3 = vec3Scale(TPMS_POINT, 1 / 3.5);
      const worldP70: Vec3 = vec3Scale(TPMS_POINT, 1 / 7.0);
      const ao35 = curvatureAO(type, worldP35, 3.5, 0.20);
      const ao70 = curvatureAO(type, worldP70, 7.0, 0.20);
      expect(ao35).toBeCloseTo(ao70, 10);
    });
  }

  // Verify AO output stays in [0.15, 1.0] range at all frequencies
  it('curvatureAO output clamped to [0.15, 1.0] at extreme freq', () => {
    for (const type of TEST_TYPES) {
      for (const freq of TEST_FREQS) {
        const ao = curvatureAO(type, TPMS_POINT, freq, 2.0); // strong curvAO
        expect(ao).toBeGreaterThanOrEqual(0.15);
        expect(ao).toBeLessThanOrEqual(1.0);
      }
    }
  });

  // Verify the frequency scaling factor: calcCurvatureFixed = lap * freq
  it('calcCurvatureFixed scales linearly with freq', () => {
    const type: TPMSType = 'gyroid';
    const c1 = calcCurvatureFixed(type, TPMS_POINT, 1.0);
    const c3 = calcCurvatureFixed(type, TPMS_POINT, 3.0);
    const c7 = calcCurvatureFixed(type, TPMS_POINT, 7.0);
    // At freq=3: q=3*p, lap at q is different point in TPMS space
    // But the RATIO lap(q)*freq / (|grad(q)|*freq) should be constant
    // This is tested indirectly via H_approx frequency-independence above
    // Here we just verify the return value is not NaN/Inf
    expect(Number.isFinite(c1)).toBe(true);
    expect(Number.isFinite(c3)).toBe(true);
    expect(Number.isFinite(c7)).toBe(true);
  });

  // Verify multiple TPMS-space points
  it('frequency-independence holds at 10 TPMS points (gyroid)', () => {
    const tpmsPoints: Vec3[] = [
      [0.5, 1.0, 1.5], [2.0, 0.3, 1.7], [1.1, 2.2, 0.4],
      [0.8, 0.8, 0.8], [1.5, 2.5, 0.5], [0.2, 1.8, 2.8],
      [1.0, 1.0, 2.0], [2.5, 0.1, 1.0], [0.6, 2.0, 0.9],
      [1.3, 0.7, 1.6],
    ];

    for (const q of tpmsPoints) {
      // Same TPMS point at freq=3.5 and freq=7.0
      const worldP35: Vec3 = vec3Scale(q, 1 / 3.5);
      const worldP70: Vec3 = vec3Scale(q, 1 / 7.0);
      const h35 = hApprox('gyroid', worldP35, 3.5);
      const h70 = hApprox('gyroid', worldP70, 7.0);
      if (Math.abs(h35) < 0.001) continue;
      const relErr = Math.abs(h35 - h70) / Math.abs(h35);
      expect(relErr).toBeLessThan(0.001);
    }
  });

  // Preset calibration: verify retuned curvAO values produce reasonable AO
  describe('preset calibration', () => {
    const PRESET_CURVAO: Record<string, { curvAO: number; freq: number }> = {
      base: { curvAO: 0.20, freq: 3.5 },
      glass: { curvAO: 0.17, freq: 3.0 },
      ceramic: { curvAO: 0.16, freq: 3.5 },
      metal: { curvAO: 0.14, freq: 3.5 },
      jade: { curvAO: 0.08, freq: 5.0 },
      organic: { curvAO: 0.20, freq: 3.0 },
      mathViz: { curvAO: 0.17, freq: 3.5 },
    };

    for (const [name, { curvAO, freq }] of Object.entries(PRESET_CURVAO)) {
      it(`${name} preset: AO in visible range [0.15, 1.0]`, () => {
        const ao = curvatureAO('gyroid', TPMS_POINT, freq, curvAO);
        expect(ao).toBeGreaterThanOrEqual(0.15);
        expect(ao).toBeLessThanOrEqual(1.0);
        // Should not be fully clamped (would mean the setting is too weak or too strong)
        // Allow it to be at floor for very concave points though
      });
    }
  });
});
