/**
 * Lattice Adapter Tests — verifies store-to-shader uniform conversion.
 * Ensures prefsToUniforms produces correct values for production wiring.
 */

import { describe, it, expect } from 'vitest';
import { prefsToUniforms, computePhaseOffsets } from '@/components/debug/latticeAdapter';
import { DEFAULT_LATTICE_PREFS, DEFAULT_DOMAIN_CONFIGS } from '@/stores/defaults';
import type { LatticePreferences } from '@/stores/types';

const TAU = Math.PI * 2;

describe('prefsToUniforms', () => {
  const defaults = prefsToUniforms(DEFAULT_LATTICE_PREFS);

  it('produces 4 domain types from default configs', () => {
    expect(defaults.domainTypes).toHaveLength(4);
    // All domains should map to valid TPMS type indices
    for (const t of defaults.domainTypes) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(4);
    }
  });

  it('produces 4 domain frequencies matching defaults', () => {
    expect(defaults.domainFreqs).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(defaults.domainFreqs[i]).toBe(DEFAULT_DOMAIN_CONFIGS[i].frequency);
    }
  });

  it('produces 20 gradient colors (4 domains x 5 stops)', () => {
    expect(defaults.domainGradColors).toHaveLength(20);
    for (const [r, g, b] of defaults.domainGradColors) {
      expect(Number.isFinite(r)).toBe(true);
      expect(Number.isFinite(g)).toBe(true);
      expect(Number.isFinite(b)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });

  it('maps metalnessBase to metallic', () => {
    expect(defaults.metallic).toBe(DEFAULT_LATTICE_PREFS.metalnessBase);
  });

  it('computes clipRadius from latticeSize', () => {
    expect(defaults.clipRadius).toBeCloseTo((80 / 100) * 0.9, 5);
  });

  it('computes blendWidth in world-space (slider * clipRadius)', () => {
    const expectedBlend = (DEFAULT_LATTICE_PREFS.blendWidth ?? 0.15) * defaults.clipRadius;
    expect(defaults.blendWidth).toBeCloseTo(expectedBlend, 5);
  });

  it('converts cameraTilt degrees to radians', () => {
    expect(defaults.cameraTiltRad).toBeCloseTo(15 * Math.PI / 180, 5);
  });

  it('defaults tpmsMode to 0 (sheet)', () => {
    expect(defaults.tpmsMode).toBe(0);
  });

  it('defaults animation values match store defaults', () => {
    expect(defaults.breathAmp).toBe(DEFAULT_LATTICE_PREFS.breathAmp ?? 0);
    expect(defaults.isoSweepAmp).toBe(DEFAULT_LATTICE_PREFS.isoSweepAmp ?? 0);
    expect(defaults.warpStrength).toBeCloseTo(DEFAULT_LATTICE_PREFS.warpStrength, 5);
    expect(defaults.morphBlend).toBe(DEFAULT_LATTICE_PREFS.morphBlend ?? 0);
  });

  it('defaults W3 rim/env/shadow fields from store', () => {
    expect(defaults.envWeight).toBe(0.55);
    expect(defaults.shadowStrength).toBe(1.0);
    expect(defaults.shadowPulse).toBe(0); // false → 0
    expect(defaults.rimExponent).toBe(1.5);
    expect(defaults.rimColor).toEqual([-1, -1, -1]); // 'auto'
    expect(defaults.rimShadow).toBe(1.0);
    expect(defaults.rimAOMask).toBe(1.0);
  });

  it('converts rimColor hex to linear RGB', () => {
    const prefs = { ...DEFAULT_LATTICE_PREFS, rimColor: '#ff0000' };
    const result = prefsToUniforms(prefs);
    // sRGB #ff0000 → linear [1, 0, 0]
    expect(result.rimColor[0]).toBeGreaterThan(0.9);
    expect(result.rimColor[1]).toBeCloseTo(0, 2);
    expect(result.rimColor[2]).toBeCloseTo(0, 2);
  });

  it('converts shadowPulse boolean to 0/1', () => {
    const prefs = { ...DEFAULT_LATTICE_PREFS, shadowPulse: true };
    expect(prefsToUniforms(prefs).shadowPulse).toBe(1);
    const prefsOff = { ...DEFAULT_LATTICE_PREFS, shadowPulse: false };
    expect(prefsToUniforms(prefsOff).shadowPulse).toBe(0);
  });

  it('treats invalid hex rimColor as auto', () => {
    const prefs = { ...DEFAULT_LATTICE_PREFS, rimColor: 'red' };
    expect(prefsToUniforms(prefs).rimColor).toEqual([-1, -1, -1]);
    const shortHex = { ...DEFAULT_LATTICE_PREFS, rimColor: '#fff' };
    expect(prefsToUniforms(shortHex).rimColor).toEqual([-1, -1, -1]);
  });

  it('clamps rimExponent to [0.5, 5.0]', () => {
    const low = { ...DEFAULT_LATTICE_PREFS, rimExponent: 0.1 };
    expect(prefsToUniforms(low).rimExponent).toBe(0.5);
    const high = { ...DEFAULT_LATTICE_PREFS, rimExponent: 10 };
    expect(prefsToUniforms(high).rimExponent).toBe(5.0);
  });
});

