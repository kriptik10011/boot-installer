import { describe, it, expect } from 'vitest';
import {
  PI, TAU, SQRT2,
  type Vec3,
  gyroid, schwarzP, diamond, neovius, iwp,
  TPMS_FUNCTIONS, TPMS_RANGES, TPMS_NORM,
  evalTPMSNormalized,
  type TPMSType,
} from '../tpms';

// ── Known Values ──────────────────────────────────────────────────────────

describe('TPMS functions - known values', () => {
  // Schwarz-P: cos(x) + cos(y) + cos(z)
  it('schwarzP at origin = 3', () => {
    expect(schwarzP([0, 0, 0])).toBeCloseTo(3.0, 10);
  });
  it('schwarzP at (pi,pi,pi) = -3', () => {
    expect(schwarzP([PI, PI, PI])).toBeCloseTo(-3.0, 10);
  });
  it('schwarzP at (pi/2,pi/2,pi/2) = 0 (on surface)', () => {
    expect(schwarzP([PI / 2, PI / 2, PI / 2])).toBeCloseTo(0.0, 10);
  });
  it('schwarzP at (pi,0,0) = -1+1+1 = 1', () => {
    expect(schwarzP([PI, 0, 0])).toBeCloseTo(1.0, 10);
  });

  // Gyroid (sin-first): sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
  it('gyroid at origin = 0 (on surface)', () => {
    expect(gyroid([0, 0, 0])).toBeCloseTo(0.0, 10);
  });
  it('gyroid at (pi,pi,pi) = 0', () => {
    // sin(pi)=0 for all terms
    expect(gyroid([PI, PI, PI])).toBeCloseTo(0.0, 8);
  });

  // Diamond (4-term): sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz
  it('diamond at origin = 0', () => {
    // All sin(0)=0, so all terms are 0
    expect(diamond([0, 0, 0])).toBeCloseTo(0.0, 10);
  });
  it('diamond at (pi/4,pi/4,pi/4) = sqrt(2)', () => {
    // All sin=cos=sqrt(2)/2, each term = (sqrt(2)/2)^3 = sqrt(2)/4
    // 4 terms: 4 * sqrt(2)/4 = sqrt(2)
    expect(diamond([PI / 4, PI / 4, PI / 4])).toBeCloseTo(SQRT2, 6);
  });
  it('diamond at (-pi/4,-pi/4,-pi/4) = -sqrt(2)', () => {
    expect(diamond([-PI / 4, -PI / 4, -PI / 4])).toBeCloseTo(-SQRT2, 6);
  });

  // Neovius: 3(cx+cy+cz) + 4*cx*cy*cz
  it('neovius at origin = 13', () => {
    // 3*(1+1+1) + 4*1 = 9+4 = 13
    expect(neovius([0, 0, 0])).toBeCloseTo(13.0, 10);
  });
  it('neovius at (pi,pi,pi) = -13', () => {
    // 3*(-1-1-1) + 4*(-1)(-1)(-1) = -9 + (-4) = -13
    expect(neovius([PI, PI, PI])).toBeCloseTo(-13.0, 6);
  });
  it('neovius at (pi,0,0) = -1', () => {
    // 3*(-1+1+1) + 4*(-1)(1)(1) = 3-4 = -1
    expect(neovius([PI, 0, 0])).toBeCloseTo(-1.0, 10);
  });
  it('neovius at (pi,pi,0) = 1', () => {
    // 3*(-1-1+1) + 4*(-1)(-1)(1) = -3+4 = 1
    expect(neovius([PI, PI, 0])).toBeCloseTo(1.0, 10);
  });

  // IWP (canonical): 2(cx*cy + cy*cz + cz*cx) - (cos(2x) + cos(2y) + cos(2z))
  it('iwp at origin = 3', () => {
    // 2*(1+1+1) - (1+1+1) = 6-3 = 3
    expect(iwp([0, 0, 0])).toBeCloseTo(3.0, 10);
  });
  it('iwp at (pi,pi,pi) = 3', () => {
    // cos(pi)=-1, cos(2pi)=1: 2*(1+1+1)-(1+1+1) = 3
    expect(iwp([PI, PI, PI])).toBeCloseTo(3.0, 6);
  });
  it('iwp at (pi,0,0) = -5 (global minimum)', () => {
    // cx=-1,cy=cz=1: 2*(-1+1+(-1))-(cos(2pi)+1+1) = 2*(-1)-(1+1+1) = -2-3 = -5
    expect(iwp([PI, 0, 0])).toBeCloseTo(-5.0, 6);
  });
  it('iwp at (0,pi,0) = -5 (by symmetry)', () => {
    expect(iwp([0, PI, 0])).toBeCloseTo(-5.0, 6);
  });
  it('iwp at (pi/2,pi/2,pi/2) = 3', () => {
    // cx=cy=cz=0: 2*(0+0+0) - (cos(pi)+cos(pi)+cos(pi)) = 0-(-1-1-1) = 3
    expect(iwp([PI / 2, PI / 2, PI / 2])).toBeCloseTo(3.0, 6);
  });
});

