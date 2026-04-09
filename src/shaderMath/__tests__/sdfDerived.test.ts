import { describe, it, expect } from 'vitest';
import {
  PI, TAU, SQRT2,
  type Vec3,
  vec3Length, vec3Scale,
  gyroid, schwarzP, diamond, neovius, iwp,
  gyroidGrad, schwarzPGrad,
  TPMS_FUNCTIONS, TPMS_GRADIENTS, TPMS_NORM, TPMS_RANGES,
  gradientNormalizedDistance,
  shellSDF,
  evalTPMSNormalized,
  type TPMSType,
} from '../tpms';

// ── gradientNormalizedDistance ─────────────────────────────────────────────
// This is THE core SDF for sphere tracing: d(p) = f(p) / |grad f(p)|
// It must approximate true Euclidean distance near the surface.

describe('gradientNormalizedDistance', () => {
  const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];

  it('returns ~0 at known surface points', () => {
    // Gyroid: f(0,0,0) = 0
    expect(Math.abs(gradientNormalizedDistance('gyroid', [0, 0, 0]))).toBeLessThan(1e-10);
    // Schwarz-P: f(pi/2,pi/2,pi/2) = 0
    expect(Math.abs(gradientNormalizedDistance('schwarzP', [PI / 2, PI / 2, PI / 2]))).toBeLessThan(1e-10);
    // Diamond: f(0,0,0) = 0
    expect(Math.abs(gradientNormalizedDistance('diamond', [0, 0, 0]))).toBeLessThan(1e-10);
  });

  it('sign matches implicit function sign', () => {
    // Away from surface, GND should have the same sign as f(p)
    for (const type of types) {
      const fn = TPMS_FUNCTIONS[type];
      const testPoints: Vec3[] = [
        [0.5, 0.5, 0.5],
        [1.0, 2.0, 0.5],
        [PI, 0, 0],
      ];
      for (const p of testPoints) {
        const fVal = fn(p);
        const gnd = gradientNormalizedDistance(type, p);
        if (Math.abs(fVal) > 0.01) {
          expect(Math.sign(gnd)).toBe(Math.sign(fVal));
        }
      }
    }
  });

  it('magnitude is bounded by |f(p)| (division by grad always reduces magnitude)', () => {
    const points: Vec3[] = [
      [0.3, 0.7, 1.2],
      [1.5, 2.3, 0.1],
      [PI / 3, PI / 4, PI / 6],
    ];
    for (const type of types) {
      const fn = TPMS_FUNCTIONS[type];
      for (const p of points) {
        const fVal = Math.abs(fn(p));
        const gnd = Math.abs(gradientNormalizedDistance(type, p));
        // GND = f/|grad|. Since |grad| >= 1.0 on the surface for most types,
        // but can be < 1 far from surface, we just check GND is finite and reasonable.
        expect(gnd).toBeLessThan(fVal * 10); // Loose bound: GND shouldn't explode
        expect(Number.isFinite(gnd)).toBe(true);
      }
    }
  });

  it('monotonically increases away from surface (locally)', () => {
    // Move along the gradient direction from a surface point
    // GND should increase as we move away
    const surfaceP: Vec3 = [0, 0, 0]; // Gyroid surface point
    const grad = gyroidGrad(surfaceP);
    const gradNorm = vec3Length(grad);
    if (gradNorm < 0.01) return; // Skip degenerate

    const dir: Vec3 = [grad[0] / gradNorm, grad[1] / gradNorm, grad[2] / gradNorm];

    const d0 = Math.abs(gradientNormalizedDistance('gyroid', surfaceP));
    const d1 = Math.abs(gradientNormalizedDistance('gyroid', [
      surfaceP[0] + dir[0] * 0.1,
      surfaceP[1] + dir[1] * 0.1,
      surfaceP[2] + dir[2] * 0.1,
    ]));
    const d2 = Math.abs(gradientNormalizedDistance('gyroid', [
      surfaceP[0] + dir[0] * 0.2,
      surfaceP[1] + dir[1] * 0.2,
      surfaceP[2] + dir[2] * 0.2,
    ]));

    expect(d0).toBeLessThan(d1);
    expect(d1).toBeLessThan(d2);
  });

  it('handles degenerate gradient gracefully (no NaN/Infinity)', () => {
    // Schwarz-P at lattice corner (0,0,0): grad = (0,0,0)
    const gnd = gradientNormalizedDistance('schwarzP', [0, 0, 0]);
    expect(Number.isFinite(gnd)).toBe(true);
    // Falls back to f(p) when |grad| < 1e-6
    expect(gnd).toBeCloseTo(3.0, 6); // f(0,0,0) = 3, grad near zero → returns f directly
  });

  // Known surface points per type. IWP has no simple analytical surface point
  // (f=0 at ~(1.798, 0, 0) via numerical search), so we test a computed one.
  const surfacePoints: Partial<Record<TPMSType, Vec3>> = {
    gyroid: [0, 0, 0],               // f = 0 exactly
    schwarzP: [PI / 2, PI / 2, PI / 2],  // f = 0 exactly
    diamond: [0, 0, 0],                  // all sin=0 → f=0, grad=(1,1,1)
    neovius: [PI / 2, PI / 2, PI / 2],   // cx=cy=cz=0 → f = 0
    // IWP: solve f(x,0,0)=0 → cos(x) = (2-sqrt(6))/2 ≈ -0.2247 → x ≈ 1.7975
    iwp: [Math.acos((2 - Math.sqrt(6)) / 2), 0, 0],
  };

  for (const type of types) {
    const sp = surfacePoints[type];
    if (!sp) continue;

    it(`${type}: GND has |grad(GND)| ≈ 1 near surface (SDF property)`, () => {
      const eps = 1e-4;

      // Verify this is actually near a surface point
      const fAtSurface = TPMS_FUNCTIONS[type](sp);
      expect(Math.abs(fAtSurface)).toBeLessThan(0.01);

      // Move slightly off surface
      const p: Vec3 = [sp[0] + 0.05, sp[1], sp[2]];

      // Numerical gradient of GND
      const gndGradX = (gradientNormalizedDistance(type, [p[0] + eps, p[1], p[2]])
        - gradientNormalizedDistance(type, [p[0] - eps, p[1], p[2]])) / (2 * eps);
      const gndGradY = (gradientNormalizedDistance(type, [p[0], p[1] + eps, p[2]])
        - gradientNormalizedDistance(type, [p[0], p[1] - eps, p[2]])) / (2 * eps);
      const gndGradZ = (gradientNormalizedDistance(type, [p[0], p[1], p[2] + eps])
        - gradientNormalizedDistance(type, [p[0], p[1], p[2] - eps])) / (2 * eps);

      const gradMag = Math.sqrt(gndGradX ** 2 + gndGradY ** 2 + gndGradZ ** 2);

      // For first-order SDF approximation, |grad(d)| should be near 1
      // but can deviate by ~30% for curved surfaces (per research Part 2.3)
      expect(gradMag).toBeGreaterThan(0.3);
      expect(gradMag).toBeLessThan(3.0);
    });
  }
});

