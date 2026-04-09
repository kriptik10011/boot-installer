/**
 * ShaderLab Presets & Persistence
 *
 * Saves/restores Leva control values to localStorage.
 * Provides built-in presets and custom preset management.
 */

// --- Types (re-exported from shared shaderMath/types.ts) ---

import type { ShaderSettings } from '@/shaderMath/types';
export type { ShaderSettings } from '@/shaderMath/types';

export interface ShaderPreset {
  readonly id: string;
  readonly name: string;
  readonly builtin: boolean;
  readonly settings: ShaderSettings;
}

// --- Base Preset — clean, opaque, clear geometric structure ---
// KB: volumetric features OFF by default. Only warpStrength ON for organic feel.
// All advanced shader features = 0 so geometry reads clearly.

export const BASE_PRESET: ShaderSettings = {
  debugHeatmap: false,
  brightness: 1.2, clipRadius: 4.0, orbitSpeed: 0.03,
  cameraDistance: 14.5, stepMult: 0.45, surfaceMode: 0,
  blendWidth: 0.25, debugDomains: false,
  metallic: 0.90, roughness: 0.30,
  curvColorStr: 1.5,
  curvMode: 0, envWeight: 0.55,
  shadowStrength: 1.0, curvAO: 0.76, kColor: 0.30,
  roughMod: 1.0, rimStrength: 2.10, rimExponent: 1.5, rimColor: 'auto',
  rimShadow: 1.0, rimAOMask: 1.0, atmoFog: 0.05, spatialColor: 0.50,
  translucency: 0, maxLayers: 3, thickOpacity: 0,
  absorption: 0, absorptionColor: '#ffcc88', sssIntensity: 0.25,
  sssDensity: 0, auraScale: 0,
  shadowPulse: false,
  breathAmp: 0.07, breathSpeed: 1.4, isoSweepAmp: 0.13,
  isoSweepSpeed: 0.5, warpStrength: 0.40, warpSpeed: 0.36,
  morphTarget: 'iwp', morphBlend: 0.0, phaseMode: 'sync',
  linkParams: false, linkColors: false,
  d0type: 'gyroid', d0freq: 9.5, d0thick: 0.30, d0iso: 0.40,
  d0c0: '#0a1840', d0c1: '#1a3870', d0c2: '#3070c0', d0c3: '#50a0e0', d0c4: '#80d0ff',
  d1type: 'schwarzP', d1freq: 9.0, d1thick: 0.30, d1iso: -0.40,
  d1c0: '#401018', d1c1: '#702030', d1c2: '#c04050', d1c3: '#e06050', d1c4: '#ff9070',
  d2type: 'diamond', d2freq: 4.0, d2thick: 0.30, d2iso: 0.30,
  d2c0: '#0a3010', d2c1: '#1a5020', d2c2: '#309040', d2c3: '#50b860', d2c4: '#80e888',
  d3type: 'iwp', d3freq: 3.5, d3thick: 0.30, d3iso: 0.60,
  d3c0: '#280a40', d3c1: '#481a68', d3c2: '#7830a0', d3c3: '#a050c8', d3c4: '#c880f0',
};

// --- Glass Sculpture Preset ---
// User-discovered dielectric glass: metallic=0, roughness=0.05, SSS/AO/kColor maxed.
// 6 depth cues: diffuse backlighting, specular flow, SSS scatter+transmittance,
// Beer-Lambert absorption, curvature AO, kinetic depth from breathing.
// Still being refined — not finalized.

export const GLASS_SCULPTURE_PRESET: ShaderSettings = {
  ...BASE_PRESET,
  // View
  brightness: 0.9,
  orbitSpeed: 0.05,
  cameraDistance: 6.0,
  stepMult: 0.40,
  blendWidth: 0.25,
  // Material — user-tuned glass Fresnel interaction
  metallic: 0.0,
  roughness: 0.05,
  sssIntensity: 1.0,
  sssDensity: 20.0,
  curvAO: 0.17,
  kColor: 1.5,
  translucency: 1.0,
  roughMod: 1.0,
  rimStrength: 0.21,
  atmoFog: 0,
  spatialColor: 0,
  thickOpacity: 0.0,
  absorption: 3.0,
  absorptionColor: '#f58b00',
  auraScale: 0.15,
  // Animation
  breathAmp: 0.02,
  isoSweepAmp: 0.09,
  isoSweepSpeed: 0.3,
  warpStrength: 0.4,
  morphBlend: 0.50,
  phaseMode: 'antiphase',
  // Domain 0
  d0type: 'gyroid',
  d0freq: 3.0,
  d0thick: 0.10,
  d0iso: -0.10,
  d0c0: '#ffffff',
};