describe('prefsToUniforms linkParams', () => {
  it('linkParams=true copies domain 0 params to all domains', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      linkParams: true,
    };
    const result = prefsToUniforms(prefs);
    for (let i = 1; i < 4; i++) {
      expect(result.domainTypes[i]).toBe(result.domainTypes[0]);
      expect(result.domainFreqs[i]).toBe(result.domainFreqs[0]);
      expect(result.domainThicks[i]).toBe(result.domainThicks[0]);
      expect(result.domainIsos[i]).toBe(result.domainIsos[0]);
    }
  });

  it('linkColors=true copies domain 0 colors to all domains', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      linkColors: true,
    };
    const result = prefsToUniforms(prefs);
    for (let d = 1; d < 4; d++) {
      for (let s = 0; s < 5; s++) {
        expect(result.domainGradColors[d * 5 + s]).toEqual(result.domainGradColors[s]);
      }
    }
  });

  it('linkType=true copies domain 0 type only, frequencies independent', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      linkType: true,
      linkGeometry: false,
    };
    const result = prefsToUniforms(prefs);
    // Types should all match domain 0
    for (let i = 1; i < 4; i++) {
      expect(result.domainTypes[i]).toBe(result.domainTypes[0]);
    }
    // Frequencies should be independent (diverse defaults have freq=20 for all, but iso differs)
    // isoOffsets are part of geometry — should be independent
    expect(result.domainIsos[0]).not.toBe(result.domainIsos[1]);
  });

  it('linkGeometry=true copies freq/thick/iso but types independent', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      linkType: false,
      linkGeometry: true,
    };
    const result = prefsToUniforms(prefs);
    // Geometry should match domain 0
    for (let i = 1; i < 4; i++) {
      expect(result.domainFreqs[i]).toBe(result.domainFreqs[0]);
      expect(result.domainThicks[i]).toBe(result.domainThicks[0]);
      expect(result.domainIsos[i]).toBe(result.domainIsos[0]);
    }
    // Types should be independent (diverse: gyroid, schwarzP, diamond, iwp)
    expect(result.domainTypes[0]).not.toBe(result.domainTypes[1]);
  });

  it('linkType=true + linkGeometry=true is equivalent to old linkParams=true', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      linkType: true,
      linkGeometry: true,
    };
    const result = prefsToUniforms(prefs);
    for (let i = 1; i < 4; i++) {
      expect(result.domainTypes[i]).toBe(result.domainTypes[0]);
      expect(result.domainFreqs[i]).toBe(result.domainFreqs[0]);
      expect(result.domainThicks[i]).toBe(result.domainThicks[0]);
      expect(result.domainIsos[i]).toBe(result.domainIsos[0]);
    }
  });

  it('all link toggles false = fully independent domains', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      linkType: false,
      linkGeometry: false,
      linkColors: false,
    };
    const result = prefsToUniforms(prefs);
    // Diverse defaults: types differ, isos differ
    expect(result.domainTypes[0]).not.toBe(result.domainTypes[1]);
    expect(result.domainIsos[0]).not.toBe(result.domainIsos[1]);
  });

  it('old linkParams=true still overrides linkType+linkGeometry', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      linkParams: true,
      linkType: false,
      linkGeometry: false,
    };
    const result = prefsToUniforms(prefs);
    // linkParams=true should override — all domains match domain 0
    for (let i = 1; i < 4; i++) {
      expect(result.domainTypes[i]).toBe(result.domainTypes[0]);
      expect(result.domainFreqs[i]).toBe(result.domainFreqs[0]);
    }
  });
});