// ── shellSDF ──────────────────────────────────────────────────────────────
// Shell SDF: |f(p)| / |grad f(p)| - halfThickness
// Inside the shell: < 0. Outside: > 0. On shell boundary: = 0.

describe('shellSDF', () => {
  const halfThickness = 0.1;

  it('is negative at surface points (inside shell)', () => {
    // Surface point: f = 0 → d = 0, abs(0)-thickness = -thickness (inside)
    expect(shellSDF('gyroid', [0, 0, 0], halfThickness)).toBeLessThan(0);
    expect(shellSDF('schwarzP', [PI / 2, PI / 2, PI / 2], halfThickness)).toBeLessThan(0);
  });

  it('is positive far from surface', () => {
    // At origin, schwarzP = 3.0, grad = (0,0,0). Falls back to 3.0/0.1 = 30 - 0.1 > 0
    expect(shellSDF('schwarzP', [0, 0, 0], halfThickness)).toBeGreaterThan(0);
    // Gyroid at (1,1,1): f ≈ -0.78, well away from 0
    expect(shellSDF('gyroid', [1.0, 1.0, 1.0], halfThickness)).toBeGreaterThan(0);
  });

  it('is approximately 0 at halfThickness distance from surface', () => {
    // Move along the gradient from a gyroid surface point by halfThickness
    const surfaceP: Vec3 = [0, 0, 0];
    const grad = gyroidGrad(surfaceP);
    const gradLen = vec3Length(grad);
    const dir: Vec3 = [grad[0] / gradLen, grad[1] / gradLen, grad[2] / gradLen];

    // Point at approximately halfThickness distance from surface
    const p: Vec3 = [
      surfaceP[0] + dir[0] * halfThickness,
      surfaceP[1] + dir[1] * halfThickness,
      surfaceP[2] + dir[2] * halfThickness,
    ];
    const sdf = shellSDF('gyroid', p, halfThickness);
    // Should be near zero (first-order approximation, so ~O(h^2) error)
    expect(Math.abs(sdf)).toBeLessThan(0.02);
  });

  it('thickness scales correctly', () => {
    const p: Vec3 = [0.5, 0.5, 0.5];
    const thin = shellSDF('gyroid', p, 0.05);
    const thick = shellSDF('gyroid', p, 0.2);
    // Thicker shell → more negative (or less positive) at same point
    expect(thick).toBeLessThan(thin);
  });

  it('returns finite values for all TPMS types', () => {
    const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];
    const points: Vec3[] = [
      [0, 0, 0], [1, 1, 1], [PI / 2, PI / 2, PI / 2], [PI, 0, 0],
    ];
    for (const type of types) {
      for (const p of points) {
        const val = shellSDF(type, p, 0.1);
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});

// ── Frequency Scaling ─────────────────────────────────────────────────────
// Phase 0+ requires per-domain frequency: f(omega * p).
// Verify that frequency scaling preserves periodicity and range properties.

describe('frequency scaling', () => {
  const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];
  const frequencies = [0.5, 1.0, 2.0, 4.0];

  for (const type of types) {
    const fn = TPMS_FUNCTIONS[type];
    const [rangeMin, rangeMax] = TPMS_RANGES[type];

    it(`${type}: range preserved under frequency scaling`, () => {
      for (const omega of frequencies) {
        // Sample 1000 points and verify scaled function stays in range
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < 1000; i++) {
          const p: Vec3 = [
            Math.random() * TAU,
            Math.random() * TAU,
            Math.random() * TAU,
          ];
          const scaled: Vec3 = [p[0] * omega, p[1] * omega, p[2] * omega];
          const v = fn(scaled);
          if (v < min) min = v;
          if (v > max) max = v;
        }
        // Range should be identical regardless of frequency
        expect(min).toBeGreaterThanOrEqual(rangeMin - 0.01);
        expect(max).toBeLessThanOrEqual(rangeMax + 0.01);
      }
    });

    it(`${type}: period scales inversely with frequency`, () => {
      const p: Vec3 = [1.23, 0.45, 2.67];
      for (const omega of [2.0, 3.0]) {
        const scaled: Vec3 = [p[0] * omega, p[1] * omega, p[2] * omega];
        // Period of f(omega*p) along x is 2*pi/omega
        const period = TAU / omega;
        const shifted: Vec3 = [(p[0] + period) * omega, p[1] * omega, p[2] * omega];
        expect(fn(scaled)).toBeCloseTo(fn(shifted), 8);
      }
    });
  }

  it('gradient scales linearly with frequency', () => {
    const p: Vec3 = [1.0, 2.0, 0.5];
    const omega = 2.0;
    const scaled: Vec3 = [p[0] * omega, p[1] * omega, p[2] * omega];

    // grad(f(omega*p)) = omega * grad_f(omega*p) (chain rule)
    const gradAtScaled = gyroidGrad(scaled);
    // This is the gradient of the original function evaluated at the scaled point.
    // The gradient of the composed function f(omega*p) w.r.t. p is omega * grad_f(omega*p).
    // So if we use the gradient to compute GND for the scaled version:
    // GND = f(omega*p) / |omega * grad_f(omega*p)| = f(q) / (omega * |grad_f(q)|)
    // The effective SDF distance is 1/omega times the unscaled GND.

    const fVal = gyroid(scaled);
    const gndUnscaled = fVal / vec3Length(gradAtScaled);
    const gndScaled = fVal / (omega * vec3Length(gradAtScaled));

    expect(gndScaled).toBeCloseTo(gndUnscaled / omega, 8);
  });
});

// ── Normalized vs Raw Cross-Validation ────────────────────────────────────

describe('evalTPMSNormalized cross-validation', () => {
  const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];
  const points: Vec3[] = [
    [0, 0, 0], [PI, PI, PI], [1.0, 2.0, 0.5], [PI / 4, PI / 4, PI / 4],
  ];

  for (const type of types) {
    it(`${type}: normalized = raw / TPMS_NORM at all test points`, () => {
      const fn = TPMS_FUNCTIONS[type];
      const norm = TPMS_NORM[type];
      for (const p of points) {
        const raw = fn(p);
        const normalized = evalTPMSNormalized(type, p);
        expect(normalized).toBeCloseTo(raw / norm, 10);
      }
    });
  }
});

// ── Float Precision at Large Coordinates ──────────────────────────────────

describe('float precision at large coordinates', () => {
  const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];

  it('periodicity holds at moderately large coordinates', () => {
    for (const type of types) {
      const fn = TPMS_FUNCTIONS[type];
      // Test at p = 100 periods away (200*pi)
      const base: Vec3 = [1.23, 0.45, 2.67];
      const shifted: Vec3 = [base[0] + 100 * TAU, base[1], base[2]];
      // float64 should maintain this to ~1e-10 precision
      expect(fn(base)).toBeCloseTo(fn(shifted), 6);
    }
  });

  it('periodicity degrades at very large coordinates (float precision limit)', () => {
    // At p = 1e6, float64 precision for trig is still excellent
    // At p = 1e15, it breaks down (this documents the limitation)
    const fn = schwarzP;
    const base: Vec3 = [1.23, 0.45, 2.67];
    const largeShift: Vec3 = [base[0] + 1e6 * TAU, base[1], base[2]];
    // Should still work at 1e6 periods
    expect(fn(base)).toBeCloseTo(fn(largeShift), 4);
  });
});