// --- Polished Ceramic Preset ---
// Smooth, glossy porcelain-like surface with subtle depth cues.
// Dielectric + low roughness + strong curvAO + gentle IBL.
// Cluster B aware: metallic=0 keeps IBL subtle (F0=0.04).
// No volumetric — opaque ceramic.

export const POLISHED_CERAMIC_PRESET: ShaderSettings = {
  ...BASE_PRESET,
  // View
  brightness: 1.1,
  orbitSpeed: 0.1,
  // Material — smooth dielectric, subtle reflections
  metallic: 0.0,
  roughness: 0.20,
  curvColorStr: 0.8,
  envWeight: 0.45,
  // Depth cues — porcelain depth
  shadowStrength: 0.35,
  curvAO: 0.16,
  kColor: 0.3,
  roughMod: 0.15,
  rimStrength: 0.12,
  atmoFog: 0.08,
  spatialColor: 0.1,
  // Animation — minimal organic
  warpStrength: 0.15,
  warpSpeed: 0.1,
  // Colors — porcelain: celadon, cream, warm white, cool gray (more domain separation)
  d0c0: '#8ab0c0', d0c1: '#a0c8d8', d0c2: '#d0e8f0', d0c3: '#b8d8e8', d0c4: '#90b8c8',
  d1c0: '#c0a888', d1c1: '#d8c0a0', d1c2: '#f0e0c8', d1c3: '#e8d4b0', d1c4: '#d0b898',
  d2c0: '#88b0a0', d2c1: '#a0c8b8', d2c2: '#c8e8d8', d2c3: '#b0d8c8', d2c4: '#98c0b0',
  d3c0: '#a0a0b8', d3c1: '#b8b8d0', d3c2: '#d8d8f0', d3c3: '#c8c8e0', d3c4: '#b0b0c8',
};

// --- Brushed Metal Preset ---
// Industrial metallic surface with IBL-driven reflections.
// High metallic + medium roughness + strong IBL for "brushed" specular.
// Cluster B aware: brightness reduced to 0.85 to avoid ACES overbright.
// roughMod creates curvature-varying roughness (flat=shiny, curved=matte).

export const BRUSHED_METAL_PRESET: ShaderSettings = {
  ...BASE_PRESET,
  // View — slightly dim to compensate for IBL + metallic sum
  brightness: 0.85,
  // Material — high metallic, IBL-driven
  metallic: 0.85,
  roughness: 0.40,
  curvColorStr: 0.6,
  envWeight: 0.55,
  // Depth cues — moderate AO, roughMod capped at 0.35 to avoid C-05 zone
  shadowStrength: 0.25,
  curvAO: 0.14,
  kColor: 0.5,
  roughMod: 0.35,
  rimStrength: 0.08,
  atmoFog: 0.1,
  spatialColor: 0.1,
  blendWidth: 0.25,
  // Colors — desaturated metallic grays: steel, warm gray, cool silver, dark gray
  d0c0: '#222830', d0c1: '#384048', d0c2: '#687880', d0c3: '#8898a0', d0c4: '#a8b8c0',
  d1c0: '#2a2420', d1c1: '#484038', d1c2: '#807068', d1c3: '#a09088', d1c4: '#b8a8a0',
  d2c0: '#262a2c', d2c1: '#3c4244', d2c2: '#707a7e', d2c3: '#909a9e', d2c4: '#aab4b8',
  d3c0: '#282428', d3c1: '#403c40', d3c2: '#706870', d3c3: '#908890', d3c4: '#a8a0a8',
};

// --- Translucent Jade Preset ---
// Semi-transparent jade/gemstone. Green-tinted absorption, visible internal layers.
// Cluster A aware: thin shells (thick=0.10, freq=5.0) for thickOpacity activation.
// C-01: 5.0*0.10=0.50 >= 0.09. C-03: 0.1*0.10=0.01 < 0.12.
// atmoFog=0, spatialColor=0 pinned (C-10: fog kills glass clarity).

