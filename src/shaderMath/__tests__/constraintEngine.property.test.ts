/**
 * Constraint Engine — Property-Based Tests
 *
 * Uses fast-check to verify constraint engine properties hold for 5000+ random inputs.
 * Tests: idempotency, NaN safety, dead-parameter detection, constraint satisfaction,
 * preset validation, and output range bounds.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { enforceConstraints, validatePreset } from '../constraintEngine';
import {
  type ShaderSettings,
  BASE_PRESET,
  GLASS_SCULPTURE_PRESET,
} from '../../components/debug/shaderPresets';

// --- Arbitrary generators ---

const TPMS_TYPES = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'] as const;

/** Generate a random TPMS type string */
const arbTpmsType = fc.constantFrom(...TPMS_TYPES);

/** Generate a random domain parameter set (freq, thick, iso, type) within slider ranges */
function arbDomainParams(prefix: string) {
  return {
    [`${prefix}type`]: arbTpmsType,
    [`${prefix}freq`]: fc.double({ min: 3.0, max: 20.0, noNaN: true }),
    [`${prefix}thick`]: fc.double({ min: 0.03, max: 1.5, noNaN: true }),
    [`${prefix}iso`]: fc.double({ min: -0.8, max: 0.8, noNaN: true }),
  };
}

/** Generate a complete random ShaderSettings within slider ranges */
const arbShaderSettings: fc.Arbitrary<ShaderSettings> = fc.record({
  debugHeatmap: fc.boolean(),
  brightness: fc.double({ min: 0.3, max: 3.0, noNaN: true }),
  clipRadius: fc.double({ min: 0.5, max: 5.0, noNaN: true }),
  orbitSpeed: fc.double({ min: 0.0, max: 0.5, noNaN: true }),
  cameraDistance: fc.double({ min: 2.0, max: 15.0, noNaN: true }),
  stepMult: fc.double({ min: 0.4, max: 1.0, noNaN: true }),
  surfaceMode: fc.constantFrom(0, 1, 2),
  blendWidth: fc.double({ min: 0.02, max: 0.5, noNaN: true }),
  debugDomains: fc.boolean(),
  metallic: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  roughness: fc.double({ min: 0.05, max: 1.0, noNaN: true }),
  curvColorStr: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  curvMode: fc.constantFrom(0, 1, 2),
  shadowStrength: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  curvAO: fc.double({ min: 0.0, max: 2.0, noNaN: true }),
  kColor: fc.double({ min: 0.0, max: 2.0, noNaN: true }),
  roughMod: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  rimStrength: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  atmoFog: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  spatialColor: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  translucency: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  maxLayers: fc.integer({ min: 1, max: 5 }),
  thickOpacity: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  absorption: fc.double({ min: 0.0, max: 15.0, noNaN: true }),
  absorptionColor: fc.constant('#ffcc88'),
  sssIntensity: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  sssDensity: fc.double({ min: 0.0, max: 20.0, noNaN: true }),
  auraScale: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  shadowPulse: fc.boolean(),
  breathAmp: fc.double({ min: 0.0, max: 0.15, noNaN: true }),
  breathSpeed: fc.double({ min: 0.0, max: 5.0, noNaN: true }),
  isoSweepAmp: fc.double({ min: 0.0, max: 0.4, noNaN: true }),
  isoSweepSpeed: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  warpStrength: fc.double({ min: 0.0, max: 0.4, noNaN: true }),
  warpSpeed: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  morphTarget: arbTpmsType,
  morphBlend: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  phaseMode: fc.constantFrom('sync', 'stagger', 'antiphase'),
  linkParams: fc.boolean(),
  linkColors: fc.boolean(),
  // Domain 0
  ...arbDomainParams('d0'),
  d0c0: fc.constant('#aabbcc'),
  d0c1: fc.constant('#aabbcc'),
  d0c2: fc.constant('#aabbcc'),
  d0c3: fc.constant('#aabbcc'),
  d0c4: fc.constant('#aabbcc'),
  // Domain 1
  ...arbDomainParams('d1'),
  d1c0: fc.constant('#aabbcc'),
  d1c1: fc.constant('#aabbcc'),
  d1c2: fc.constant('#aabbcc'),
  d1c3: fc.constant('#aabbcc'),
  d1c4: fc.constant('#aabbcc'),
  // Domain 2
  ...arbDomainParams('d2'),
  d2c0: fc.constant('#aabbcc'),
  d2c1: fc.constant('#aabbcc'),
  d2c2: fc.constant('#aabbcc'),
  d2c3: fc.constant('#aabbcc'),
  d2c4: fc.constant('#aabbcc'),
  // Domain 3
  ...arbDomainParams('d3'),
  d3c0: fc.constant('#aabbcc'),
  d3c1: fc.constant('#aabbcc'),
  d3c2: fc.constant('#aabbcc'),
  d3c3: fc.constant('#aabbcc'),
  d3c4: fc.constant('#aabbcc'),
}) as fc.Arbitrary<ShaderSettings>;

