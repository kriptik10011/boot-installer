/**
 * Shader Math Types — shared interfaces for constraint engine and shader system.
 *
 * Extracted from shaderPresets.ts to decouple the constraint engine from
 * the ShaderLab prototype. The constraint engine uses these types to validate
 * parameter combinations; production uses LatticePreferences (stores/types.ts).
 */

export interface ShaderSettings {
  // Quality
  debugHeatmap: boolean;
  // View
  brightness: number; clipRadius: number; orbitSpeed: number;
  cameraDistance: number; stepMult: number; surfaceMode: number;
  blendWidth: number; debugDomains: boolean;
  // Surface material
  metallic: number; roughness: number; curvColorStr: number; curvMode: number;
  envWeight: number;
  // Depth & shadows
  shadowStrength: number; curvAO: number; kColor: number;
  roughMod: number; rimStrength: number; rimExponent: number; rimColor: string;
  rimShadow: number; rimAOMask: number; atmoFog: number; spatialColor: number;
  // Glass & volume
  translucency: number; maxLayers: number; thickOpacity: number;
  absorption: number; absorptionColor: string; sssIntensity: number;
  sssDensity: number; auraScale: number;
  // Animation
  shadowPulse: boolean;
  breathAmp: number; breathSpeed: number; isoSweepAmp: number;
  isoSweepSpeed: number; warpStrength: number; warpSpeed: number;
  morphTarget: string; morphBlend: number; phaseMode: string;
  // Linking
  linkParams: boolean; linkColors: boolean;
  // Domain 0
  d0type: string; d0freq: number; d0thick: number; d0iso: number;
  d0c0: string; d0c1: string; d0c2: string; d0c3: string; d0c4: string;
  // Domain 1
  d1type: string; d1freq: number; d1thick: number; d1iso: number;
  d1c0: string; d1c1: string; d1c2: string; d1c3: string; d1c4: string;
  // Domain 2
  d2type: string; d2freq: number; d2thick: number; d2iso: number;
  d2c0: string; d2c1: string; d2c2: string; d2c3: string; d2c4: string;
  // Domain 3
  d3type: string; d3freq: number; d3thick: number; d3iso: number;
  d3c0: string; d3c1: string; d3c2: string; d3c3: string; d3c4: string;
}
