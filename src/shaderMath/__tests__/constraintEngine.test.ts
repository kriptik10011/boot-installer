/**
 * Constraint Engine — Formula Calibration Tests
 *
 * These are NOT unit tests for development discipline (D-11 exemption).
 * They verify that constraint formulas don't reject known-good presets.
 * If BASE_PRESET or GLASS_SCULPTURE_PRESET fail, the formula is wrong.
 */

import { describe, it, expect } from 'vitest';
import { enforceConstraints, validatePreset } from '../constraintEngine';
import { BASE_PRESET, GLASS_SCULPTURE_PRESET, BUILT_IN_PRESETS } from '../../components/debug/shaderPresets';

describe('constraintEngine calibration', () => {
  describe('preset validation — formulas must not reject known-good presets', () => {
    it('BASE_PRESET passes all constraints with 0 violations', () => {
      const result = validatePreset('Base', BASE_PRESET);
      if (!result.valid) {
        const details = result.violations
          .map((v) => `  ${v.constraintId} ${v.param}: ${v.message}`)
          .join('\n');
        throw new Error(`BASE_PRESET failed constraints:\n${details}`);
      }
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('GLASS_SCULPTURE_PRESET passes all constraints with 0 violations', () => {
      const result = validatePreset('Glass Sculpture', GLASS_SCULPTURE_PRESET);
      if (!result.valid) {
        const details = result.violations
          .map((v) => `  ${v.constraintId} ${v.param}: ${v.message}`)
          .join('\n');
        throw new Error(`GLASS_SCULPTURE_PRESET failed constraints:\n${details}`);
      }
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('idempotency — enforce(enforce(x)) === enforce(x)', () => {
    it('double-apply on BASE_PRESET produces same result', () => {
      const first = enforceConstraints(BASE_PRESET);
      const second = enforceConstraints(first.clamped);
      expect(second.clamped).toEqual(first.clamped);
      expect(second.violations).toHaveLength(0);
    });

    it('double-apply on GLASS_SCULPTURE_PRESET produces same result', () => {
      const first = enforceConstraints(GLASS_SCULPTURE_PRESET);
      const second = enforceConstraints(first.clamped);
      expect(second.clamped).toEqual(first.clamped);
      expect(second.violations).toHaveLength(0);
    });
  });

  describe('C-01: freq*thick minimum (shell visibility)', () => {
    it('fires when freq*thick < 0.09', () => {
      const broken = { ...BASE_PRESET, d0freq: 3.0, d0thick: 0.02 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-01')).toBe(true);
      // Verify the clamped value satisfies the constraint
      expect(result.clamped.d0thick * 3.0).toBeGreaterThanOrEqual(0.09);
    });

    it('does not fire at slider minimums (freq=3.0, thick=0.03)', () => {
      const atMin = { ...BASE_PRESET, d0freq: 3.0, d0thick: 0.03 };
      const result = enforceConstraints(atMin);
      expect(result.violations.filter((v) => v.constraintId === 'C-01')).toHaveLength(0);
    });
  });

  describe('C-02: breathAmp shell visibility during breathing', () => {
    it('clamps breathAmp when it would make shells invisible', () => {
      const broken = { ...BASE_PRESET, d0thick: 0.05, d0freq: 3.0, breathAmp: 0.15 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-02')).toBe(true);
      // Verify shells remain visible: (thick - breathAmp) * freq >= 0.09
      const { d0thick, breathAmp, d0freq } = result.clamped;
      expect((d0thick - breathAmp) * d0freq).toBeGreaterThanOrEqual(0.09 - 0.001);
    });

    it('does not fire at default settings', () => {
      const result = enforceConstraints(BASE_PRESET);
      expect(result.violations.filter((v) => v.constraintId === 'C-02')).toHaveLength(0);
    });

    it('clamps breathAmp based on thinnest domain, not just d0', () => {
      const broken = { ...BASE_PRESET, d0thick: 0.30, d1thick: 0.05, d1freq: 3.5, breathAmp: 0.10 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-02')).toBe(true);
      expect(result.clamped.breathAmp).toBeLessThanOrEqual(0.025);
    });
  });

  describe('C-03: auraScale alpha saturation', () => {
    it('clamps auraScale at high thickness', () => {
      const broken = { ...BASE_PRESET, auraScale: 0.8, d0thick: 0.30 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-03')).toBe(true);
      expect(result.clamped.auraScale * 0.30).toBeLessThanOrEqual(0.12 + 0.001);
    });

    it('allows Glass Sculpture auraScale (0.15 at thick=0.10)', () => {
      const result = enforceConstraints(GLASS_SCULPTURE_PRESET);
      expect(result.violations.filter((v) => v.constraintId === 'C-03')).toHaveLength(0);
    });

    it('allows sweet spot center (auraScale=0.2 at thick=0.30)', () => {
      const sweetSpot = { ...BASE_PRESET, auraScale: 0.2, d0thick: 0.30 };
      const result = enforceConstraints(sweetSpot);
      expect(result.violations.filter((v) => v.constraintId === 'C-03')).toHaveLength(0);
    });
  });

  describe('C-04: per-type thickness ceiling', () => {
    it('clamps Neovius thickness to 0.5', () => {
      const broken = { ...BASE_PRESET, d0type: 'neovius', d0thick: 0.8 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-04')).toBe(true);
      expect(result.clamped.d0thick).toBe(0.5);
    });

    it('allows Gyroid at max thickness (1.5)', () => {
      const atMax = { ...BASE_PRESET, d0type: 'gyroid', d0thick: 1.5 };
      const result = enforceConstraints(atMax);
      expect(result.violations.filter((v) => v.constraintId === 'C-04')).toHaveLength(0);
    });

    it('fires on non-zero domain (d2 Neovius)', () => {
      const broken = { ...BASE_PRESET, d2type: 'neovius', d2thick: 0.8 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-04' && v.param === 'd2thick')).toBe(true);
    });
  });

  describe('C-05 through C-08: dead parameter detection', () => {
    it('roughMod dead when roughness >= 0.8', () => {
      const settings = { ...BASE_PRESET, roughness: 0.8, roughMod: 0.5 };
      const result = enforceConstraints(settings);
      expect(result.deadParams.has('roughMod')).toBe(true);
    });

    it('absorption, sssDensity, thickOpacity dead when translucency = 0', () => {
      const result = enforceConstraints(BASE_PRESET); // translucency=0
      expect(result.deadParams.has('absorption')).toBe(true);
      expect(result.deadParams.has('sssDensity')).toBe(true);
      expect(result.deadParams.has('thickOpacity')).toBe(true);
    });

    it('absorption alive when translucency > 0', () => {
      const settings = { ...BASE_PRESET, translucency: 0.5 };
      const result = enforceConstraints(settings);
      expect(result.deadParams.has('absorption')).toBe(false);
    });
  });

  describe('C-09, C-10: soft warnings', () => {
    it('warns when kColor and curvColorStr both high', () => {
      const settings = { ...BASE_PRESET, kColor: 1.0, curvColorStr: 2.0 };
      const result = enforceConstraints(settings);
      expect(result.warnings.some((w) => w.constraintId === 'C-09')).toBe(true);
    });

    it('warns when translucency active with high fog', () => {
      const settings = { ...BASE_PRESET, translucency: 0.5, atmoFog: 0.7 };
      const result = enforceConstraints(settings);
      expect(result.warnings.some((w) => w.constraintId === 'C-10')).toBe(true);
    });
  });

  describe('C-11: Diamond iso range', () => {
    it('clamps domain 0 iso when type is Diamond', () => {
      const broken = { ...BASE_PRESET, d0type: 'diamond', d0iso: 0.75 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-11')).toBe(true);
      expect(result.clamped.d0iso).toBe(0.6);
    });

    it('does not clamp non-Diamond iso at 0.75', () => {
      const ok = { ...BASE_PRESET, d0type: 'gyroid', d0iso: 0.75 };
      const result = enforceConstraints(ok);
      expect(result.violations.filter((v) => v.constraintId === 'C-11')).toHaveLength(0);
    });

    it('fires on non-zero domain (d3 Diamond)', () => {
      const broken = { ...BASE_PRESET, d3type: 'diamond', d3iso: 0.8 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-11' && v.param === 'd3iso')).toBe(true);
    });
  });

  describe('C-12: Diamond isoSweep safety (Phase 6B)', () => {
    it('clamps isoSweepAmp when Diamond iso + sweep exceeds 0.6', () => {
      const broken = { ...BASE_PRESET, d2type: 'diamond', d2iso: 0.3, isoSweepAmp: 0.5 };
      const result = enforceConstraints(broken);
      expect(result.violations.some((v) => v.constraintId === 'C-12')).toBe(true);
      // max sweep: (0.6 - 0.3) / 0.94 = 0.319
      expect(result.clamped.isoSweepAmp).toBeLessThan(0.35);
      expect(result.clamped.isoSweepAmp).toBeGreaterThan(0.30);
    });

    it('does not fire when no Diamond domains exist', () => {
      // Override ALL domain types to non-Diamond to avoid BASE_PRESET's d2=diamond
      const safe = { ...BASE_PRESET, d0type: 'gyroid', d1type: 'schwarzP', d2type: 'gyroid', d3type: 'iwp', isoSweepAmp: 0.4 };
      const result = enforceConstraints(safe);
      expect(result.violations.some((v) => v.constraintId === 'C-12')).toBe(false);
    });

    it('does not fire when sweep is within safe range', () => {
      const safe = { ...BASE_PRESET, d2type: 'diamond', d2iso: 0.0, isoSweepAmp: 0.3 };
      const result = enforceConstraints(safe);
      // max sweep: (0.6 - 0) / 0.94 = 0.638 > 0.3
      expect(result.violations.some((v) => v.constraintId === 'C-12')).toBe(false);
    });
  });

  describe('C-13: metallic + translucency warning (Phase 6B)', () => {
    it('warns when metallic > 0.5 AND translucency > 0.3', () => {
      const combo = { ...BASE_PRESET, metallic: 0.8, translucency: 0.5 };
      const result = enforceConstraints(combo);
      expect(result.warnings.some((w) => w.constraintId === 'C-13')).toBe(true);
    });

    it('does not warn at metallic=0 with full glass', () => {
      const safe = { ...BASE_PRESET, metallic: 0.0, translucency: 1.0 };
      const result = enforceConstraints(safe);
      expect(result.warnings.some((w) => w.constraintId === 'C-13')).toBe(false);
    });

    it('does not warn at high metallic without glass', () => {
      const safe = { ...BASE_PRESET, metallic: 1.0, translucency: 0.0 };
      const result = enforceConstraints(safe);
      expect(result.warnings.some((w) => w.constraintId === 'C-13')).toBe(false);
    });
  });

  describe('C-14: step budget warning (Phase 6B)', () => {
    it('warns when freq * clipRadius > 40', () => {
      const heavy = { ...BASE_PRESET, d0freq: 15, clipRadius: 3.0 };
      const result = enforceConstraints(heavy);
      expect(result.warnings.some((w) => w.constraintId === 'C-14')).toBe(true);
    });

    it('does not warn at default settings', () => {
      const result = enforceConstraints(BASE_PRESET);
      expect(result.warnings.some((w) => w.constraintId === 'C-14')).toBe(false);
    });
  });

  describe('all 7 presets pass with new constraints', () => {
    for (const preset of BUILT_IN_PRESETS) {
      it(`${preset.name} passes validatePreset with 0 violations`, () => {
        const result = validatePreset(preset.name, preset.settings);
        if (!result.valid) {
          const details = result.violations
            .map((v: { constraintId: string; param: string; message: string }) =>
              `  ${v.constraintId} ${v.param}: ${v.message}`)
            .join('\n');
          throw new Error(`${preset.name} failed:\n${details}`);
        }
        expect(result.valid).toBe(true);
      });
    }
  });
});