export const TRANSLUCENT_JADE_PRESET: ShaderSettings = {
  ...BASE_PRESET,
  // View
  brightness: 0.95,
  cameraDistance: 5.5,
  stepMult: 0.45,
  blendWidth: 0.20,
  // Geometry — thin shells, varied iso per domain for geometric variety
  d0freq: 5.0, d0thick: 0.10, d0iso: 0.20,
  d1freq: 5.0, d1thick: 0.10, d1iso: -0.15,
  d2freq: 5.0, d2thick: 0.10, d2iso: 0.10,
  d3freq: 5.0, d3thick: 0.10, d3iso: -0.30,
  // Material — smooth jade with surface sheen
  metallic: 0.0,
  roughness: 0.08,
  curvColorStr: 0.6,
  envWeight: 0.30,
  // Depth cues — moderate, no fog
  shadowStrength: 0.2,
  curvAO: 0.08,
  kColor: 0.6,
  roughMod: 0.0,
  rimStrength: 0.15,
  atmoFog: 0,
  spatialColor: 0,
  // Volumetric — jade: less see-through, deeper green absorption
  translucency: 0.45,
  maxLayers: 4,
  thickOpacity: 0.5,
  absorption: 5.5,
  absorptionColor: '#2a8a4a',
  sssIntensity: 0.6,
  sssDensity: 5.0,
  auraScale: 0.1,
  // Animation — subtle
  isoSweepAmp: 0.05,
  isoSweepSpeed: 0.3,
  warpStrength: 0.2,
  // Colors — jade greens: emerald, teal, moss, sage
  d0c0: '#0a2a18', d0c1: '#1a4a30', d0c2: '#3a8a5a', d0c3: '#5aaa7a', d0c4: '#8ad0a0',
  d1c0: '#0a2828', d1c1: '#1a4848', d1c2: '#3a8888', d1c3: '#5ab0b0', d1c4: '#80d8d8',
  d2c0: '#182a0a', d2c1: '#304a1a', d2c2: '#508a3a', d2c3: '#70aa5a', d2c4: '#98d080',
  d3c0: '#1a2828', d3c1: '#2a4840', d3c2: '#4a8870', d3c3: '#6aaa90', d3c4: '#90d0b8',
};

// --- Organic / Biological Preset ---
// Living tissue feel. Warm SSS, breathing animation, membrane-like edges.
// Semi-translucent (not full glass) with strong SSS for backlit glow.
// C-02: breathAmp 0.04 <= 0.24 - 0.09/3.0 = 0.21. Safe.
// C-10: atmoFog 0.12 with translucency 0.45 — below warning threshold.

export const ORGANIC_PRESET: ShaderSettings = {
  ...BASE_PRESET,
  // View
  brightness: 1.0,
  cameraDistance: 5.5,
  blendWidth: 0.25,
  // Geometry — thicker walls to reduce background visibility
  d0freq: 3.0, d0thick: 0.24, d0iso: 0.20,
  d1freq: 3.0, d1thick: 0.24, d1iso: -0.20,
  d2freq: 3.0, d2thick: 0.24, d2iso: 0.15,
  d3freq: 3.0, d3thick: 0.24, d3iso: 0.30,
  // Material — skin-like
  metallic: 0.0,
  roughness: 0.45,
  curvColorStr: 1.0,
  envWeight: 0.15,
  // Depth cues — warm membrane
  shadowStrength: 0.25,
  curvAO: 0.20,
  kColor: 0.3,
  roughMod: 0.4,
  rimStrength: 0.18,
  atmoFog: 0.12,
  spatialColor: 0.25,
  // Volumetric — SSS reduced to avoid wash-out, higher aura for membrane edges
  translucency: 0.45,
  maxLayers: 3,
  thickOpacity: 0.0,
  absorption: 2.5,
  absorptionColor: '#ff7744',
  sssIntensity: 0.55,
  sssDensity: 4.0,
  auraScale: 0.18,
  // Animation — breathing + organic warp
  breathAmp: 0.04,
  breathSpeed: 0.8,
  isoSweepAmp: 0.03,
  isoSweepSpeed: 0.2,
  warpStrength: 0.3,
  warpSpeed: 0.1,
  phaseMode: 'stagger',
  // Colors — warm organic: coral, amber, olive/ochre (was terracotta, too similar to d0), mauve
  d0c0: '#3a1818', d0c1: '#5a2828', d0c2: '#c06050', d0c3: '#e08070', d0c4: '#ffa898',
  d1c0: '#302010', d1c1: '#504020', d1c2: '#b88040', d1c3: '#d0a050', d1c4: '#f0c878',
  d2c0: '#1a2810', d2c1: '#384a20', d2c2: '#708840', d2c3: '#90a850', d2c4: '#b8c870',
  d3c0: '#2a1828', d3c1: '#4a2840', d3c2: '#905070', d3c3: '#b07090', d3c4: '#d098b8',
};

