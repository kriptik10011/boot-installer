/**
 * AppStore Defaults — default values for persisted state.
 */

import type { LatticePreferences, LatticeDomainConfig, FinanceViewMode, ArcWidgetSlot } from './types';
import type { ArcCardConfig } from '@/components/finance/radial/registry/types';

export const FINANCE_VIEW_CYCLE: FinanceViewMode[] = ['radial', 'classic', 'living'];

// Inline type to avoid circular dependency: defaults → arcGeometry → appStore → defaults
export const DEFAULT_ARC_WIDGETS: Record<'north' | 'east' | 'south' | 'west', ArcWidgetSlot[]> = {
  north: ['week-main'],
  east: ['meals-main'],
  south: ['finance-main'],
  west: ['inventory-main'],
};

// Re-export for migrations (avoids circular dependency with registry)
export { DEFAULT_ARC_CARD_CONFIG } from '@/components/finance/radial/registry/types';

// Default per-domain configs — matched to ShaderLab BASE_PRESET (W3.1)
// 4 distinct TPMS types with tuned frequencies, thickness, iso offsets, and color palettes
export const DEFAULT_DOMAIN_CONFIGS: [LatticeDomainConfig, LatticeDomainConfig, LatticeDomainConfig, LatticeDomainConfig] = [
  { type: 'gyroid',   frequency: 20, thickness: 0.11, isoOffset:  0.40, colors: ['#0a1840', '#1a3870', '#3070c0', '#50a0e0', '#80d0ff'] },
  { type: 'schwarzP', frequency: 20, thickness: 0.11, isoOffset: -0.40, colors: ['#401018', '#702030', '#c04050', '#e06050', '#ff9070'] },
  { type: 'diamond',  frequency: 20, thickness: 0.11, isoOffset:  0.30, colors: ['#0a3010', '#1a5020', '#309040', '#50b860', '#80e888'] },
  { type: 'iwp',      frequency: 20, thickness: 0.11, isoOffset:  0.60, colors: ['#280a40', '#481a68', '#7830a0', '#a050c8', '#c880f0'] },
];

export const DEFAULT_LATTICE_PREFS: LatticePreferences = {
  density: 8.0,
  sharpness: 8.0,
  latticeSize: 80,
  renderMode: 'surface',
  lightIntensity: 1.3,
  metalnessBase: 0.90,
  roughness: 0.30,
  sssIntensity: 0.25,
  gradientStops: ['#0a0a1a', '#0891b2', '#7c3aed', '#f59e0b', '#fef3c7'] as [string, string, string, string, string],
  gradientPreset: 'coral-reef',
  regionPrimaryTPMS: { north: 'gyroid', east: 'diamond', south: 'schwarzP', west: 'neovius' },
  warpStrength: 0.4,
  thicknessVariation: 0.0,
  cameraOrbitSpeed: 0.15,
  cameraTilt: 15,
  cameraDistance: 2.6,
  latticeDepth: 0.0,
  cardBgOpacity: 0.75,
  cameraSnapBackDelay: 5.0,
  sidePanelLayout: 'auto',
  cardShape: 'rectangular',
  activePreset: null,
  junctionActions: {
    nw: 'shopping-list',
    ne: 'review-wizard',
    se: 'habits',
    sw: 'settings',
  },
  arcWidgets: DEFAULT_ARC_WIDGETS,
  // Multi-domain + Animation defaults (all zero/disabled preserves pre-v64 look)
  domainConfigs: DEFAULT_DOMAIN_CONFIGS,
  blendWidth: 0.13,
  linkParams: false,
  linkColors: false,
  linkType: false,
  linkGeometry: false,
  breathAmp: 0,
  breathSpeed: 0,
  isoSweepAmp: 0,
  isoSweepSpeed: 0,
  warpSpeed: 0.36,
  morphTarget: 'gyroid',
  morphBlend: 0.0,
  phaseMode: 'sync',
  curvatureColorStrength: 1.5,
  curvatureMode: 0,
  stepMult: 0.4,
  tpmsMode: 'sheet',
  translucency: 0.0,
  maxLayers: 3,
  voidOpacity: 0.3,
  // Capstone shader features — tuned to match ShaderLab BASE_PRESET
  curvAO: 0.76,
  kColor: 0.30,
  roughMod: 1.0,
  rimStrength: 2.10,
  sssDensity: 0,
  thickOpacity: 0,
  absorption: 0,
  absorptionColor: '#ffcc88',
  auraScale: 0,
  spatialColor: 0.50,
  atmoFog: 0.05,
  // W3 rim/env/shadow enhancements (v68)
  envWeight: 0.55,
  shadowStrength: 1.0,
  shadowPulse: false,
  rimExponent: 1.5,
  rimColor: 'auto',
  rimShadow: 1.0,
  rimAOMask: 1.0,
};