/** Generate settings that deliberately violate constraints (out-of-range values) */
const arbStressSettings: fc.Arbitrary<ShaderSettings> = fc.record({
  debugHeatmap: fc.boolean(),
  brightness: fc.double({ min: 0.1, max: 10.0, noNaN: true }),
  clipRadius: fc.double({ min: 0.1, max: 10.0, noNaN: true }),
  orbitSpeed: fc.double({ min: 0.0, max: 2.0, noNaN: true }),
  cameraDistance: fc.double({ min: 1.0, max: 30.0, noNaN: true }),
  stepMult: fc.double({ min: 0.1, max: 2.0, noNaN: true }),
  surfaceMode: fc.constantFrom(0, 1, 2),
  blendWidth: fc.double({ min: 0.001, max: 2.0, noNaN: true }),
  debugDomains: fc.boolean(),
  metallic: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  roughness: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  curvColorStr: fc.double({ min: 0.0, max: 10.0, noNaN: true }),
  curvMode: fc.constantFrom(0, 1, 2),
  shadowStrength: fc.double({ min: 0.0, max: 2.0, noNaN: true }),
  curvAO: fc.double({ min: 0.0, max: 5.0, noNaN: true }),
  kColor: fc.double({ min: 0.0, max: 5.0, noNaN: true }),
  roughMod: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  rimStrength: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  atmoFog: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  spatialColor: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  translucency: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  maxLayers: fc.integer({ min: 1, max: 10 }),
  thickOpacity: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  absorption: fc.double({ min: 0.0, max: 50.0, noNaN: true }),
  absorptionColor: fc.constant('#ffcc88'),
  sssIntensity: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  sssDensity: fc.double({ min: 0.0, max: 50.0, noNaN: true }),
  auraScale: fc.double({ min: 0.0, max: 3.0, noNaN: true }),
  shadowPulse: fc.boolean(),
  breathAmp: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  breathSpeed: fc.double({ min: 0.0, max: 10.0, noNaN: true }),
  isoSweepAmp: fc.double({ min: 0.0, max: 2.0, noNaN: true }),
  isoSweepSpeed: fc.double({ min: 0.0, max: 10.0, noNaN: true }),
  warpStrength: fc.double({ min: 0.0, max: 2.0, noNaN: true }),
  warpSpeed: fc.double({ min: 0.0, max: 5.0, noNaN: true }),
  morphTarget: arbTpmsType,
  morphBlend: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  phaseMode: fc.constantFrom('sync', 'stagger', 'antiphase'),
  linkParams: fc.boolean(),
  linkColors: fc.boolean(),
  ...arbDomainParams('d0'),
  d0c0: fc.constant('#aabbcc'),
  d0c1: fc.constant('#aabbcc'),
  d0c2: fc.constant('#aabbcc'),
  d0c3: fc.constant('#aabbcc'),
  d0c4: fc.constant('#aabbcc'),
  ...arbDomainParams('d1'),
  d1c0: fc.constant('#aabbcc'),
  d1c1: fc.constant('#aabbcc'),
  d1c2: fc.constant('#aabbcc'),
  d1c3: fc.constant('#aabbcc'),
  d1c4: fc.constant('#aabbcc'),
  ...arbDomainParams('d2'),
  d2c0: fc.constant('#aabbcc'),
  d2c1: fc.constant('#aabbcc'),
  d2c2: fc.constant('#aabbcc'),
  d2c3: fc.constant('#aabbcc'),
  d2c4: fc.constant('#aabbcc'),
  ...arbDomainParams('d3'),
  d3c0: fc.constant('#aabbcc'),
  d3c1: fc.constant('#aabbcc'),
  d3c2: fc.constant('#aabbcc'),
  d3c3: fc.constant('#aabbcc'),
  d3c4: fc.constant('#aabbcc'),
}) as fc.Arbitrary<ShaderSettings>;