// ── Range Bounds ──────────────────────────────────────────────────────────

describe('TPMS functions - range bounds', () => {
  const SAMPLES = 10_000;
  const randomPoints = (): Vec3[] =>
    Array.from({ length: SAMPLES }, () => [
      Math.random() * TAU,
      Math.random() * TAU,
      Math.random() * TAU,
    ] as unknown as Vec3);

  // Grid search at critical points (multiples of pi/4) for more exhaustive coverage
  function gridSearchExtrema(fn: (p: Vec3) => number): { min: number; max: number } {
    let min = Infinity, max = -Infinity;
    const steps = [0, PI / 4, PI / 2, 3 * PI / 4, PI, 5 * PI / 4, 3 * PI / 2, 7 * PI / 4];
    for (const x of steps) {
      for (const y of steps) {
        for (const z of steps) {
          const v = fn([x, y, z] as Vec3);
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    return { min, max };
  }

  const entries = Object.entries(TPMS_FUNCTIONS) as Array<[TPMSType, (p: Vec3) => number]>;

  for (const [name, fn] of entries) {
    const [expectedMin, expectedMax] = TPMS_RANGES[name];

    it(`${name} Monte Carlo samples within [${expectedMin}, ${expectedMax}]`, () => {
      const pts = randomPoints();
      const vals = pts.map(fn);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      expect(min).toBeGreaterThanOrEqual(expectedMin - 0.01);
      expect(max).toBeLessThanOrEqual(expectedMax + 0.01);
    });

    it(`${name} grid search reaches near extremes`, () => {
      const { min, max } = gridSearchExtrema(fn);
      // Grid must find values within 1% of the declared range extremes
      const tolerance = 0.01 * (expectedMax - expectedMin);
      expect(max).toBeGreaterThanOrEqual(expectedMax - tolerance);
      expect(min).toBeLessThanOrEqual(expectedMin + tolerance);
    });
  }
});

// ── Periodicity ──────────────────────────────────────────────────────────

describe('TPMS functions - periodicity (period 2*pi)', () => {
  const entries = Object.entries(TPMS_FUNCTIONS) as Array<[TPMSType, (p: Vec3) => number]>;
  const testPoint: Vec3 = [1.23, 0.45, 2.67];

  for (const [name, fn] of entries) {
    it(`${name} is periodic along x`, () => {
      expect(fn(testPoint)).toBeCloseTo(fn([testPoint[0] + TAU, testPoint[1], testPoint[2]]), 10);
      expect(fn(testPoint)).toBeCloseTo(fn([testPoint[0] - TAU, testPoint[1], testPoint[2]]), 10);
    });
    it(`${name} is periodic along y`, () => {
      expect(fn(testPoint)).toBeCloseTo(fn([testPoint[0], testPoint[1] + TAU, testPoint[2]]), 10);
    });
    it(`${name} is periodic along z`, () => {
      expect(fn(testPoint)).toBeCloseTo(fn([testPoint[0], testPoint[1], testPoint[2] + TAU]), 10);
    });
  }
});

// ── Symmetry Properties ──────────────────────────────────────────────────

describe('TPMS functions - symmetry properties', () => {
  const p: Vec3 = [0.7, 1.3, 2.1];
  const np: Vec3 = [-p[0], -p[1], -p[2]];

  it('schwarzP is even: f(-p) = f(p)', () => {
    expect(schwarzP(np)).toBeCloseTo(schwarzP(p), 10);
  });

  it('gyroid is odd: f(-p) = -f(p)', () => {
    expect(gyroid(np)).toBeCloseTo(-gyroid(p), 10);
  });

  it('schwarzP has cubic symmetry: permuting axes preserves value', () => {
    expect(schwarzP([p[1], p[2], p[0]])).toBeCloseTo(schwarzP(p), 10);
    expect(schwarzP([p[2], p[0], p[1]])).toBeCloseTo(schwarzP(p), 10);
  });

  it('gyroid has cyclic symmetry: f(x,y,z) = f(y,z,x)', () => {
    expect(gyroid([p[1], p[2], p[0]])).toBeCloseTo(gyroid(p), 10);
  });

  it('neovius is even: f(-p) = f(p)', () => {
    // cos(-x) = cos(x), so f(-p) = f(p)
    expect(neovius(np)).toBeCloseTo(neovius(p), 10);
  });

  it('neovius has cubic symmetry', () => {
    expect(neovius([p[1], p[2], p[0]])).toBeCloseTo(neovius(p), 10);
  });

  it('iwp is even: f(-p) = f(p)', () => {
    expect(iwp(np)).toBeCloseTo(iwp(p), 10);
  });

  it('iwp has cubic symmetry', () => {
    expect(iwp([p[1], p[2], p[0]])).toBeCloseTo(iwp(p), 10);
  });

  it('diamond is odd: f(-p) = -f(p)', () => {
    // Each term has odd parity (product of 3 trig functions, odd number of sin)
    expect(diamond(np)).toBeCloseTo(-diamond(p), 10);
  });
});

// ── Normalization ─────────────────────────────────────────────────────────

describe('evalTPMSNormalized', () => {
  it('all normalized types produce values in reasonable range', () => {
    const testPoints: Vec3[] = [
      [0, 0, 0],
      [PI, PI, PI],
      [PI / 2, PI / 2, PI / 2],
      [1.5, 2.3, 0.7],
    ];
    const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];

    for (const type of types) {
      for (const p of testPoints) {
        const v = evalTPMSNormalized(type, p);
        // All should be within [-2, 2] at worst (IWP asymmetry)
        expect(Math.abs(v)).toBeLessThan(2.0);
      }
    }
  });

  it('schwarzP normalized at origin = 1.0', () => {
    expect(evalTPMSNormalized('schwarzP', [0, 0, 0])).toBeCloseTo(1.0, 6);
  });

  it('gyroid normalized at origin = 0.0', () => {
    expect(evalTPMSNormalized('gyroid', [0, 0, 0])).toBeCloseTo(0.0, 6);
  });

  it('diamond normalized at (pi/4,pi/4,pi/4) = 1.0', () => {
    expect(evalTPMSNormalized('diamond', [PI / 4, PI / 4, PI / 4])).toBeCloseTo(1.0, 4);
  });

  it('neovius normalized at origin = 1.0', () => {
    expect(evalTPMSNormalized('neovius', [0, 0, 0])).toBeCloseTo(1.0, 6);
  });

  it('iwp normalized at origin = 0.6 (asymmetric)', () => {
    // 3 / 5 = 0.6
    expect(evalTPMSNormalized('iwp', [0, 0, 0])).toBeCloseTo(0.6, 6);
  });

  it('iwp normalized at (pi,0,0) = -1.0', () => {
    // -5 / 5 = -1.0
    expect(evalTPMSNormalized('iwp', [PI, 0, 0])).toBeCloseTo(-1.0, 6);
  });
});

// ── Surface Point Verification ────────────────────────────────────────────

describe('TPMS surface points (f = 0)', () => {
  it('schwarzP: (pi/2, pi/2, pi/2) is on surface', () => {
    expect(Math.abs(schwarzP([PI / 2, PI / 2, PI / 2]))).toBeLessThan(1e-10);
  });

  it('gyroid: origin is on surface', () => {
    expect(Math.abs(gyroid([0, 0, 0]))).toBeLessThan(1e-10);
  });

  it('diamond: origin is on surface', () => {
    expect(Math.abs(diamond([0, 0, 0]))).toBeLessThan(1e-10);
  });
});
