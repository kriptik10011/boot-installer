/**
 * Lattice Adapter — converts LatticePreferences store → shader uniform values.
 *
 * Wires store state to the infinite lattice shader.
 * Also provides the reverse: reading Leva controls into store format for persistence.
 *
 * Maps between:
 *   Store (LatticePreferences)  ←→  Shader (SHADER_LAB_DEFAULTS uniforms)
 *
 * Fallback defaults match DEFAULT_LATTICE_PREFS (store defaults).
 * clipRadius computed as (latticeSize/100)*0.9 — fits within arc ring.
 */

import type { LatticePreferences, PhaseMode } from '@/stores/types';
import { DEFAULT_DOMAIN_CONFIGS } from '@/stores/defaults';
import { TPMS_TYPE_MAP } from '@/shaders/tpms';
import { hexToLinear } from '@/shaderMath/colorConversion';

// --- Store → Shader Uniform Values ---

export interface ShaderUniformValues {
  // Per-domain arrays (4 each)
  domainTypes: number[];
  domainFreqs: number[];
  domainThicks: number[];
  domainIsos: number[];
  // Per-domain colors: 20 [r,g,b] tuples (4 domains x 5 stops, linear RGB)
  domainGradColors: [number, number, number][];
  // Material
  metallic: number;
  roughness: number;
  sssIntensity: number;
  curvatureColorStrength: number;
  curvatureMode: number;
  // Animation
  breathAmp: number;
  breathSpeed: number;
  isoSweepAmp: number;
  isoSweepSpeed: number;
  warpStrength: number;
  warpSpeed: number;
  morphTarget: number;
  morphBlend: number;
  // View
  brightness: number;
  clipRadius: number;
  stepMult: number;
  blendWidth: number; // world-space (already multiplied by clipRadius)
  tpmsMode: number; // 0=sheet, 1=solid A, 2=solid B
  // Translucency
  translucency: number; // 0-1 (0=opaque, 1=full glass)
  maxLayers: number;    // 1-5 multi-hit layer count
  // voidOpacity removed — no uVoidOpacity uniform exists in the GLSL shader
  // Capstone Layers 2-5
  curvAO: number;       // 0-2 — curvature AO proxy
  kColor: number;       // 0-2 — Gaussian K curvature color
  roughMod: number;     // 0-1 — normal-variation roughness
  rimStrength: number;  // 0-3 — rim/edge glow
  // QW features
  sssDensity: number;   // 0-10 — thickness SSS density
  thickOpacity: number; // 0-1 — thickness-based opacity
  absorption: number;   // 0-10 — Beer-Lambert absorption
  absorptionColor: [number, number, number]; // linear RGB
  auraScale: number;    // 0-1 — core+aura glow
  // Spatial color + atmospherics
  spatialColor: number; // 0-1 — position-based tint
  atmoFog: number;      // 0-1 — atmospheric fog
  // W3 rim/env/shadow enhancements
  envWeight: number;              // 0-1 — IBL environment weight
  shadowStrength: number;         // 0-1 — shadow intensity
  shadowPulse: number;            // 0 or 1 — periodic shadow modulation
  rimExponent: number;            // 0.5-5.0 — rim falloff exponent
  rimColor: [number, number, number]; // linear RGB, [-1,-1,-1] = auto
  rimShadow: number;              // 0-1 — shadow contribution to rim masking
  rimAOMask: number;              // 0-1 — AO contribution to rim masking
  // Camera (tilt in radians)
  orbitSpeed: number;
  cameraDistance: number;
  cameraTiltRad: number;
}

const tpmsToInt = (t: string): number => TPMS_TYPE_MAP[t] ?? 0;

// Sanitize numeric store values (guards NaN, Infinity, negative from corrupt store)
const safeNum = (v: unknown, def: number, min = 0, max = Infinity): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.max(min, Math.min(max, n));
};

// hexToLinear imported from @/shaderMath/colorConversion (shared, validated)

/**
 * Convert LatticePreferences → shader uniform values.
 * Handles linkParams/linkColors, domain config resolution, and color conversion.
 */