const NUM_RUNS = 5000;

// --- Helper: check numeric fields for NaN ---

function hasNaN(settings: ShaderSettings): string[] {
  const nanFields: string[] = [];
  for (const [key, val] of Object.entries(settings)) {
    if (typeof val === 'number' && Number.isNaN(val)) {
      nanFields.push(key);
    }
  }
  return nanFields;
}

// --- Tests ---

describe('constraintEngine property-based tests', () => {
  describe('idempotency: enforce(enforce(x)) === enforce(x)', () => {
    it('holds for 5000 random slider-range inputs', () => {
      fc.assert(
        fc.property(arbShaderSettings, (settings) => {
          const first = enforceConstraints(settings);
          const second = enforceConstraints(first.clamped);
          expect(second.clamped).toEqual(first.clamped);
          expect(second.violations).toHaveLength(0);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('holds for 5000 out-of-range stress inputs', () => {
      fc.assert(
        fc.property(arbStressSettings, (settings) => {
          const first = enforceConstraints(settings);
          const second = enforceConstraints(first.clamped);
          expect(second.clamped).toEqual(first.clamped);
          expect(second.violations).toHaveLength(0);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('NaN safety: no NaN in output for any input', () => {
    it('output is NaN-free for 5000 random inputs', () => {
      fc.assert(
        fc.property(arbShaderSettings, (settings) => {
          const result = enforceConstraints(settings);
          const nans = hasNaN(result.clamped);
          expect(nans).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('output is NaN-free for 5000 stress inputs', () => {
      fc.assert(
        fc.property(arbStressSettings, (settings) => {
          const result = enforceConstraints(settings);
          const nans = hasNaN(result.clamped);
          expect(nans).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('constraint satisfaction: hard constraints hold after enforcement', () => {
    it('C-01: freq*thick >= 0.09 for all 4 domains after enforcement', () => {
      fc.assert(
        fc.property(arbStressSettings, (settings) => {
          const { clamped: c } = enforceConstraints(settings);
          for (const prefix of ['d0', 'd1', 'd2', 'd3'] as const) {
            const freq = c[`${prefix}freq`] as number;
            const thick = c[`${prefix}thick`] as number;
            expect(freq * thick).toBeGreaterThanOrEqual(0.09 - 1e-9);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('C-02: breathAmp does not make any domain shells invisible', () => {
      fc.assert(
        fc.property(arbStressSettings, (settings) => {
          const { clamped: c } = enforceConstraints(settings);
          for (const prefix of ['d0', 'd1', 'd2', 'd3'] as const) {
            const freq = c[`${prefix}freq`] as number;
            const thick = c[`${prefix}thick`] as number;
            // Shell visibility during thin phase: (thick - breathAmp) * freq >= 0.09
            expect((thick - c.breathAmp) * freq).toBeGreaterThanOrEqual(0.09 - 1e-9);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('C-03: auraScale * maxThick < 0.12 after enforcement', () => {
      fc.assert(
        fc.property(arbStressSettings, (settings) => {
          const { clamped: c } = enforceConstraints(settings);
          const maxThick = Math.max(c.d0thick, c.d1thick, c.d2thick, c.d3thick, 0.001);
          expect(c.auraScale * maxThick).toBeLessThanOrEqual(0.12 + 1e-9);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('C-04: per-type thickness ceilings enforced', () => {
      const maxByType: Record<string, number> = {
        gyroid: 1.5, schwarzP: 1.5, diamond: 1.2, neovius: 0.5, iwp: 0.8,
      };
      fc.assert(
        fc.property(arbStressSettings, (settings) => {
          const { clamped: c } = enforceConstraints(settings);
          for (const prefix of ['d0', 'd1', 'd2', 'd3'] as const) {
            const type = c[`${prefix}type`] as string;
            const thick = c[`${prefix}thick`] as number;
            const max = maxByType[type] ?? 1.5;
            expect(thick).toBeLessThanOrEqual(max + 1e-9);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('C-11: Diamond iso within [-0.6, 0.6] for all domains', () => {
      fc.assert(
        fc.property(arbStressSettings, (settings) => {
          const { clamped: c } = enforceConstraints(settings);
          for (const prefix of ['d0', 'd1', 'd2', 'd3'] as const) {
            const type = c[`${prefix}type`] as string;
            const iso = c[`${prefix}iso`] as number;
            if (type === 'diamond') {
              expect(iso).toBeGreaterThanOrEqual(-0.6 - 1e-9);
              expect(iso).toBeLessThanOrEqual(0.6 + 1e-9);
            }
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('dead parameter detection', () => {
    it('absorption flagged dead when translucency = 0', () => {
      fc.assert(
        fc.property(arbShaderSettings, (settings) => {
          const withZeroTrans = { ...settings, translucency: 0 };
          const result = enforceConstraints(withZeroTrans);
          expect(result.deadParams.has('absorption')).toBe(true);
          expect(result.deadParams.has('sssDensity')).toBe(true);
          expect(result.deadParams.has('thickOpacity')).toBe(true);
        }),
        { numRuns: 1000 },
      );
    });

    it('absorption NOT flagged dead when translucency > 0', () => {
      fc.assert(
        fc.property(arbShaderSettings, (settings) => {
          const withTrans = { ...settings, translucency: 0.5 };
          const result = enforceConstraints(withTrans);
          expect(result.deadParams.has('absorption')).toBe(false);
        }),
        { numRuns: 1000 },
      );
    });

    it('roughMod flagged dead when roughness >= 0.8', () => {
      fc.assert(
        fc.property(arbShaderSettings, (settings) => {
          const highRough = { ...settings, roughness: 0.85 };
          const result = enforceConstraints(highRough);
          expect(result.deadParams.has('roughMod')).toBe(true);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe('preset validation: built-in presets always pass', () => {
    it('BASE_PRESET passes with 0 violations', () => {
      const result = validatePreset('Base', BASE_PRESET);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('GLASS_SCULPTURE_PRESET passes with 0 violations', () => {
      const result = validatePreset('Glass Sculpture', GLASS_SCULPTURE_PRESET);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('non-constrained fields pass through unchanged', () => {
    it('camera/view fields are never modified', () => {
      fc.assert(
        fc.property(arbShaderSettings, (settings) => {
          const { clamped } = enforceConstraints(settings);
          expect(clamped.brightness).toBe(settings.brightness);
          expect(clamped.cameraDistance).toBe(settings.cameraDistance);
          expect(clamped.orbitSpeed).toBe(settings.orbitSpeed);
          expect(clamped.clipRadius).toBe(settings.clipRadius);
          expect(clamped.stepMult).toBe(settings.stepMult);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('color strings are never modified', () => {
      fc.assert(
        fc.property(arbShaderSettings, (settings) => {
          const { clamped } = enforceConstraints(settings);
          expect(clamped.absorptionColor).toBe(settings.absorptionColor);
          expect(clamped.d0c0).toBe(settings.d0c0);
          expect(clamped.d1c2).toBe(settings.d1c2);
        }),
        { numRuns: 1000 },
      );
    });
  });
});
