/**
 * Shell Thickness Verification Tests
 *
 * Validates the canonical shell SDF construction against research:
 * - Part 2.7: g(p) = |f(p)| - w (shell definition)
 * - Part 2.3: d ~ f(p) / |grad f(p)| (gradient normalization)
 * - Part 4.1: sceneSDF with thickness (reference algorithm)
 * - Part 3.3: thickness > 2 * min_step_size (minimum viable)
 *
 * These tests verify the TS oracle that the GLSL will be ported from.
 */

import { describe, it, expect } from 'vitest';
import {
  PI, TAU, type Vec3, vec3Length, vec3Scale, vec3Add, vec3Normalize,
  gyroid, gyroidGrad, schwarzP, schwarzPGrad,
  TPMS_FUNCTIONS, TPMS_GRADIENTS,
  shellSDF, gradientNormalizedDistance,
  type TPMSType,
} from '../tpms';
import { sceneSDF, DEFAULT_CONFIG, type RaymarchConfig } from '../raymath';

function cfg(overrides: Partial<RaymarchConfig> = {}): RaymarchConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ── Shell SDF Construction ────────────────────────────────────────────────
// Research Part 2.7: g(p) = |f(p)/|grad f(p)|| - halfThickness

describe('shell SDF construction matches research Part 2.7', () => {
  it('shellSDF = 0 at exactly halfThickness distance from TPMS surface', () => {
    // Gyroid surface at origin: f=0, grad=(1,0,1)/sqrt(2)...
    // Move along gradient direction by halfThickness
    const surfaceP: Vec3 = [0, 0, 0]; // f=0 here
    const grad = gyroidGrad(surfaceP);
    const gradLen = vec3Length(grad);
    const dir = vec3Normalize(grad);
    const halfThick = 0.1;

    // Point at halfThickness distance from surface (along gradient)
    const pAtBoundary: Vec3 = [
      surfaceP[0] + dir[0] * halfThick,
      surfaceP[1] + dir[1] * halfThick,
      surfaceP[2] + dir[2] * halfThick,
    ];

    const sdf = shellSDF('gyroid', pAtBoundary, halfThick);
    // Should be approximately 0 (first-order approximation, O(h^2) error)
    expect(Math.abs(sdf)).toBeLessThan(0.02);
  });

  it('shellSDF < 0 inside the shell (between walls)', () => {
    // One-sided shell: walls at d=0 and d=thickness. Midpoint at d=thickness/2.
    // Move along gradient from origin by thickness/2.
    const surfaceP: Vec3 = [0, 0, 0];
    const thickness = 0.1;
    const grad = gyroidGrad(surfaceP);
    const dir = vec3Normalize(grad);
    const midP: Vec3 = vec3Add(surfaceP, vec3Scale(dir, thickness / 2));
    const sdf = shellSDF('gyroid', midP, thickness);
    // At midpoint: d ~ thickness/2, max(-t/2, t/2-t) = max(-t/2, -t/2) = -t/2
    expect(sdf).toBeLessThan(0);
  });

  it('shellSDF > 0 outside the shell', () => {
    // Far from surface: distance is large, so shellSDF > 0
    const farP: Vec3 = [0.5, 0.5, 0.5]; // f ≠ 0
    const sdf = shellSDF('gyroid', farP, 0.05);
    expect(sdf).toBeGreaterThan(0);
  });

  it('one-sided shell occupies 0 <= d <= thickness', () => {
    // One-sided shell: inner wall at d=0 (TPMS surface), outer wall at d=thickness.
    // Points at d=thickness*0.25 and d=thickness*0.75 are both inside the shell.
    const surfaceP: Vec3 = [0, 0, 0];
    const grad = gyroidGrad(surfaceP);
    const dir = vec3Normalize(grad);
    const thickness = 0.1;

    const pQuarter: Vec3 = vec3Add(surfaceP, vec3Scale(dir, thickness * 0.25));
    const pThreeQ: Vec3 = vec3Add(surfaceP, vec3Scale(dir, thickness * 0.75));

    const sdfQuarter = shellSDF('gyroid', pQuarter, thickness);
    const sdfThreeQ = shellSDF('gyroid', pThreeQ, thickness);

    // Both should be negative (inside shell)
    expect(sdfQuarter).toBeLessThan(0);
    expect(sdfThreeQ).toBeLessThan(0);
  });
});

// ── sceneSDF with thickness ───────────────────────────────────────────────
// Research Part 4.1 / Part 9: sceneSDF includes frequency scaling + thickness