describe('prefsToUniforms corrupt store handling', () => {
  it('falls back to defaults for missing domainConfigs', () => {
    const prefs: LatticePreferences = {
      ...DEFAULT_LATTICE_PREFS,
      domainConfigs: undefined,
    };
    const result = prefsToUniforms(prefs);
    expect(result.domainTypes).toHaveLength(4);
    expect(result.domainFreqs[0]).toBe(DEFAULT_DOMAIN_CONFIGS[0].frequency);
  });

  it('falls back to defaults for wrong-length domainConfigs', () => {
    const prefs = {
      ...DEFAULT_LATTICE_PREFS,
      domainConfigs: [DEFAULT_DOMAIN_CONFIGS[0], DEFAULT_DOMAIN_CONFIGS[1]] as never,
    };
    const result = prefsToUniforms(prefs);
    expect(result.domainTypes).toHaveLength(4);
  });

  it('handles unknown tpmsMode string', () => {
    const prefs = {
      ...DEFAULT_LATTICE_PREFS,
      tpmsMode: 'invalid' as never,
    };
    const result = prefsToUniforms(prefs);
    expect(result.tpmsMode).toBe(0); // falls back to sheet
  });
});

describe('prefsToUniforms tpmsMode mapping', () => {
  it('sheet maps to 0', () => {
    const prefs = { ...DEFAULT_LATTICE_PREFS, tpmsMode: 'sheet' as const };
    expect(prefsToUniforms(prefs).tpmsMode).toBe(0);
  });

  it('solidA maps to 1', () => {
    const prefs = { ...DEFAULT_LATTICE_PREFS, tpmsMode: 'solidA' as const };
    expect(prefsToUniforms(prefs).tpmsMode).toBe(1);
  });

  it('solidB maps to 2', () => {
    const prefs = { ...DEFAULT_LATTICE_PREFS, tpmsMode: 'solidB' as const };
    expect(prefsToUniforms(prefs).tpmsMode).toBe(2);
  });
});

describe('computePhaseOffsets', () => {
  it('sync: all zeros', () => {
    const offsets = computePhaseOffsets('sync');
    expect(offsets).toEqual([0, 0, 0, 0]);
  });

  it('stagger: TAU/4 increments', () => {
    const offsets = computePhaseOffsets('stagger');
    expect(offsets[0]).toBeCloseTo(0, 5);
    expect(offsets[1]).toBeCloseTo(TAU / 4, 5);
    expect(offsets[2]).toBeCloseTo(TAU / 2, 5);
    expect(offsets[3]).toBeCloseTo(3 * TAU / 4, 5);
  });

  it('antiphase: alternating 0 and PI', () => {
    const offsets = computePhaseOffsets('antiphase');
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeCloseTo(Math.PI, 5);
    expect(offsets[2]).toBe(0);
    expect(offsets[3]).toBeCloseTo(Math.PI, 5);
  });
});