export function prefsToUniforms(prefs: LatticePreferences): ShaderUniformValues {
  // Validate domainConfigs: must be a 4-element array, fallback to defaults if corrupt
  const raw = prefs.domainConfigs;
  const configs = (Array.isArray(raw) && raw.length === 4)
    ? raw
    : DEFAULT_DOMAIN_CONFIGS;
  // Granular linking: linkParams overrides linkType+linkGeometry for backward compat
  const linkAll = prefs.linkParams ?? false;
  const linkT = linkAll || (prefs.linkType ?? false);
  const linkG = linkAll || (prefs.linkGeometry ?? false);
  const linkC = prefs.linkColors ?? false;

  const domainTypes: number[] = [];
  const domainFreqs: number[] = [];
  const domainThicks: number[] = [];
  const domainIsos: number[] = [];
  const domainGradColors: [number, number, number][] = [];

  for (let i = 0; i < 4; i++) {
    const typeSrc = linkT ? configs[0] : configs[i];
    const geoSrc = linkG ? configs[0] : configs[i];
    domainTypes.push(tpmsToInt(typeSrc.type));
    domainFreqs.push(safeNum(geoSrc.frequency, 6.0, 3, 20));
    domainThicks.push(safeNum(geoSrc.thickness, 0.08, 0.01, 1.5));
    domainIsos.push(safeNum(geoSrc.isoOffset, 0.0, -0.8, 0.8));

    const colorSrc = linkC ? configs[0] : configs[i];
    const colors = Array.isArray(colorSrc.colors) ? colorSrc.colors : [];
    for (let s = 0; s < 5; s++) {
      const hex = typeof colors[s] === 'string' ? colors[s] : '#000000';
      domainGradColors.push(hexToLinear(hex));
    }
  }

  // 0.9 gives sphere ~70% of viewport at cameraDistance=2.6, fitting inside arc ring
  const clipRadius = Math.max(0.1, (prefs.latticeSize / 100) * 0.9);

  return {
    domainTypes,
    domainFreqs,
    domainThicks,
    domainIsos,
    domainGradColors,
    metallic: safeNum(prefs.metalnessBase, 0.90, 0, 1),
    roughness: safeNum(prefs.roughness, 0.30, 0.05, 1),
    sssIntensity: safeNum(prefs.sssIntensity, 0.7, 0, 1),
    curvatureColorStrength: safeNum(prefs.curvatureColorStrength, 1.5, 0, 5),
    curvatureMode: safeNum(prefs.curvatureMode, 0, 0, 2),
    breathAmp: safeNum(prefs.breathAmp, 0.0, 0, 0.15),
    breathSpeed: safeNum(prefs.breathSpeed, 1.0, 0, 5),
    isoSweepAmp: safeNum(prefs.isoSweepAmp, 0.0, 0, 0.4),
    isoSweepSpeed: safeNum(prefs.isoSweepSpeed, 0.5, 0, 3),
    warpStrength: safeNum(prefs.warpStrength, 0.0, 0, 0.4),
    warpSpeed: safeNum(prefs.warpSpeed, 0.03, 0, 1.0),
    morphTarget: tpmsToInt(prefs.morphTarget ?? 'gyroid'),
    morphBlend: safeNum(prefs.morphBlend, 0.0, 0, 1),
    brightness: safeNum(prefs.lightIntensity, 1.2, 0.2, 3),
    clipRadius,
    stepMult: safeNum(prefs.stepMult, 0.4, 0.4, 1),
    // blendWidth in world-space: slider value * clipRadius (matches ShaderLab.tsx behavior)
    blendWidth: safeNum(prefs.blendWidth, 0.15, 0.02, 0.5) * clipRadius,
    tpmsMode: ({ sheet: 0, solidA: 1, solidB: 2 } as Record<string, number>)[prefs.tpmsMode ?? 'sheet'] ?? 0,
    translucency: safeNum(prefs.translucency, 0.0, 0, 1),
    maxLayers: Math.round(safeNum(prefs.maxLayers, 3, 1, 5)),
    // voidOpacity omitted — no uVoidOpacity uniform in GLSL
    // Capstone Layers 2-5
    curvAO: safeNum(prefs.curvAO, 0.76, 0, 0.8),
    kColor: safeNum(prefs.kColor, 0.30, 0, 1.5),
    roughMod: safeNum(prefs.roughMod, 1.0, 0, 1),
    rimStrength: safeNum(prefs.rimStrength, 2.10, 0, 3),
    // QW features
    sssDensity: safeNum(prefs.sssDensity, 0, 0, 10),
    thickOpacity: safeNum(prefs.thickOpacity, 0, 0, 1),
    absorption: safeNum(prefs.absorption, 0, 0, 10),
    absorptionColor: hexToLinear(prefs.absorptionColor ?? '#ffcc80'),
    auraScale: safeNum(prefs.auraScale, 0, 0, 1),
    // Spatial color + atmospherics
    spatialColor: safeNum(prefs.spatialColor, 0.50, 0, 1),
    atmoFog: safeNum(prefs.atmoFog, 0.05, 0, 1),
    // W3 rim/env/shadow enhancements
    envWeight: safeNum(prefs.envWeight, 0.55, 0, 1),
    shadowStrength: safeNum(prefs.shadowStrength, 1.0, 0, 1),
    shadowPulse: (prefs.shadowPulse ?? false) ? 1 : 0,
    rimExponent: safeNum(prefs.rimExponent, 1.5, 0.5, 5.0),
    rimColor: (prefs.rimColor === 'auto' || !prefs.rimColor || !/^#[0-9a-fA-F]{6}$/.test(prefs.rimColor))
      ? [-1, -1, -1] as [number, number, number]
      : hexToLinear(prefs.rimColor),
    rimShadow: safeNum(prefs.rimShadow, 1.0, 0, 1),
    rimAOMask: safeNum(prefs.rimAOMask, 1.0, 0, 1),
    orbitSpeed: safeNum(prefs.cameraOrbitSpeed, 0.15, 0, 0.5),
    cameraDistance: safeNum(prefs.cameraDistance, 2.6, 2.0, 5.0),
    // Convert degrees (store) → radians (shader)
    cameraTiltRad: (safeNum(prefs.cameraTilt, 15, -30, 30) * Math.PI) / 180,
  };
}

/**
 * Compute per-domain phase offsets from phase mode.
 */
export function computePhaseOffsets(mode: PhaseMode): [number, number, number, number] {
  const TAU = Math.PI * 2;
  if (mode === 'stagger') return [0, TAU / 4, TAU / 2, 3 * TAU / 4];
  if (mode === 'antiphase') return [0, Math.PI, 0, Math.PI];
  return [0, 0, 0, 0]; // sync
}