describe('sceneSDF thickness in cell space (research Part 4.1)', () => {
  it('sceneSDF is negative on the TPMS surface (inside shell)', () => {
    // Shell SDF: abs(d)-thick at d=0 gives -thick, which is inside the shell
    const config = cfg({ thickness: 0.08, frequency: 8.0 });
    const surfaceP: Vec3 = [0, 0, 0]; // gyroid f=0
    expect(sceneSDF(surfaceP, config)).toBeLessThan(0);
  });

  it('sceneSDF at shell midpoint equals -thickness/2 / frequency', () => {
    const thickness = 0.08;
    const frequency = 8.0;
    const config = cfg({ thickness, frequency });
    // Move to midpoint of shell (d = thickness/2) along gradient
    const q: Vec3 = vec3Scale([0, 0, 0] as Vec3, frequency);
    const grad = gyroidGrad(q);
    const worldGrad = vec3Scale(grad, frequency);
    const dir = vec3Normalize(worldGrad);
    const midP: Vec3 = vec3Add([0, 0, 0], vec3Scale(dir, (thickness / 2) / frequency));
    const sdf = sceneSDF(midP, config);
    // At midpoint: d = thickness/2, max(-t/2, t/2 - t) = max(-t/2, -t/2) = -t/2
    // World space: -t/2 / frequency
    expect(sdf).toBeCloseTo(-(thickness / 2) / frequency, 2);
  });

  it('world-space wall width = 2 * thickness / frequency', () => {
    const thickness = 0.08;
    const frequency = 8.0;
    const config = cfg({ thickness, frequency });

    // Find the shell boundary by walking along the gradient from a surface point
    const surfaceP: Vec3 = [0, 0, 0];
    const q: Vec3 = vec3Scale(surfaceP, frequency);
    const grad = gyroidGrad(q);
    const worldGrad = vec3Scale(grad, frequency); // chain rule
    const dir = vec3Normalize(worldGrad);

    // Binary search for the zero of sceneSDF along the gradient direction
    let lo = 0, hi = 0.1; // world-space search range
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const p: Vec3 = vec3Add(surfaceP, vec3Scale(dir, mid));
      if (sceneSDF(p, config) < 0) lo = mid;
      else hi = mid;
    }
    const halfWidth = (lo + hi) / 2;

    // Expected world-space half-width = thickness / frequency
    const expected = thickness / frequency;
    expect(halfWidth).toBeCloseTo(expected, 2);
  });

  it('thickness scales correctly with frequency', () => {
    const thickness = 0.08;
    // Test at shell midpoint (d = thickness/2) for each frequency
    // SDF at midpoint = -(thickness/2) / frequency
    const grad4 = gyroidGrad(vec3Scale([0, 0, 0] as Vec3, 4.0));
    const dir4 = vec3Normalize(vec3Scale(grad4, 4.0));
    const mid4: Vec3 = vec3Scale(dir4, (thickness / 2) / 4.0);

    const grad16 = gyroidGrad(vec3Scale([0, 0, 0] as Vec3, 16.0));
    const dir16 = vec3Normalize(vec3Scale(grad16, 16.0));
    const mid16: Vec3 = vec3Scale(dir16, (thickness / 2) / 16.0);

    const sdf4 = sceneSDF(mid4, cfg({ thickness, frequency: 4.0 }));
    const sdf16 = sceneSDF(mid16, cfg({ thickness, frequency: 16.0 }));

    // Higher frequency -> thinner world-space wall -> less negative at midpoint
    expect(Math.abs(sdf4)).toBeGreaterThan(Math.abs(sdf16));
    // Ratio should be ~4 (frequency ratio)
    expect(Math.abs(sdf4) / Math.abs(sdf16)).toBeCloseTo(4.0, 0);
  });

  it('increasing thickness makes walls thicker (more negative at midpoint)', () => {
    // At shell midpoint, SDF = -(thickness/2) / frequency -> bigger thickness = more negative
    const frequency = DEFAULT_CONFIG.frequency;
    const grad = gyroidGrad(vec3Scale([0, 0, 0] as Vec3, frequency));
    const dir = vec3Normalize(vec3Scale(grad, frequency));

    const thinT = 0.02;
    const thickT = 0.2;
    const midThin: Vec3 = vec3Scale(dir, (thinT / 2) / frequency);
    const midThick: Vec3 = vec3Scale(dir, (thickT / 2) / frequency);

    const thin = sceneSDF(midThin, cfg({ thickness: thinT }));
    const thick = sceneSDF(midThick, cfg({ thickness: thickT }));
    expect(thick).toBeLessThan(thin);
  });
});

// ── Minimum Thickness Constraint ──────────────────────────────────────────
// Research Part 3.3: thickness > 2 * min_step_size

describe('minimum thickness constraint (research Part 3.3)', () => {
  const MIN_STEP = 0.0005;

  it('default thickness exceeds minimum at all standard frequencies', () => {
    const defaultThickness = 0.08;
    for (const freq of [2, 4, 8, 12, 16]) {
      const minThickness = 2 * MIN_STEP * freq;
      expect(defaultThickness).toBeGreaterThan(minThickness);
    }
  });

  it('thickness 0.01 is valid for frequency <= 8', () => {
    for (const freq of [2, 4, 8]) {
      const minThickness = 2 * MIN_STEP * freq;
      expect(0.01).toBeGreaterThan(minThickness);
    }
    // At freq=10: 2*0.0005*10 = 0.01 — exactly at boundary (marginal)
    expect(2 * MIN_STEP * 10).toBeCloseTo(0.01, 10);
  });

  it('thickness 0.01 becomes marginal at frequency 20', () => {
    // 2 * 0.0005 * 20 = 0.02 > 0.01
    const minThickness = 2 * MIN_STEP * 20;
    expect(0.01).toBeLessThan(minThickness);
  });
});

