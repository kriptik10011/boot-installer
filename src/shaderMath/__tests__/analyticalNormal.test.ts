/**
 * Gate test for Layer 0: Analytical normals.
 *
 * Two test categories:
 * 1. STRICT: Analytical gradient direction matches finite-diff gradient of RAW field f.
 *    This validates the math is correct. Gate: < 0.1 degree.
 * 2. INFORMATIONAL: Analytical normal vs tetrahedron normal of SHELL SDF.
 *    These differ by a Hessian correction O(thickness * curvature).
 *    For thin shells (thick=0.1), the visual difference is negligible.
 *    Reports deviation per type but does not fail at 2 degrees.
 *
 * The visual gate is the user comparing the rendered output (must look identical).
 */
import { describe, it, expect } from 'vitest';
import {
  type TPMSType, type TPMSMode, type Vec3,
  PI, TPMS_FUNCTIONS, TPMS_GRADIENTS,
  vec3Add, vec3Scale, vec3Sub, vec3Dot, vec3Length, vec3Normalize,
  shellSDF, finiteDiffNormal, analyticalNormal, analyticalNormalCorrected,
} from '../tpms';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

function angleDeg(a: Vec3, b: Vec3): number {
  const dot = vec3Dot(a, b);
  return Math.acos(Math.min(Math.abs(dot), 1.0)) * (180 / PI);
}

const TYPES: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];

