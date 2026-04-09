import { describe, it, expect } from 'vitest';
import {
  PI,
  type Vec3,
  gyroid, schwarzP, diamond, neovius, iwp,
  gyroidGrad, schwarzPGrad, diamondGrad, neoviusGrad, iwpGrad,
  TPMS_FUNCTIONS, TPMS_GRADIENTS,
  vec3Length,
  type TPMSType,
} from '../tpms';

// ── Numerical Gradient (Central Differences) ──────────────────────────────

const EPS = 1e-5;

function numericalGradient(fn: (p: Vec3) => number, p: Vec3): Vec3 {
  return [
    (fn([p[0] + EPS, p[1], p[2]]) - fn([p[0] - EPS, p[1], p[2]])) / (2 * EPS),
    (fn([p[0], p[1] + EPS, p[2]]) - fn([p[0], p[1] - EPS, p[2]])) / (2 * EPS),
    (fn([p[0], p[1], p[2] + EPS]) - fn([p[0], p[1], p[2] - EPS])) / (2 * EPS),
  ];
}

// ── Test Points ───────────────────────────────────────────────────────────

const testPoints: Vec3[] = [
  [0, 0, 0],
  [1, 1, 1],
  [PI / 4, PI / 3, PI / 6],
  [2.5, 0.3, 1.7],
  [PI, PI, PI],
  [0, PI / 2, PI],
  [0.5, 1.5, 2.5],
  [PI / 6, PI / 4, PI / 3],
];

// ── Analytical vs Numerical Gradient ──────────────────────────────────────

describe('Analytical gradient vs numerical finite differences', () => {
  const gradPairs: Array<[TPMSType, (p: Vec3) => number, (p: Vec3) => Vec3]> = [
    ['gyroid', gyroid, gyroidGrad],
    ['schwarzP', schwarzP, schwarzPGrad],
    ['diamond', diamond, diamondGrad],
    ['neovius', neovius, neoviusGrad],
    ['iwp', iwp, iwpGrad],
  ];

  for (const [type, fn, gradFn] of gradPairs) {
    describe(`${type} gradient`, () => {
      for (const p of testPoints) {
        it(`matches numerical gradient at [${p.map(v => v.toFixed(2))}]`, () => {
          const analytical = gradFn(p);
          const numerical = numericalGradient(fn, p);
          expect(analytical[0]).toBeCloseTo(numerical[0], 4);
          expect(analytical[1]).toBeCloseTo(numerical[1], 4);
          expect(analytical[2]).toBeCloseTo(numerical[2], 4);
        });
      }
    });
  }
});

// ── Gradient at Random Points (Bulk Verification) ─────────────────────────

describe('Gradient bulk verification (200 random points)', () => {
  const randomPoints: Vec3[] = Array.from({ length: 200 }, () => [
    Math.random() * 2 * PI,
    Math.random() * 2 * PI,
    Math.random() * 2 * PI,
  ] as unknown as Vec3);

  const entries = Object.entries(TPMS_FUNCTIONS) as Array<[TPMSType, (p: Vec3) => number]>;

  for (const [type, fn] of entries) {
    it(`${type}: analytical gradient matches numerical at all 200 points`, () => {
      const gradFn = TPMS_GRADIENTS[type];
      let maxError = 0;

      for (const p of randomPoints) {
        const analytical = gradFn(p);
        const numerical = numericalGradient(fn, p);
        for (let i = 0; i < 3; i++) {
          const error = Math.abs(analytical[i] - numerical[i]);
          if (error > maxError) maxError = error;
        }
      }

      // Central difference with EPS=1e-5 should match to ~1e-4 or better
      expect(maxError).toBeLessThan(1e-3);
    });
  }
});

// ── Gradient Magnitude Bounds ─────────────────────────────────────────────
// Analytical gradient magnitude bounds for each TPMS type.

