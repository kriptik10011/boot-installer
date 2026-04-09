/**
 * Store Migration Tests — verifies v67→v68 migration correctness.
 * Tests: new field defaults, old default upgrades (D-W3-10 Option A),
 * domain config upgrade, and preservation of custom values.
 */

import { describe, it, expect } from 'vitest';
import { migrateStore, STORE_VERSION } from '../migrations';
import { DEFAULT_LATTICE_PREFS, DEFAULT_DOMAIN_CONFIGS } from '../defaults';

describe('STORE_VERSION', () => {
  it('is 70', () => {
    expect(STORE_VERSION).toBe(70);
  });
});

describe('v67→v68 migration', () => {
  // Simulate a v67 persisted store with old defaults
  const oldDomainConfigs = [
    { type: 'gyroid', frequency: 8.5, thickness: 0.12, isoOffset: 0.0, colors: ['#111', '#222', '#333', '#444', '#555'] },
    { type: 'gyroid', frequency: 8.5, thickness: 0.12, isoOffset: 0.0, colors: ['#111', '#222', '#333', '#444', '#555'] },
    { type: 'gyroid', frequency: 8.5, thickness: 0.12, isoOffset: 0.0, colors: ['#111', '#222', '#333', '#444', '#555'] },
    { type: 'gyroid', frequency: 8.5, thickness: 0.12, isoOffset: 0.0, colors: ['#111', '#222', '#333', '#444', '#555'] },
  ];

  const v67State = {
    latticePrefs: {
      density: 8.0,
      metalnessBase: 0.75,
      roughness: 0.55,
      curvatureColorStrength: 5.0,
      sssIntensity: 0.15,
      curvAO: 0,
      kColor: 0,
      roughMod: 0,
      rimStrength: 0,
      atmoFog: 0,
      spatialColor: 0,
      breathAmp: 0.15,
      breathSpeed: 0.5,
      isoSweepAmp: 0.40,
      warpSpeed: 0.15,
      domainConfigs: oldDomainConfigs,
    },
  };

  it('adds 7 new fields with correct defaults', () => {
    const result = migrateStore(v67State, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.envWeight).toBe(0.55);
    expect(lp.shadowStrength).toBe(1.0);
    expect(lp.shadowPulse).toBe(false);
    expect(lp.rimExponent).toBe(1.5);
    expect(lp.rimColor).toBe('auto');
    expect(lp.rimShadow).toBe(1.0);
    expect(lp.rimAOMask).toBe(1.0);
  });

  it('upgrades old scalar defaults to new rich values (Option A)', () => {
    const result = migrateStore(v67State, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.metalnessBase).toBe(0.90);
    expect(lp.roughness).toBe(0.30);
    expect(lp.curvatureColorStrength).toBe(1.5);
    expect(lp.sssIntensity).toBe(0.25);
    expect(lp.curvAO).toBe(0.76);
    expect(lp.kColor).toBe(0.30);
    expect(lp.roughMod).toBe(1.0);
    expect(lp.rimStrength).toBe(2.10);
    expect(lp.atmoFog).toBe(0.05);
    expect(lp.spatialColor).toBe(0.50);
    expect(lp.breathAmp).toBe(0.07);
    expect(lp.breathSpeed).toBe(1.4);
    expect(lp.isoSweepAmp).toBe(0.13);
    expect(lp.warpSpeed).toBe(0.36);
  });

  it('upgrades v64 migration animation defaults too', () => {
    // Users who went through v64 migration got different defaults
    const v67WithV64Defaults = {
      latticePrefs: {
        ...v67State.latticePrefs,
        breathAmp: 0.0,      // v64 migration default
        breathSpeed: 1.0,    // v64 migration default
        isoSweepAmp: 0.0,    // v64 migration default
        warpSpeed: 0.03,     // v64 migration default
      },
    };
    const result = migrateStore(v67WithV64Defaults, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.breathAmp).toBe(0.07);
    expect(lp.breathSpeed).toBe(1.4);
    expect(lp.isoSweepAmp).toBe(0.13);
    expect(lp.warpSpeed).toBe(0.36);
  });

  it('upgrades old all-gyroid domain configs to current defaults', () => {
    const result = migrateStore(v67State, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    const dc = lp.domainConfigs as typeof DEFAULT_DOMAIN_CONFIGS;
    expect(dc).toEqual(DEFAULT_DOMAIN_CONFIGS);
    expect(dc[0].frequency).toBe(20);
    expect(dc[0].thickness).toBe(0.11);
  });

  it('upgrades W3.1 domain defaults (freq 9.5/thick 0.30) to current defaults', () => {
    const w31State = {
      latticePrefs: {
        ...v67State.latticePrefs,
        domainConfigs: [
          { type: 'gyroid',   frequency: 9.5, thickness: 0.30, isoOffset: 0.40, colors: ['#0a1840', '#1a3870', '#3070c0', '#50a0e0', '#80d0ff'] },
          { type: 'schwarzP', frequency: 9.0, thickness: 0.30, isoOffset: -0.40, colors: ['#401018', '#702030', '#c04050', '#e06050', '#ff9070'] },
          { type: 'diamond',  frequency: 4.0, thickness: 0.30, isoOffset: 0.30, colors: ['#0a3010', '#1a5020', '#309040', '#50b860', '#80e888'] },
          { type: 'iwp',      frequency: 3.5, thickness: 0.30, isoOffset: 0.60, colors: ['#280a40', '#481a68', '#7830a0', '#a050c8', '#c880f0'] },
        ],
      },
    };
    const result = migrateStore(w31State, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    const dc = lp.domainConfigs as typeof DEFAULT_DOMAIN_CONFIGS;
    expect(dc[0].frequency).toBe(20);
    expect(dc[0].thickness).toBe(0.11);
  });

  it('upgrades stepMult and latticeSize defaults', () => {
    const result = migrateStore(v67State, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.stepMult).toBe(0.4);
    expect(lp.latticeSize).toBe(80);
  });

  it('preserves custom values (does NOT upgrade)', () => {
    const customState = {
      latticePrefs: {
        ...v67State.latticePrefs,
        metalnessBase: 0.50,     // user customized
        roughness: 0.80,         // user customized
        curvAO: 0.45,            // user customized
        breathAmp: 0.10,         // user customized (not any known default)
        domainConfigs: [
          { type: 'diamond', frequency: 5.0, thickness: 0.20, isoOffset: 0.1, colors: ['#fff', '#fff', '#fff', '#fff', '#fff'] },
          { type: 'gyroid', frequency: 8.5, thickness: 0.12, isoOffset: 0.0, colors: ['#111', '#222', '#333', '#444', '#555'] },
          { type: 'gyroid', frequency: 8.5, thickness: 0.12, isoOffset: 0.0, colors: ['#111', '#222', '#333', '#444', '#555'] },
          { type: 'gyroid', frequency: 8.5, thickness: 0.12, isoOffset: 0.0, colors: ['#111', '#222', '#333', '#444', '#555'] },
        ],
      },
    };
    const result = migrateStore(customState, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.metalnessBase).toBe(0.50);
    expect(lp.roughness).toBe(0.80);
    expect(lp.curvAO).toBe(0.45);
    expect(lp.breathAmp).toBe(0.10);
    // Domain configs NOT upgraded (not all-gyroid)
    const dc = lp.domainConfigs as Array<{ type: string }>;
    expect(dc[0].type).toBe('diamond');
  });

  it('does not overwrite new fields if already present', () => {
    const alreadyMigratedState = {
      latticePrefs: {
        ...v67State.latticePrefs,
        envWeight: 0.30,
        shadowStrength: 0.50,
        rimExponent: 3.0,
      },
    };
    const result = migrateStore(alreadyMigratedState, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.envWeight).toBe(0.30);
    expect(lp.shadowStrength).toBe(0.50);
    expect(lp.rimExponent).toBe(3.0);
  });

  it('treats value equal to old default as upgradeable (Option A known trade-off)', () => {
    // A user who deliberately set metalnessBase=0.75 is indistinguishable from
    // "never touched it". Option A (D-W3-10) chooses to upgrade, accepting false positives.
    const state = { latticePrefs: { metalnessBase: 0.75, curvAO: 0 } };
    const result = migrateStore(state, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.metalnessBase).toBe(0.90);
    expect(lp.curvAO).toBe(0.76);
  });

  it('handles missing latticePrefs gracefully', () => {
    const result = migrateStore({}, 67);
    const lp = result.latticePrefs as Record<string, unknown>;
    expect(lp.envWeight).toBe(0.55);
    expect(lp.shadowStrength).toBe(1.0);
  });

  it('preserves non-lattice state through migration', () => {
    const stateWithOtherData = {
      ...v67State,
      someOtherKey: 'preserved',
      contextPanelWidth: 500,
    };
    const result = migrateStore(stateWithOtherData, 67);
    expect(result.someOtherKey).toBe('preserved');
    expect(result.contextPanelWidth).toBe(500);
  });
});

describe('v67→v68 migration idempotency', () => {
  it('applying migration twice produces same result', () => {
    const state = {
      latticePrefs: {
        metalnessBase: 0.75,
        roughness: 0.55,
        curvAO: 0,
      },
    };
    const once = migrateStore(state, 67);
    // Simulate re-running at v68 (should skip the v68 block)
    const twice = migrateStore(once, 68);
    expect(once.latticePrefs).toEqual(twice.latticePrefs);
  });
});

describe('full migration chain (v63→v68)', () => {
  it('upgrading from v63 produces valid state with new defaults', () => {
    // Minimal v63 state — has latticePrefs but no Phase 8+ fields
    const v63State = {
      latticePrefs: {
        density: 8.0,
        sharpness: 8.0,
        latticeSize: 100,
        renderMode: 'surface',
        metalnessBase: 0.75,
        roughness: 0.55,
        sssIntensity: 0.15,
      },
    };
    const result = migrateStore(v63State, 63);
    const lp = result.latticePrefs as Record<string, unknown>;
    // v64 fields present
    expect(lp.domainConfigs).toBeDefined();
    expect(lp.curvatureColorStrength).toBeDefined();
    // v67 fields present
    expect(lp.curvAO).toBeDefined();
    // v68 new fields present
    expect(lp.envWeight).toBe(0.55);
    expect(lp.shadowStrength).toBe(1.0);
    // v68 scalar upgrades applied (old defaults upgraded)
    expect(lp.metalnessBase).toBe(0.90);
    expect(lp.roughness).toBe(0.30);
  });
});

// ── v69→v70: Hint system (dismissedHints in gestureState) ──────────────

describe('v69→v70 migration', () => {
  it('adds dismissedHints: [] when gestureState exists without it', () => {
    const state = { gestureState: { radialVisitCount: 3, hasUsedArcScroll: true, arcScrollCount: 1, hasUsedDirectionalDrag: false, gestureHintsShown: { tier1: 0, tier2: 0 } } };
    const result = migrateStore(state, 69);
    const gs = result.gestureState as Record<string, unknown>;
    expect(gs.dismissedHints).toEqual([]);
    expect(gs.radialVisitCount).toBe(3);
  });

  it('preserves existing dismissedHints if already present', () => {
    const state = { gestureState: { radialVisitCount: 0, hasUsedArcScroll: false, arcScrollCount: 0, hasUsedDirectionalDrag: false, gestureHintsShown: { tier1: 0, tier2: 0 }, dismissedHints: ['right-click-back'] } };
    const result = migrateStore(state, 69);
    const gs = result.gestureState as Record<string, unknown>;
    expect(gs.dismissedHints).toEqual(['right-click-back']);
  });

  it('handles missing gestureState gracefully', () => {
    const result = migrateStore({}, 69);
    const gs = result.gestureState as Record<string, unknown>;
    expect(gs.dismissedHints).toEqual([]);
  });
});
