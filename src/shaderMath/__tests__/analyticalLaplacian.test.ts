/**
 * Gate test for Layer 1: Analytical Laplacian must match finite-difference Laplacian.
 *
 * For P, G, D: exact eigenvalue identity (f already known, 0 ALU).
 * For Neovius, IWP: small correction term, should match within 2%.
 */
import { describe, it, expect } from 'vitest';
import {
  type TPMSType, type Vec3,
  PI, TPMS_FUNCTIONS,
  analyticalLaplacian, finiteDiffLaplacian,
} from '../tpms';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

const TYPES: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];
// P, G, D have exact eigenvalue: analytical should match within float precision
const EXACT_TYPES: TPMSType[] = ['gyroid', 'schwarzP', 'diamond'];
// Neovius, IWP have correction terms: match within 2% (finite-diff has O(eps^2) error)
const APPROX_TYPES: TPMSType[] = ['neovius', 'iwp'];

describe('Layer 1: analytical Laplacian curvature proxy', () => {
  // STRICT: eigenvalue types should be near-exact
  for (const type of EXACT_TYPES) {
    it(`${type}: analytical Laplacian matches eigenvalue identity exactly`, () => {
      const rng = seededRandom(300 + EXACT_TYPES.indexOf(type));
      let maxRelErr = 0;
      let tested = 0;

      for (let i = 0; i < 500; i++) {
        const p: Vec3 = [rng() * 2 * PI, rng() * 2 * PI, rng() * 2 * PI];

        const analytical = analyticalLaplacian(type, p);
        const finiteDiff = finiteDiffLaplacian(type, p, 0.001); // small epsilon for accuracy

        // Skip near-zero Laplacian (relative error undefined)
        if (Math.abs(finiteDiff) < 0.01) continue;

        const relErr = Math.abs(analytical - finiteDiff) / Math.abs(finiteDiff);
        maxRelErr = Math.max(maxRelErr, relErr);
        tested++;
      }

      expect(tested).toBeGreaterThanOrEqual(200);
      // Eigenvalue types: analytical is exact, finite-diff has O(eps^2) error
      // With eps=0.001: error ~ 1e-6, so relative error < 0.1%
      expect(maxRelErr).toBeLessThan(0.005); // 0.5% tolerance for float precision
    });
  }

  // STRICT: correction-term types should match within 2%
  for (const type of APPROX_TYPES) {
    it(`${type}: analytical Laplacian matches finite-diff within 2%`, () => {
      const rng = seededRandom(400 + APPROX_TYPES.indexOf(type));
      let maxRelErr = 0;
      let tested = 0;

      for (let i = 0; i < 500; i++) {
        const p: Vec3 = [rng() * 2 * PI, rng() * 2 * PI, rng() * 2 * PI];

        const analytical = analyticalLaplacian(type, p);
        const finiteDiff = finiteDiffLaplacian(type, p, 0.001);

        if (Math.abs(finiteDiff) < 0.1) continue;

        const relErr = Math.abs(analytical - finiteDiff) / Math.abs(finiteDiff);
        maxRelErr = Math.max(maxRelErr, relErr);
        tested++;
      }

      expect(tested).toBeGreaterThanOrEqual(200);
      expect(maxRelErr).toBeLessThan(0.02); // 2% tolerance
    });
  }

  // Verify the Neovius Laplacian formula: lap(f) = -f - 8*cx*cy*cz
  // (The Capstone incorrectly stated -9f - 12*cx*cy*cz; corrected via Hessian trace derivation)
  it('neovius: analytical formula verified against Hessian trace', () => {
    const p: Vec3 = [1.0, 2.0, 3.0];
    const cx = Math.cos(1.0), cy = Math.cos(2.0), cz = Math.cos(3.0);
    const f = TPMS_FUNCTIONS.neovius(p);
    const expected = -f - 8 * cx * cy * cz;
    expect(analyticalLaplacian('neovius', p)).toBeCloseTo(expected, 10);
  });

  // Verify the eigenvalue identities hold for specific known points
  it('schwarzP at origin: lap(f) = -f', () => {
    const p: Vec3 = [0, 0, 0];
    const f = TPMS_FUNCTIONS.schwarzP(p); // cos(0)+cos(0)+cos(0) = 3
    expect(analyticalLaplacian('schwarzP', p)).toBeCloseTo(-f, 10);
    expect(analyticalLaplacian('schwarzP', p)).toBeCloseTo(-3, 10);
  });

  it('gyroid at (1,1,1): lap(f) = -2f', () => {
    const p: Vec3 = [1, 1, 1];
    const f = TPMS_FUNCTIONS.gyroid(p);
    expect(analyticalLaplacian('gyroid', p)).toBeCloseTo(-2 * f, 10);
  });
});