describe('Gradient magnitude global bounds', () => {
  const SAMPLES = 5000;
  const points: Vec3[] = Array.from({ length: SAMPLES }, () => [
    Math.random() * 2 * PI,
    Math.random() * 2 * PI,
    Math.random() * 2 * PI,
  ] as unknown as Vec3);

  // Global max |grad|.
  // NOTE: Research Part 2.2 bounds are for the 2-term Diamond form.
  // The 4-term Diamond form (used in our shader) has max |grad| = sqrt(3) at origin.
  const globalMaxBounds: Record<TPMSType, number> = {
    schwarzP: 1.732 + 0.01,  // sqrt(3)
    gyroid: 2.449 + 0.01,    // sqrt(6)
    diamond: 1.732 + 0.01,   // sqrt(3) — 4-term form, grad(0,0,0) = (1,1,1)
    neovius: 12.12 + 0.1,    // ~12.12
    iwp: 16.0 + 0.1,         // ~16.0
  };

  for (const [type, maxBound] of Object.entries(globalMaxBounds) as Array<[TPMSType, number]>) {
    it(`${type}: |grad| never exceeds ${maxBound.toFixed(2)}`, () => {
      const gradFn = TPMS_GRADIENTS[type];
      let maxMag = 0;

      for (const p of points) {
        const mag = vec3Length(gradFn(p));
        if (mag > maxMag) maxMag = mag;
      }

      expect(maxMag).toBeLessThanOrEqual(maxBound);
    });
  }
});

// ── Schwarzp Gradient Zero at Corners ─────────────────────────────────────

describe('Schwarz-P gradient zeros', () => {
  it('gradient is zero at lattice corners (n*pi, m*pi, k*pi)', () => {
    // sin(n*pi) = 0 for all integer n
    const corners: Vec3[] = [
      [0, 0, 0],
      [PI, 0, 0],
      [0, PI, 0],
      [PI, PI, PI],
    ];
    for (const p of corners) {
      const g = schwarzPGrad(p);
      expect(vec3Length(g)).toBeLessThan(1e-10);
    }
  });
});

// ── Gyroid Laplacian Identity ─────────────────────────────────────────────
// From research Part 5.2: For the gyroid, laplacian(f) = -2*f.
// This is because each term of the gyroid (sin/cos) satisfies d^2/dx^2 = -f.

describe('Gyroid Laplacian identity: laplacian(f) = -2*f', () => {
  const points: Vec3[] = [
    [1.2, 0.7, 2.3],
    [0.5, 1.5, 0.8],
    [2.0, 3.0, 1.0],
    [PI / 3, PI / 5, PI / 7],
  ];

  for (const p of points) {
    it(`holds at [${p.map(v => v.toFixed(2))}]`, () => {
      const h = 1e-4;
      const f0 = gyroid(p);

      // Numerical Laplacian via central differences
      const laplacian =
        (gyroid([p[0] + h, p[1], p[2]]) + gyroid([p[0] - h, p[1], p[2]])
        + gyroid([p[0], p[1] + h, p[2]]) + gyroid([p[0], p[1] - h, p[2]])
        + gyroid([p[0], p[1], p[2] + h]) + gyroid([p[0], p[1], p[2] - h])
        - 6 * f0) / (h * h);

      expect(laplacian).toBeCloseTo(-2 * f0, 2);
    });
  }
});

// ── Gradient Perpendicular to Surface ─────────────────────────────────────
// At surface points (f~0), the gradient should be non-zero (defining the normal).

describe('Gradient is non-zero on surface', () => {
  it('gyroid at origin: gradient is non-zero', () => {
    // f(0,0,0) = 0, but gradient should be non-zero
    const g = gyroidGrad([0, 0, 0]);
    expect(vec3Length(g)).toBeGreaterThan(0.5);
  });

  it('schwarzP at (pi/2,pi/2,pi/2): gradient is non-zero', () => {
    const g = schwarzPGrad([PI / 2, PI / 2, PI / 2]);
    expect(vec3Length(g)).toBeGreaterThan(0.5);
  });

  it('diamond at origin: gradient is (1,1,1), |grad| = sqrt(3)', () => {
    // For the 4-term form, grad at origin = (cx*cy*cz, cx*cy*cz, cx*cy*cz) = (1,1,1)
    // This is NOT a degenerate point despite f(0,0,0)=0
    const g = diamondGrad([0, 0, 0]);
    expect(g[0]).toBeCloseTo(1.0, 6);
    expect(g[1]).toBeCloseTo(1.0, 6);
    expect(g[2]).toBeCloseTo(1.0, 6);
    expect(vec3Length(g)).toBeCloseTo(Math.sqrt(3), 6);
  });
});