// --- Mathematical Visualization Preset ---
// Clear topology readability. Curvature color-coded. Educational.
// High curvColorStr + kColor for maximum saddle/bowl differentiation.
// No animation, no volumetric, no IBL — pure direct lighting.
// High-contrast domain colors for clear differentiation.

export const MATH_VIZ_PRESET: ShaderSettings = {
  ...BASE_PRESET,
  // View
  brightness: 1.0,
  orbitSpeed: 0.08,
  // Material — clean lighting with minimal IBL for ambient fill
  metallic: 0.0,
  roughness: 0.35,
  curvColorStr: 1.5,
  curvMode: 0,
  envWeight: 0.15,
  // Depth cues — moderate curvature
  shadowStrength: 0.35,
  curvAO: 0.17,
  kColor: 0.6,
  roughMod: 0.0,
  rimStrength: 0.06,
  atmoFog: 0.05,
  spatialColor: 0.0,
  // Animation — subtle warp to soften domain boundaries
  warpStrength: 0.08,
  warpSpeed: 0.0,
  breathAmp: 0.0,
  isoSweepAmp: 0.0,
  morphBlend: 0.0,
  // Colors — high contrast per domain: blue, red, green, purple
  d0c0: '#0a1840', d0c1: '#1a3870', d0c2: '#3070c0', d0c3: '#50a0e0', d0c4: '#80d0ff',
  d1c0: '#401018', d1c1: '#702030', d1c2: '#c04050', d1c3: '#e06050', d1c4: '#ff9070',
  d2c0: '#0a3010', d2c1: '#1a5020', d2c2: '#309040', d2c3: '#50b860', d2c4: '#80e888',
  d3c0: '#280a40', d3c1: '#481a68', d3c2: '#7830a0', d3c3: '#a050c8', d3c4: '#c880f0',
};

// --- Built-in Presets ---

export const BUILT_IN_PRESETS: readonly ShaderPreset[] = [
  { id: 'base', name: 'Base', builtin: true, settings: BASE_PRESET },
  { id: 'glass-sculpture', name: 'Glass Sculpture', builtin: true, settings: GLASS_SCULPTURE_PRESET },
  { id: 'polished-ceramic', name: 'Polished Ceramic', builtin: true, settings: POLISHED_CERAMIC_PRESET },
  { id: 'brushed-metal', name: 'Brushed Metal', builtin: true, settings: BRUSHED_METAL_PRESET },
  { id: 'translucent-jade', name: 'Translucent Jade', builtin: true, settings: TRANSLUCENT_JADE_PRESET },
  { id: 'organic', name: 'Organic', builtin: true, settings: ORGANIC_PRESET },
  { id: 'math-viz', name: 'Math Visualization', builtin: true, settings: MATH_VIZ_PRESET },
];

// --- localStorage Persistence ---

const LS_SETTINGS_KEY = 'shader-lab-settings-v3';
const LS_PRESETS_KEY = 'shader-lab-presets-v3';

export function loadSettings(): Partial<ShaderSettings> | null {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Partial<ShaderSettings>;
  } catch {
    return null;
  }
}

export function saveSettings(settings: Record<string, unknown>): void {
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable — fail silently
  }
}

export function loadCustomPresets(): ShaderPreset[] {
  try {
    const raw = localStorage.getItem(LS_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: unknown) =>
      typeof p === 'object' && p !== null && 'id' in p && 'name' in p && 'settings' in p
    ) as ShaderPreset[];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: readonly ShaderPreset[]): void {
  try {
    localStorage.setItem(LS_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // localStorage unavailable — fail silently
  }
}
