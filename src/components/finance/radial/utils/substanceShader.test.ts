import { describe, it, expect } from 'vitest';
import { getSubstanceColors } from './substanceShader';

describe('substanceShader', () => {
  describe('getSubstanceColors', () => {
    it('returns cyan/emerald for healthy scores (> 75)', () => {
      const { colorA, colorB } = getSubstanceColors(80);
      // Cyan: rgb(0.133, 0.827, 0.933)
      expect(colorA[0]).toBeCloseTo(0.133, 2);
      expect(colorA[2]).toBeCloseTo(0.933, 2);
      // Emerald: rgb(0.063, 0.725, 0.506)
      expect(colorB[1]).toBeCloseTo(0.725, 2);
    });

    it('returns blue/amber for watchful scores (51-75)', () => {
      const { colorA, colorB } = getSubstanceColors(60);
      // Blue: rgb(0.231, 0.510, 0.965)
      expect(colorA[0]).toBeCloseTo(0.231, 2);
      // Amber: rgb(0.961, 0.620, 0.043)
      expect(colorB[0]).toBeCloseTo(0.961, 2);
    });

    it('returns amber/orange for tight scores (26-50)', () => {
      const { colorA, colorB } = getSubstanceColors(30);
      // Amber
      expect(colorA[0]).toBeCloseTo(0.961, 2);
      // Orange: rgb(0.984, 0.573, 0.235)
      expect(colorB[2]).toBeCloseTo(0.235, 2);
    });

    it('returns amber/rose for over-budget scores (<= 25)', () => {
      const { colorA, colorB } = getSubstanceColors(10);
      // Amber
      expect(colorA[0]).toBeCloseTo(0.961, 2);
      // Rose: rgb(0.984, 0.443, 0.522)
      expect(colorB[1]).toBeCloseTo(0.443, 2);
    });

    it('boundary: exactly 75 uses watchful (blue/amber)', () => {
      const { colorA } = getSubstanceColors(75);
      // Should be blue (watchful band), not cyan (healthy)
      expect(colorA[0]).toBeCloseTo(0.231, 2);
    });

    it('boundary: exactly 50 uses tight (amber/orange)', () => {
      const { colorA, colorB } = getSubstanceColors(50);
      expect(colorA[0]).toBeCloseTo(0.961, 2);
      expect(colorB[2]).toBeCloseTo(0.235, 2);
    });

    it('boundary: exactly 25 uses over-budget (amber/rose)', () => {
      const { colorB } = getSubstanceColors(25);
      expect(colorB[1]).toBeCloseTo(0.443, 2);
    });

    it('boundary: score of 0 uses over-budget', () => {
      const { colorB } = getSubstanceColors(0);
      expect(colorB[1]).toBeCloseTo(0.443, 2);
    });

    it('boundary: score of 100 uses healthy (cyan/emerald)', () => {
      const { colorA } = getSubstanceColors(100);
      expect(colorA[2]).toBeCloseTo(0.933, 2);
    });

    it('all returned values are valid RGB tuples (3 elements, 0-1 range)', () => {
      for (const score of [0, 25, 50, 75, 100]) {
        const { colorA, colorB } = getSubstanceColors(score);
        expect(colorA).toHaveLength(3);
        expect(colorB).toHaveLength(3);
        for (const c of [...colorA, ...colorB]) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // Shader strings are GLSL — validate they exist and contain expected constructs
  describe('shader strings', () => {
    // Importing at top level to test exports exist
    it('substanceVertexShader and substanceFragmentShader are exported strings', async () => {
      const mod = await import('./substanceShader');
      expect(typeof mod.substanceVertexShader).toBe('string');
      expect(typeof mod.substanceFragmentShader).toBe('string');
    });

    it('vertex shader contains noise function', async () => {
      const { substanceVertexShader } = await import('./substanceShader');
      expect(substanceVertexShader).toContain('snoise');
      expect(substanceVertexShader).toContain('u_healthNormalized');
    });

    it('fragment shader contains lighting', async () => {
      const { substanceFragmentShader } = await import('./substanceShader');
      expect(substanceFragmentShader).toContain('diffuse');
      expect(substanceFragmentShader).toContain('fresnel');
    });
  });
});