describe('Layer 0: analytical normal correctness', () => {
  // STRICT GATE: analytical gradient matches finite-diff gradient of RAW field f
  // This tests that grad(f) is mathematically correct — independent of shell construction.
  for (const type of TYPES) {
    it(`${type}: analytical gradient matches finite-diff of raw field f (< 0.1 deg)`, () => {
      const rng = seededRandom(42 + TYPES.indexOf(type));
      let maxDev = 0;
      let tested = 0;

      for (let i = 0; i < 3000 && tested < 200; i++) {
        const p: Vec3 = [rng() * 2 * PI, rng() * 2 * PI, rng() * 2 * PI];
        const g = TPMS_GRADIENTS[type](p);
        if (vec3Length(g) < 0.3) continue;

        // Finite-diff gradient of raw field f (central differences, small epsilon)
        const eps = 1e-5;
        const fn = TPMS_FUNCTIONS[type];
        const fdGrad: Vec3 = [
          (fn(vec3Add(p, [eps, 0, 0])) - fn(vec3Add(p, [-eps, 0, 0]))) / (2 * eps),
          (fn(vec3Add(p, [0, eps, 0])) - fn(vec3Add(p, [0, -eps, 0]))) / (2 * eps),
          (fn(vec3Add(p, [0, 0, eps])) - fn(vec3Add(p, [0, 0, -eps]))) / (2 * eps),
        ];

        const fdDir = vec3Normalize(fdGrad);
        const anDir = vec3Normalize(g);

        maxDev = Math.max(maxDev, angleDeg(fdDir, anDir));
        tested++;
      }

      expect(tested).toBeGreaterThanOrEqual(200);
      expect(maxDev).toBeLessThan(0.1); // must be near-exact
    });
  }

  // STRICT: mode-dependent sign convention is correct
  it('sheet mode: sign flips correctly at f=0 boundary', () => {
    // Schwarz-P: f = cos(x)+cos(y)+cos(z)
    // At (0.5, 0.5, 0.5): f > 0, normal should align with +grad
    // At (2.0, 2.0, 2.0): f < 0, normal should align with -grad
    const pPos: Vec3 = [0.5, 0.5, 0.5];
    const pNeg: Vec3 = [2.0, 2.0, 2.0];

    const fPos = TPMS_FUNCTIONS.schwarzP(pPos);
    const fNeg = TPMS_FUNCTIONS.schwarzP(pNeg);
    expect(fPos).toBeGreaterThan(0);
    expect(fNeg).toBeLessThan(0);

    const gPos = vec3Normalize(TPMS_GRADIENTS.schwarzP(pPos));
    const gNeg = vec3Normalize(TPMS_GRADIENTS.schwarzP(pNeg));
    const nPos = analyticalNormal('schwarzP', pPos, 'sheet');
    const nNeg = analyticalNormal('schwarzP', pNeg, 'sheet');

    // Positive side: normal should align with +grad
    expect(vec3Dot(nPos, gPos)).toBeGreaterThan(0.99);
    // Negative side: normal should align with -grad
    expect(vec3Dot(nNeg, gNeg)).toBeLessThan(-0.99);
  });

  it('solid modes: fixed sign convention', () => {
    const p: Vec3 = [1.0, 1.0, 1.0];
    const g = vec3Normalize(TPMS_GRADIENTS.gyroid(p));

    const nA = analyticalNormal('gyroid', p, 'networkA');
    const nB = analyticalNormal('gyroid', p, 'networkB');

    // networkA: normal = -normalize(grad), networkB: normal = +normalize(grad)
    expect(vec3Dot(nA, g)).toBeLessThan(-0.99);
    expect(vec3Dot(nB, g)).toBeGreaterThan(0.99);
  });

  // STRICT: saddle point fallback
  it('saddle point fallback returns (0,1,0), not NaN', () => {
    const n = analyticalNormal('schwarzP', [PI, PI, PI], 'sheet');
    expect(n[0]).toBe(0);
    expect(n[1]).toBe(1);
    expect(n[2]).toBe(0);
    // Verify no NaN
    expect(Number.isFinite(n[0])).toBe(true);
    expect(Number.isFinite(n[1])).toBe(true);
    expect(Number.isFinite(n[2])).toBe(true);
  });

  // INFORMATIONAL: deviation from shell SDF tetrahedron normal
  // This measures the Hessian correction term, NOT a math error.
  // Expected: O(thickness * curvature) — varies by type.
  for (const type of TYPES) {
    it(`${type}: shell SDF deviation report (informational)`, () => {
      const rng = seededRandom(100 + TYPES.indexOf(type));
      let maxDev = 0;
      let totalDev = 0;
      let tested = 0;

      for (let i = 0; i < 5000 && tested < 200; i++) {
        const p: Vec3 = [rng() * 2 * PI, rng() * 2 * PI, rng() * 2 * PI];
        const g = TPMS_GRADIENTS[type](p);
        if (vec3Length(g) < 0.3) continue;

        const sdf = shellSDF(type, p, 0.1, 'sheet');
        if (Math.abs(sdf) > 0.05) continue;

        const f = TPMS_FUNCTIONS[type](p);
        if (Math.abs(f) < 0.05) continue;

        const fdN = finiteDiffNormal(type, p, 0.1, 'sheet');
        const anN = analyticalNormal(type, p, 'sheet');

        const dev = angleDeg(fdN, anN);
        maxDev = Math.max(maxDev, dev);
        totalDev += dev;
        tested++;
      }

      // These are informational — reports the expected O(thick*curvature) deviation.
      // Gyroid/P/Diamond: typically < 5 deg max. Neovius: up to ~15 deg (high curvature).
      // All are visually negligible for thin shells in diffuse lighting.
      expect(tested).toBeGreaterThanOrEqual(50);
      // Soft gate: should not be catastrophically wrong (>30 deg = bug, not just Hessian)
      expect(maxDev).toBeLessThan(30);
    });
  }

  // STRICT GATE: Hessian-corrected normal must match shell SDF tetrahedron within 2 degrees
  // This is the Layer 0 gate. Must pass before GLSL implementation.
  for (const type of TYPES) {
    it(`${type}: Hessian-corrected normal < 2 deg from shell SDF normal`, () => {
      const rng = seededRandom(200 + TYPES.indexOf(type));
      let maxDev = 0;
      let tested = 0;

      for (let i = 0; i < 5000 && tested < 200; i++) {
        const p: Vec3 = [rng() * 2 * PI, rng() * 2 * PI, rng() * 2 * PI];
        const g = TPMS_GRADIENTS[type](p);
        if (vec3Length(g) < 0.3) continue;

        const sdf = shellSDF(type, p, 0.1, 'sheet');
        if (Math.abs(sdf) > 0.05) continue;

        const f = TPMS_FUNCTIONS[type](p);
        if (Math.abs(f) < 0.05) continue;

        const fdN = finiteDiffNormal(type, p, 0.1, 'sheet');
        const anN = analyticalNormalCorrected(type, p, 'sheet');

        maxDev = Math.max(maxDev, angleDeg(fdN, anN));
        tested++;
      }

      expect(tested).toBeGreaterThanOrEqual(100);
      expect(maxDev).toBeLessThan(2.0);
    });
  }
});
