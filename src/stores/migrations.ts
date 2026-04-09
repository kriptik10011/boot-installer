/**
 * AppStore Migrations — Zustand persist waterfall (v2 → v46).
 *
 * Each block mutates `state` and falls through to the next.
 * This ensures ALL migrations run even when jumping multiple versions.
 *
 * DO NOT reorder or remove migrations. Add new ones at the bottom.
 */

import { EMPTY_VITAL_LAYOUT } from '@/types/vitals';
import { DEFAULT_LATTICE_PREFS, DEFAULT_ARC_WIDGETS, DEFAULT_ARC_CARD_CONFIG, DEFAULT_DOMAIN_CONFIGS } from './defaults';

// Cast for historical migrations that reference fields removed in v53
const DEFAULTS = DEFAULT_LATTICE_PREFS as unknown as Record<string, unknown>;

export const STORE_VERSION = 70; // v70: Hint system — dismissedHints in gestureState

export function migrateStore(persistedState: unknown, version: number): Record<string, unknown> {
  let state = persistedState as Record<string, unknown>;
  if (version < 2) {
    state = { ...state, planningLivingMode: 'living', showInventory: true, onboardingStep: 0, financeViewMode: 'classic', vitalLayout: EMPTY_VITAL_LAYOUT };
  }
  if (version < 3) {
    state = { ...state, showInventory: state.showInventory ?? true, onboardingStep: state.onboardingStep ?? 0, financeViewMode: state.financeViewMode ?? 'classic', vitalLayout: state.vitalLayout ?? EMPTY_VITAL_LAYOUT };
  }
  if (version < 4) {
    state = { ...state, onboardingStep: state.onboardingStep ?? 0, financeViewMode: state.financeViewMode ?? 'classic', vitalLayout: state.vitalLayout ?? EMPTY_VITAL_LAYOUT };
  }
  if (version < 5) {
    state = { ...state, financeViewMode: state.financeViewMode ?? 'classic', vitalLayout: state.vitalLayout ?? EMPTY_VITAL_LAYOUT };
  }
  if (version < 6) {
    // v5→v6: aurora→living migration + add vitalLayout
    const fvm = state.financeViewMode === 'aurora' ? 'living' : (state.financeViewMode ?? 'classic');
    state = { ...state, financeViewMode: fvm, vitalLayout: state.vitalLayout ?? EMPTY_VITAL_LAYOUT };
  }
  if (version < 7) {
    // v6→v7: aquarium removed, migrate any aquarium state to radial
    const fvm7 = state.financeViewMode === 'aquarium' ? 'radial' : state.financeViewMode;
    state = { ...state, financeViewMode: fvm7 };
  }
  if (version < 8) {
    // v7→v8: Radial Arc Command + gesture tracking
    state = {
      ...state,
      financeViewMode: 'radial',
      gestureState: state.gestureState ?? {
        radialVisitCount: 0,
        hasUsedArcScroll: false,
        arcScrollCount: 0,
        hasUsedDirectionalDrag: false,
        gestureHintsShown: { tier1: 0, tier2: 0 },
      },
    };
  }
  if (version < 9) {
    // v8→v9: Living Lattice preferences
    state = {
      ...state,
      latticePrefs: state.latticePrefs ?? { ...DEFAULTS },
    };
  }
  if (version < 10) {
    // v9→v10: Expanded lattice prefs (6→15 fields) — dead fields stripped in v45
    const oldPrefs = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...oldPrefs,
        speedMultiplier: oldPrefs.speedMultiplier ?? DEFAULTS.speedMultiplier,
        fluidIntensity: oldPrefs.fluidIntensity ?? DEFAULTS.fluidIntensity,
      },
    };
  }
  if (version < 11) {
    // v10→v11: Enable multi-octave by default (now cheap: Gyroid-only detail)
    const oldPrefs = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...oldPrefs,
        detailLayers: (oldPrefs.detailLayers as number) ?? 2,
      },
    };
  }
  if (version < 12) {
    // v11→v12: Sentinel Dashboard — noise, depth prefs (Julia/attraction fields removed in v28)
    const oldPrefs = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...oldPrefs,
        noiseOctaves: oldPrefs.noiseOctaves ?? DEFAULTS.noiseOctaves,
        thicknessVariation: oldPrefs.thicknessVariation ?? DEFAULTS.thicknessVariation,
        fresnelIntensity: oldPrefs.fresnelIntensity ?? DEFAULTS.fresnelIntensity,
        aoStrength: oldPrefs.aoStrength ?? DEFAULTS.aoStrength,
        interiorDensity: oldPrefs.interiorDensity ?? DEFAULTS.interiorDensity,
      },
    };
  }
  if (version < 13) {
    // v12→v13: Meta-Material Engine (beam/voronoi/eversion fields removed in v28)
    const oldPrefs = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...oldPrefs,
        activePreset: null,
      },
    };
  }
  if (version < 14) {
    // v13→v14: Lattice Overhaul — regional TPMS, OKLab, coral (latticeMode removed in v28)
    const oldPrefs = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...oldPrefs,
        gradientStops: oldPrefs.gradientStops ?? DEFAULTS.gradientStops,
        gradientPreset: oldPrefs.gradientPreset ?? DEFAULTS.gradientPreset,
        activePreset: null,
      },
    };
  }
  if (version < 15) {
    // v14→v15: Lattice Overhaul v2 — coral octaves, harmonics, FBM, region tints, secondary TPMS (Julia fields removed in v28)
    const oldPrefs = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...oldPrefs,
        fbmLacunarity: oldPrefs.fbmLacunarity ?? DEFAULTS.fbmLacunarity,
        fbmPersistence: oldPrefs.fbmPersistence ?? DEFAULTS.fbmPersistence,
        regionTintN: oldPrefs.regionTintN ?? DEFAULTS.regionTintN,
        regionTintE: oldPrefs.regionTintE ?? DEFAULTS.regionTintE,
        regionTintS: oldPrefs.regionTintS ?? DEFAULTS.regionTintS,
        regionTintW: oldPrefs.regionTintW ?? DEFAULTS.regionTintW,
        fresnelTintColor: oldPrefs.fresnelTintColor ?? DEFAULTS.fresnelTintColor,
      },
    };
  }
  if (version < 16) {
    // v15→v16: TPMS Math Overhaul — Fourier harmonics, isovalue, sheet/skeletal, Julia rework
    // Note: isovalueShift, isovalueRadialGrad, sheetSkeletal removed in v44
    const oldPrefs = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...oldPrefs,
        juliaDisplaceMode: 0,
      },
    };
  }
  if (version < 17) {
    // v16→v17: Reset harmonics to 0 (GPU perf fix — was causing tab timeout)
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp,
        harmonicAmplitude2: 0,
        harmonicAmplitude3: 0,
      },
    };
  }
  if (version < 18) {
    // v17→v18: Reduce coralOctaves default 3→2 (ANGLE GPU perf) — coralOctaves removed in v45
    state = { ...state };
  }
  if (version < 19) {
    // v18→v19: Research Lab — tertiary TPMS, per-domain overrides, camera
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
        cameraMode: (lp.cameraMode as string) ?? 'static',
        cameraOrbitSpeed: (lp.cameraOrbitSpeed as number) ?? 0.15,
        cameraTilt: (lp.cameraTilt as number) ?? 5,
        cameraDistance: (lp.cameraDistance as number) ?? 3.0,
        cameraFixedAngle: (lp.cameraFixedAngle as number) ?? 0,
        regionThickness: lp.regionThickness ?? { north: 1, east: 1, south: 1, west: 1 },
        regionWarp: lp.regionWarp ?? { north: 1, east: 1, south: 1, west: 1 },
      },
    };
  }
  if (version < 20) {
    // v19→v20: Research Lab V2 — Julia integration, detail stack, heartbeat, topology, voronoi domains, DNA persistence
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
        juliaIntegrationMode: (lp.juliaIntegrationMode as number) ?? 0,
        mediumDetailFreq: (lp.mediumDetailFreq as number) ?? 2.0,
        mediumDetailAmp: (lp.mediumDetailAmp as number) ?? 0.0,
        mediumDetailTPMS: (lp.mediumDetailTPMS as string) ?? 'auto',
        mediumDetailBlendMode: (lp.mediumDetailBlendMode as string) ?? 'add',
        fineDetailFreq: (lp.fineDetailFreq as number) ?? 8.0,
        fineDetailAmp: (lp.fineDetailAmp as number) ?? 0.0,
        fineDetailTPMS: (lp.fineDetailTPMS as string) ?? 'auto',
        fineDetailBlendMode: (lp.fineDetailBlendMode as string) ?? 'add',
        curvatureLayer: (lp.curvatureLayer as number) ?? 0.0,
        thicknessLayer: (lp.thicknessLayer as number) ?? 0.0,
        stressLayer: (lp.stressLayer as number) ?? 0.0,
        flowLayer: (lp.flowLayer as number) ?? 0.0,
        voronoiDomainMode: (lp.voronoiDomainMode as string) ?? 'quadrant',
        voronoiDomainCount: (lp.voronoiDomainCount as number) ?? 4,
        voronoiBlendSmoothness: (lp.voronoiBlendSmoothness as number) ?? 0.3,
        dnaSnapshots: lp.dnaSnapshots ?? [],
        dnaLockedGenes: lp.dnaLockedGenes ?? [],
        evolutionPaused: (lp.evolutionPaused as boolean) ?? false,
        dnaGenerationHistory: lp.dnaGenerationHistory ?? [],
        evolutionPreset: (lp.evolutionPreset as string) ?? 'explore',
        evolutionSpeed: (lp.evolutionSpeed as number) ?? 1.0,
        evolutionInterval: (lp.evolutionInterval as number) ?? 5,
        autoBookmarkEnabled: (lp.autoBookmarkEnabled as boolean) ?? false,
        autoBookmarkGoals: lp.autoBookmarkGoals ?? {},
      },
    };
  }
  if (version < 21) {
    // v20→v21: V3 Research Workbench — fix broken uniforms, wire missing uniforms, visible detail stack
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
        // New fields
        voronoiTimeScale: (lp.voronoiTimeScale as number) ?? 0.1,
        foldOffset: (lp.foldOffset as number) ?? 0.5,
        juliaIterations: (lp.juliaIterations as number) ?? 10,
        researchLabOpen: (lp.researchLabOpen as boolean) ?? false,
        researchLabSplitPct: (lp.researchLabSplitPct as number) ?? 0.35,
        // Fix detail stack visibility (was 0.0 = invisible)
        mediumDetailAmp: (lp.mediumDetailAmp as number) === 0.0 ? 0.08 : ((lp.mediumDetailAmp as number) ?? 0.08),
        fineDetailAmp: (lp.fineDetailAmp as number) === 0.0 ? 0.04 : ((lp.fineDetailAmp as number) ?? 0.04),
      },
    };
  }
  if (version < 22) {
    // v21→v22: Reduce distracting motion defaults, fix magic divisors
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
        // Reduce distracting motion defaults for cleaner default experience
      },
    };
  }
  if (version < 23) {
    // v22→v23: Evolution pipeline fix, auto-snapshot, evolve-now wiring
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
      },
    };
  }
  if (version < 24) {
    // v23→v24: Roll back aggressive defaults that caused GPU timeout on ANGLE/D3D
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
        // Force safe values — these were too aggressive and caused WebGL context loss
        voronoiIntensity: 0.0,
        glowIntensity: 0.5,
        juliaDisplaceMode: 0,
        juliaIntensity: 0.5,
        juliaDisplaceIntensity: 0.5,
        juliaIterations: 10,
      },
    };
  }
  if (version < 25) {
    // v24→v25: Evolution pipeline fix — voronoi default, glow, manualOverride
    // CRITICAL: v24 forced voronoiIntensity to 0.0 which muted Voronoi entirely.
    // This migration restores it to a visible default for existing users.
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
        voronoiIntensity: 0.3,
        glowIntensity: 0.7,
        manualOverride: false,
      },
    };
  }
  if (version < 26) {
    // v25→v26: Shader Quality Overhaul — PBR lighting, analytic normals, overstep marcher
    // Switch default shading from MatCap (chrome) to PBR for cinematic quality.
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp,
        shadingStyle: 'pbr',
        lightIntensity: (lp.lightIntensity as number) ?? 2.5,
        roughnessBase: (lp.roughnessBase as number) ?? 0.35,
        metalnessBase: (lp.metalnessBase as number) ?? 0.1,
        // renderScale removed in v45
      },
    };
  }
  if (version < 27) {
    // v26→v27: Evolution pipeline fix — reset stuck flags that block evolution.
    const lp27 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp27,
        manualOverride: false,
        evolutionPaused: false,
        evolutionInterval: Math.min((lp27.evolutionInterval as number) ?? 3, 30),
      },
    };
  }
  if (version < 28) {
    // v27→v28: Dead code cleanup — strip removed Julia/Voronoi/Beam/Eversion fields
    const lp28 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const DEAD_KEYS = [
      'juliaIntensity', 'juliaDensity', 'juliaDisplaceMode', 'juliaDisplaceIntensity',
      'juliaIterations', 'juliaIntegrationMode', 'foldOffset',
      'voronoiIntensity', 'voronoiScale', 'voronoiTimeScale',
      'voronoiDomainMode', 'voronoiDomainCount', 'voronoiBlendSmoothness',
      'latticeMode', 'beamSpacing', 'beamThickness',
      'eversionSpeed', 'structuralMix',
    ];
    const cleaned = { ...lp28 };
    for (const key of DEAD_KEYS) {
      delete cleaned[key];
    }
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...cleaned,
      },
    };
  }
  if (version < 29) {
    // v28→v29: TPMS morphing — clamp evolution interval for existing users
    const lp29 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp29,
        evolutionInterval: Math.min((lp29.evolutionInterval as number) ?? 3, 30),
      },
    };
  }
  if (version < 30) {
    // v29→v30: Domain evolution — add per-domain evolution prefs
    const lp30 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp30,
        // domainEvolution* removed in v45
      },
    };
  }
  if (version < 31) {
    // v30→v31: Shader depth fix — wider domain blend, orbit camera, 15deg tilt
    const lp31 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    // Only change camera if user never customized (still at old defaults)
    const isDefaultCam = lp31.cameraMode === 'static' && lp31.cameraTilt === 5;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp31,
        domainBlendWidth: (lp31.domainBlendWidth as number) ?? 1.0,
        ...(isDefaultCam ? { cameraMode: 'orbit', cameraTilt: 15 } : {}),
      },
    };
  }
  if (version < 32) {
    // v31→v32: V2 DNA evolution — deprecated prefs marked, existing snapshots preserved
    const lp32 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp32,
      },
    };
  }
  if (version < 33) {
    // v32→v33: V2-only lattice — strip deprecated V1 prefs
    const lp33 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const V1_DEAD_KEYS = [
      'tpmsPreference', 'detailLevel', 'lineWeight', 'domainWarp',
      'regionTPMS', 'regionDensity', 'coralDetail',
      'harmonicAmplitude2', 'harmonicAmplitude3', 'roughnessBase',
      'manualOverride',
    ];
    const cleaned33 = { ...lp33 };
    for (const key of V1_DEAD_KEYS) {
      delete cleaned33[key];
    }
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...cleaned33,
      },
    };
  }
  if (version < 34) {
    // v33→v34: Remove evolution system — strip evolution prefs, add warpStrength
    const lp34 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const EVOLUTION_DEAD_KEYS = [
      'dnaSnapshots', 'dnaLockedGenes', 'evolutionPaused',
      'dnaGenerationHistory', 'evolutionPreset', 'evolutionSpeed',
      'evolutionInterval', 'autoBookmarkEnabled', 'autoBookmarkGoals',
    ];
    const cleaned34 = { ...lp34 };
    for (const key of EVOLUTION_DEAD_KEYS) {
      delete cleaned34[key];
    }
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...cleaned34,
        warpStrength: (cleaned34.warpStrength as number) ?? 0.15,
      },
    };
  }
  if (version < 35) {
    // v34→v35: appearance preference additions
    const lp35 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp35,
        cardBgOpacity: (lp35.cardBgOpacity as number) ?? 0.75,
        uiElementOpacity: (lp35.uiElementOpacity as number) ?? 0.9,
        cameraSnapBackDelay: (lp35.cameraSnapBackDelay as number) ?? 5.0,
        sidePanelLayout: (lp35.sidePanelLayout as string) ?? 'auto',
      },
    };
  }
  if (version < 36) {
    // v35→v36: regionPrimaryTPMS addition
    const lp36 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp36,
        regionPrimaryTPMS: (lp36.regionPrimaryTPMS as Record<string, string>) ?? DEFAULTS.regionPrimaryTPMS,
      },
    };
  }
  if (version < 37) {
    // v36→v37: Add density/sharpness prefs
    const lp37 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp37,
        density: (lp37.density as number) ?? 8.0,
        sharpness: (lp37.sharpness as number) ?? 8.0,
      },
    };
  }
  if (version < 38) {
    // v37→v38: Bigger lattice — closer camera, full sphere, reset stale values
    const lp38 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp38,
        latticeSize: 100,
        cameraDistance: 2.3,
      },
    };
  }
  if (version < 39) {
    // v38→v39: Radial dashboard is now app hub — force radial mode for stale sessions
    state = {
      ...state,
      financeViewMode: 'radial',
    };
  }
  if (version < 40) {
    // v39→v40: Fix volume renderer — solid walls, working glow, tuned defaults
    const lp39 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp39,
        surfaceBlend: 0.4,
        interiorDensity: 0.5,
      },
    };
  }
  if (version < 41) {
    // v40→v41: Radial hub is now the app default view
    state = {
      ...state,
      activeView: 'radial',
    };
  }
  if (version < 42) {
    // v41→v42: Card shape preference
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp,
        cardShape: lp.cardShape ?? 'rectangular',
      },
    };
  }
  if (version < 43) {
    // v42→v43: Depth peel scroll zoom, bigger lattice
    const lp = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp,
        latticeDepth: 0.0,
        cameraDistance: 2.6,
      },
    };
  }
  if (version < 44) {
    // v43→v44: Dead pref cleanup — remove intelligence, detail stack, topology layers
    const lp44 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const DEAD_KEYS_V44 = [
      'detailLayers', 'mediumDetailFreq', 'mediumDetailAmp', 'mediumDetailTPMS',
      'mediumDetailBlendMode', 'fineDetailFreq', 'fineDetailAmp', 'fineDetailTPMS',
      'fineDetailBlendMode', 'curvatureLayer', 'thicknessLayer', 'stressLayer',
      'flowLayer', 'sheetSkeletal', 'isovalueShift', 'isovalueRadialGrad',
    ];
    const cleaned44 = { ...lp44 };
    for (const key of DEAD_KEYS_V44) {
      delete cleaned44[key];
    }
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...cleaned44,
      },
    };
  }
  if (version < 45) {
    // v44→v45: Remove dead prefs — secondary/tertiary TPMS, coral, domainEvolution, renderScale, regionHarmonic
    const lp45 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const DEAD_KEYS_V45 = [
      'complexityCap', 'colorHigh', 'colorLow', 'shadingStyle',
      'coralFreq', 'coralOctaves',
      'regionSecondaryTPMS', 'regionSecondaryBlend',
      'regionTertiaryTPMS', 'regionTertiaryBlend', 'tertiaryBlendMode',
      'regionHarmonic',
      'renderScale', 'domainEvolutionEnabled', 'domainLockedDomains', 'domainEvolutionSpeed',
    ];
    const cleaned45 = { ...lp45 };
    for (const key of DEAD_KEYS_V45) {
      delete cleaned45[key];
    }
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...cleaned45,
      },
    };
  }
  if (version < 46) {
    // v45→v46: Add renderMode to latticePrefs
    const lp46 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: { ...DEFAULTS, ...lp46, renderMode: 'surface' },
    };
  }
  if (version < 47) {
    // v46→v47: add radial customization keys (junctionActions, arcWidgets)
    // Optional visual keys (arcColors, arcLabels, etc.) stay undefined = use hardcoded defaults
    const lp47 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...DEFAULTS,
        ...lp47,
        junctionActions: lp47.junctionActions ?? DEFAULTS.junctionActions,
        arcWidgets: lp47.arcWidgets ?? DEFAULTS.arcWidgets,
      },
    };
  }
  if (version < 48) {
    // v47→v48: Add radial preset system
    state = {
      ...state,
      radialPresets: [],
      activePresetId: null,
    };
  }
  if (version < 49) {
    // v48→v49: Add coordMode to latticePrefs
    const lp49 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: { ...lp49, coordMode: lp49.coordMode ?? 1 },
    };
  }
  if (version < 50) {
    // v49→v50: Reset coordMode to 1 (CartesianSphereFade) + reduce lightIntensity for ACES tone mapping
    const lp50 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: { ...lp50, coordMode: 1, lightIntensity: 1.2 },
    };
  }
  if (version < 51) {
    // v50→v51: Add roughness for PBR lighting
    const lp51 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: { ...lp51, roughness: 0.45 },
    };
  }
  if (version < 52) {
    // v51→v52: Add sssIntensity for subsurface scattering
    const lp52 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: { ...lp52, sssIntensity: 0.7 },
    };
  }
  if (version < 53) {
    // v52→v53: Phase B cleanup — strip dead lattice prefs fields
    const lp53 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const DEAD_KEYS_V53 = [
      'speedMultiplier', 'fluidIntensity', 'glowIntensity',
      'noiseOctaves', 'thicknessVariation',
      'fbmLacunarity', 'fbmPersistence',
      'fresnelIntensity', 'fresnelTintColor', 'aoStrength', 'interiorDensity',
      'regionTintN', 'regionTintE', 'regionTintS', 'regionTintW',
      'regionThickness', 'regionWarp',
      'warpStrength', 'surfaceBlend', 'domainBlendWidth', 'coordMode',
      'researchLabOpen', 'researchLabSplitPct',
      'nRepeats', 'shellThickness', 'radialScale',
      'cameraMode', 'cameraFixedAngle', 'uiElementOpacity',
    ];
    const cleaned53 = { ...lp53 };
    for (const key of DEAD_KEYS_V53) {
      delete cleaned53[key];
    }
    state = {
      ...state,
      latticePrefs: { ...DEFAULTS, ...cleaned53 },
    };
  }
  if (version < 54) {
    // v53→v54: Clean up worldMode/fogDensity if they snuck in
    const lp54 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    delete lp54.worldMode;
    delete lp54.fogDensity;
    state = { ...state, latticePrefs: lp54 };
  }
  if (version < 55) {
    // v54→v55: Add warpStrength + thicknessVariation
    const lp55 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    if (lp55.warpStrength == null) lp55.warpStrength = 0.0;
    if (lp55.thicknessVariation == null) lp55.thicknessVariation = 0.0;
    state = { ...state, latticePrefs: lp55 };
  }
  if (version < 56) {
    // v55→v56: Reset arcWidgets.east to single meals-main card (was 3-widget carousel)
    const lp56 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const aw = (lp56.arcWidgets ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp56,
        arcWidgets: { ...aw, east: ['meals-main'] },
      },
    };
  }
  if (version < 57) {
    // v56→v57: Reset arcWidgets.west to single inventory-main card (was 3-widget carousel)
    const lp57 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const aw57 = (lp57.arcWidgets ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp57,
        arcWidgets: { ...aw57, west: ['inventory-main'] },
      },
    };
  }
  if (version < 58) {
    // v57→v58: Reset arcWidgets.south to single finance-main card (was 3-widget carousel)
    const lp58 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const aw58 = (lp58.arcWidgets ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp58,
        arcWidgets: { ...aw58, south: ['finance-main'] },
      },
    };
  }
  if (version < 59) {
    // v58→v59: NE junction default → review-wizard (was dashboard)
    const lp59 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const ja59 = (lp59.junctionActions ?? {}) as Record<string, unknown>;
    // Only migrate if still on the old default — preserve user-customized values
    if (ja59.ne === 'dashboard' || ja59.ne == null) {
      state = {
        ...state,
        latticePrefs: {
          ...lp59,
          junctionActions: { ...ja59, ne: 'review-wizard' },
        },
      };
    }
  }
  if (version < 60) {
    // v59→v60: Default view preference — existing users keep radial, haven't explicitly chosen yet
    state = {
      ...state,
      defaultView: state.defaultView ?? 'radial',
      hasChosenDefaultView: state.hasChosenDefaultView ?? false,
    };
  }
  if (version < 61) {
    // v60→v61: reset arcWidgets to valid defaults.
    // Purges legacy slot IDs (week-glance, upcoming-events, budget-cap, etc.)
    // that were removed from ArcWidgetSlot.
    const lp61 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp61,
        arcWidgets: DEFAULT_ARC_WIDGETS,
      },
    };
  }
  if (version < 62) {
    // v61→v62: Arc card customization — set arcCardConfig defaults, keep arcWidgets for compat
    const lp62 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp62,
        arcCardConfig: lp62.arcCardConfig ?? DEFAULT_ARC_CARD_CONFIG,
      },
    };
  }
  if (version < 63) {
    // v62→v63: Persist context panel drag width
    state = {
      ...state,
      contextPanelWidth: state.contextPanelWidth ?? 480,
    };
  }
  if (version < 64) {
    // v63→v64: Multi-domain configs, animation, curvature, quality params
    const lp63 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp63,
        domainConfigs: lp63.domainConfigs ?? DEFAULT_DOMAIN_CONFIGS,
        blendWidth: lp63.blendWidth ?? 0.15,
        linkParams: lp63.linkParams ?? false,
        linkColors: lp63.linkColors ?? false,
        breathAmp: lp63.breathAmp ?? 0.0,
        breathSpeed: lp63.breathSpeed ?? 1.0,
        isoSweepAmp: lp63.isoSweepAmp ?? 0.0,
        isoSweepSpeed: lp63.isoSweepSpeed ?? 0.5,
        warpSpeed: lp63.warpSpeed ?? 0.03,
        morphTarget: lp63.morphTarget ?? 'gyroid',
        morphBlend: lp63.morphBlend ?? 0.0,
        phaseMode: lp63.phaseMode ?? 'sync',
        curvatureColorStrength: lp63.curvatureColorStrength ?? 1.5,
        curvatureMode: lp63.curvatureMode ?? 0,
        stepMult: lp63.stepMult ?? 0.6,
      },
    };
  }
  if (version < 65) {
    // v64→v65: TPMS bicontinuous domain mode
    const lp64 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp64,
        tpmsMode: lp64.tpmsMode ?? 'sheet',
      },
    };
  }
  if (version < 66) {
    // v65→v66: add translucency and maxLayers
    const lp65 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp65,
        translucency: lp65.translucency ?? 0.0,
        maxLayers: lp65.maxLayers ?? 3,
      },
    };
  }
  if (version < 67) {
    // v66→v67: add additional shader features (all default to 0 = off)
    const lp66 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      latticePrefs: {
        ...lp66,
        curvAO: lp66.curvAO ?? 0,
        kColor: lp66.kColor ?? 0,
        roughMod: lp66.roughMod ?? 0,
        rimStrength: lp66.rimStrength ?? 0,
        sssDensity: lp66.sssDensity ?? 0,
        thickOpacity: lp66.thickOpacity ?? 0,
        absorption: lp66.absorption ?? 0,
        absorptionColor: lp66.absorptionColor ?? '#ffcc80',
        auraScale: lp66.auraScale ?? 0,
        spatialColor: lp66.spatialColor ?? 0,
        atmoFog: lp66.atmoFog ?? 0,
      },
    };
  }
  if (version < 68) {
    // v67→v68: W3 production migration — 7 new uniforms + old default upgrade (D-W3-10 Option A)
    const lp67 = (state.latticePrefs ?? {}) as Record<string, unknown>;

    // Detect users who never changed a value (still at any known old default)
    const wasDefault = (key: string, ...oldValues: (number | undefined)[]) =>
      lp67[key] === undefined || oldValues.includes(lp67[key] as number);

    // Check if domain configs are still the old all-gyroid defaults (pre-W3.1).
    // Float equality is safe here: these values were set by JS object spread, never transformed.
    const dc = lp67.domainConfigs as Array<{ type: string; frequency: number; thickness: number }> | undefined;
    // Detect any known old domain defaults: all-gyroid (pre-W3.1) OR W3.1 diverse types at old freq/thick
    const isOldDomainDefaults = Array.isArray(dc) && dc.length === 4 && (
      dc.every(d => d.type === 'gyroid' && d.frequency === 8.5 && d.thickness === 0.12) ||
      dc.every(d => d.thickness === 0.30 && [9.5, 9.0, 4.0, 3.5].includes(d.frequency))
    );

    state = {
      ...state,
      latticePrefs: {
        ...lp67,
        // 7 new fields (always add with defaults)
        envWeight: lp67.envWeight ?? 0.55,
        shadowStrength: lp67.shadowStrength ?? 1.0,
        shadowPulse: lp67.shadowPulse ?? false,
        rimExponent: lp67.rimExponent ?? 1.5,
        rimColor: lp67.rimColor ?? 'auto',
        rimShadow: lp67.rimShadow ?? 1.0,
        rimAOMask: lp67.rimAOMask ?? 1.0,
        // Upgrade old scalar defaults to new rich values (D-W3-10 Option A)
        // Checks both v64 migration values and pre-W3.1 DEFAULT_LATTICE_PREFS values
        metalnessBase: wasDefault('metalnessBase', 0.75) ? 0.90 : lp67.metalnessBase,
        roughness: wasDefault('roughness', 0.55) ? 0.30 : lp67.roughness,
        curvatureColorStrength: wasDefault('curvatureColorStrength', 5.0) ? 1.5 : lp67.curvatureColorStrength,
        sssIntensity: wasDefault('sssIntensity', 0.15) ? 0.25 : lp67.sssIntensity,
        curvAO: wasDefault('curvAO', 0) ? 0.76 : lp67.curvAO,
        kColor: wasDefault('kColor', 0) ? 0.30 : lp67.kColor,
        roughMod: wasDefault('roughMod', 0) ? 1.0 : lp67.roughMod,
        rimStrength: wasDefault('rimStrength', 0) ? 2.10 : lp67.rimStrength,
        atmoFog: wasDefault('atmoFog', 0) ? 0.05 : lp67.atmoFog,
        spatialColor: wasDefault('spatialColor', 0) ? 0.50 : lp67.spatialColor,
        breathAmp: wasDefault('breathAmp', 0.0, 0.15) ? 0.07 : lp67.breathAmp,
        breathSpeed: wasDefault('breathSpeed', 0.5, 1.0) ? 1.4 : lp67.breathSpeed,
        isoSweepAmp: wasDefault('isoSweepAmp', 0.0, 0.40) ? 0.13 : lp67.isoSweepAmp,
        warpSpeed: wasDefault('warpSpeed', 0.03, 0.15) ? 0.36 : lp67.warpSpeed,
        stepMult: wasDefault('stepMult', 0.6, 0.45) ? 0.4 : lp67.stepMult,
        latticeSize: wasDefault('latticeSize', 100) ? 80 : lp67.latticeSize,
        // Upgrade domain configs from all-gyroid to diverse types
        ...(isOldDomainDefaults ? { domainConfigs: DEFAULT_DOMAIN_CONFIGS } : {}),
      },
    };
  }
  if (version < 69) {
    // v68→v69: Phase A defaults — freq=20, thick=0.11, size=80%, stepMult=0.4
    const lp68 = (state.latticePrefs ?? {}) as Record<string, unknown>;
    const dc68 = lp68.domainConfigs as Array<{ frequency: number; thickness: number }> | undefined;
    // Detect v68 defaults (freq 9.5-20 at thick 0.30) or any old thick=0.30 config
    const needsDomainUpgrade = Array.isArray(dc68) && dc68.length === 4 &&
      dc68.every(d => d.thickness === 0.30 || d.thickness === 0.12);
    state = {
      ...state,
      latticePrefs: {
        ...lp68,
        stepMult: [0.6, 0.45, 0.4].includes(lp68.stepMult as number) ? 0.4 : lp68.stepMult,
        latticeSize: lp68.latticeSize === 100 ? 80 : lp68.latticeSize,
        // Granular link toggles (default false = per-domain)
        linkType: lp68.linkType ?? false,
        linkGeometry: lp68.linkGeometry ?? false,
        ...(needsDomainUpgrade ? { domainConfigs: DEFAULT_DOMAIN_CONFIGS } : {}),
      },
    };
  }
  if (version < 70) {
    // v69→v70: Hint system — add dismissedHints to gestureState
    const gs = (state.gestureState ?? {}) as Record<string, unknown>;
    state = {
      ...state,
      gestureState: {
        ...gs,
        dismissedHints: Array.isArray(gs.dismissedHints) ? gs.dismissedHints : [],
      },
    };
  }
  return state;
}