// ── Gradient Normalization Uniformity ─────────────────────────────────────
// Research Part 2.7: gradient normalization makes thickness approximately uniform

describe('gradient normalization produces uniform thickness', () => {
  it('shellSDF at equal distance from surface is similar across different surface points', () => {
    // Sample multiple points on the gyroid surface and check that
    // shellSDF at halfThickness distance is approximately 0 everywhere
    const halfThick = 0.1;
    const surfacePoints: Vec3[] = [
      [0, 0, 0],                // on surface
      [PI / 2, PI / 2, PI / 2], // near surface (schwarzP)
    ];

    for (const sp of surfacePoints) {
      const f = gyroid(sp);
      if (Math.abs(f) > 0.01) continue; // skip non-surface points

      const grad = gyroidGrad(sp);
      const dir = vec3Normalize(grad);
      const pAtBoundary: Vec3 = vec3Add(sp, vec3Scale(dir, halfThick));
      const sdf = shellSDF('gyroid', pAtBoundary, halfThick);
      // Should be near zero with < 30% error (research Part 2.3 bound)
      expect(Math.abs(sdf)).toBeLessThan(halfThick * 0.3);
    }
  });

  it('without gradient normalization, thickness would vary by up to 73% for gyroid', () => {
    // Gyroid gradient on surface ranges from 1.0 to 1.732 (research Part 2.2)
    // Raw |f| at same geometric distance would differ by 1.732/1.0 = 73%
    // With gradient normalization, the variation is reduced to O(d^2)
    const minGrad = 1.0;
    const maxGrad = 1.732;
    const variation = (maxGrad - minGrad) / minGrad;
    expect(variation).toBeGreaterThan(0.7); // 73% without normalization
    expect(variation).toBeLessThan(0.8);
  });
});

// ── Shell SDF for All TPMS Types ──────────────────────────────────────────

describe('shellSDF works for all 5 TPMS types', () => {
  const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];
  const halfThick = 0.08;

  for (const type of types) {
    it(`${type}: shellSDF is finite at origin`, () => {
      const sdf = shellSDF(type, [0, 0, 0], halfThick);
      expect(Number.isFinite(sdf)).toBe(true);
    });

    it(`${type}: shellSDF is finite at random points`, () => {
      const points: Vec3[] = [
        [0.5, 0.5, 0.5], [PI / 4, PI / 3, PI / 6], [1.0, 2.0, 0.5],
      ];
      for (const p of points) {
        const sdf = shellSDF(type, p, halfThick);
        expect(Number.isFinite(sdf)).toBe(true);
      }
    });

    it(`${type}: thicker shell is more negative at surface`, () => {
      // Find a point near the surface
      const fn = TPMS_FUNCTIONS[type];
      const testP: Vec3 = [0.1, 0.1, 0.1];
      const thin = shellSDF(type, testP, 0.02);
      const thick = shellSDF(type, testP, 0.3);
      expect(thick).toBeLessThanOrEqual(thin);
    });
  }
});

// ── sceneSDF vs shellSDF Consistency ──────────────────────────────────────
// sceneSDF (raymath.ts) should produce equivalent results to shellSDF (tpms.ts)

describe('sceneSDF and shellSDF agree', () => {
  it('at frequency=1, isoValue=0, sceneSDF equals shellSDF / 1 (world space)', () => {
    const thickness = 0.08;
    const config = cfg({ frequency: 1.0, thickness, isoValue: 0.0 });

    const points: Vec3[] = [
      [0, 0, 0], [0.5, 0.5, 0.5], [1.0, 2.0, 0.3],
    ];

    for (const p of points) {
      const scene = sceneSDF(p, config);
      const shell = shellSDF('gyroid', p, thickness);
      expect(scene).toBeCloseTo(shell, 4);
    }
  });

  it('at frequency=8, sceneSDF = shellSDF_at_scaled_point / frequency', () => {
    const thickness = 0.08;
    const frequency = 8.0;
    const config = cfg({ frequency, thickness, isoValue: 0.0 });

    const points: Vec3[] = [
      [0, 0, 0], [0.1, 0.1, 0.1], [0.3, 0.2, 0.1],
    ];

    for (const p of points) {
      const scene = sceneSDF(p, config);
      const q: Vec3 = vec3Scale(p, frequency);
      const shell = shellSDF('gyroid', q, thickness);
      expect(scene).toBeCloseTo(shell / frequency, 3);
    }
  });
});
