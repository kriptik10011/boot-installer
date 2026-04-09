/**
 * AppStore Types — all interfaces and type aliases used by appStore.
 */

import type { MealType } from '@/types';
import type { VitalLayoutState } from '@/types/vitals';
import type { ArcPosition } from '@/components/finance/radial/utils/arcGeometry';
import type { JunctionId } from '@/components/finance/radial/utils/arcGeometry';

// Context for tracking which meal slot was clicked when entering cooking mode
// This enables auto-assignment: empty slot clicked → cook → meal entry created
export interface MealSlotContext {
  date: string;
  mealType: MealType;
}

// UI Mode: Traditional shows raw data, Intelligent shows insights/analysis
export type UiMode = 'traditional' | 'intelligent';

// Theme: Dark (default) or Light
export type ThemeMode = 'dark' | 'light' | 'system';

// Finance view mode: Radial (homepage), Classic (tabbed), Living (vitals dashboard)
export type FinanceViewMode = 'radial' | 'classic' | 'living';

// App-level active view: which top-level screen is shown
export type ActiveView = 'radial' | 'week' | 'cooking';

// Lattice visual preferences (persisted)
export type TpmsPreference = 'auto' | 'gyroid' | 'diamond' | 'schwarzP' | 'neovius' | 'iwp';

// Card shape in radial dashboard center area
export type CardShape = 'rectangular' | 'circular';

// Junction click behavior (what happens when user clicks a junction node)
export type JunctionAction =
  | 'shopping-list'   // current NW behavior — opens shopping list junction carousel
  | 'dashboard'       // opens comprehensive dashboard (kept for backwards compat)
  | 'review-wizard'   // opens WeeklyReviewWizard modal
  | 'habits'          // current SE behavior — opens habits junction carousel
  | 'settings'        // current SW behavior — opens settings junction carousel
  | 'week-view'       // navigate to WeekView
  | 'meals-view'      // navigate to MealView
  | 'none';           // junction is decorative — no action on click

// Widget slot identifiers — only IDs with a registered React component
export type ArcWidgetSlot =
  | 'week-main'
  | 'meals-main'
  | 'finance-main'
  | 'inventory-main';

// Metadata for the slot editor UI
export interface ArcWidgetMeta {
  id: ArcWidgetSlot;
  label: string;
  domain: 'week' | 'meals' | 'finance' | 'inventory';
  description: string;
}

// Per-domain lattice configuration (4 domains: N/E/S/W)
export interface LatticeDomainConfig {
  type: TpmsPreference;                     // TPMS surface type
  frequency: number;                        // 3-20 spatial frequency
  thickness: number;                        // 0.01-0.5 wall thickness
  isoOffset: number;                        // -0.8 to 0.8 isosurface offset
  colors: [string, string, string, string, string]; // 5-stop OKLab gradient (hex)
}

// Animation phase mode for per-domain offsets
export type PhaseMode = 'sync' | 'stagger' | 'antiphase';

// Curvature visualization mode
export type CurvatureMode = 0 | 1 | 2; // 0=Off, 1=Roughness Mod, 2=Debug Viz

export interface LatticePreferences {
  // Core geometry (wired to shader)
  density: number;               // 2-15 — TPMS spatial frequency
  sharpness: number;             // 2-20 — wall sharpness (higher = thinner walls)
  latticeSize: number;           // 50-100 (% → sphereRadius)
  renderMode: 'volume' | 'surface';  // volume=translucent layers, surface=crisp isosurface
  // PBR Lighting (wired to shader)
  lightIntensity: number;        // 0.5-5.0
  metalnessBase: number;         // 0-1
  roughness: number;             // 0-1 (0=mirror, 1=matte)
  sssIntensity: number;          // 0-1 (subsurface scattering strength)
  // OKLab Gradient (wired to shader — global, used when linkColors=true)
  gradientStops: [string, string, string, string, string];
  gradientPreset: string | null;
  // TPMS type per region (wired to shader via north in production)
  regionPrimaryTPMS: { north: TpmsPreference; east: TpmsPreference; south: TpmsPreference; west: TpmsPreference };
  // Geometry modifiers (wired to shader)
  warpStrength: number;          // 0-1 — domain warp intensity
  thicknessVariation: number;    // 0-1 — wall thickness varies by position
  // Camera (JS-side, not uniforms)
  cameraOrbitSpeed: number;      // 0.05-0.5
  cameraTilt: number;            // -30 to 30 degrees
  cameraDistance: number;        // 2.0-5.0
  latticeDepth: number;          // 0.0-0.7 — scroll zoom depth peel
  // UI appearance
  cardBgOpacity: number;         // 0.1-0.95
  cameraSnapBackDelay: number;   // 0-15s
  sidePanelLayout: 'auto' | 'none' | 'right' | 'both';
  cardShape: CardShape;
  // Preset system
  activePreset: string | null;
  // Arc/Junction customization
  arcColors?: Partial<Record<ArcPosition, string>>;
  arcLabels?: Partial<Record<ArcPosition, string>>;
  junctionColors?: Partial<Record<JunctionId, string>>;
  junctionLabels?: Partial<Record<JunctionId, string>>;
  junctionActions?: Partial<Record<JunctionId, JunctionAction>>;
  arcWidgets?: Partial<Record<ArcPosition, ArcWidgetSlot[]>>;
  arcCardConfig?: Partial<Record<ArcPosition, import('@/components/finance/radial/registry/types').ArcCardConfig>>;
  showJunctionLabels?: boolean;  // default true — toggle junction text labels
  // Shopping mode: fullscreen shopping experience (persistent until toggled off)
  shoppingMode?: boolean;

  // === Multi-domain + Animation (v64) ===

  // Per-domain configs (4 domains: North, East, South, West)
  domainConfigs?: [LatticeDomainConfig, LatticeDomainConfig, LatticeDomainConfig, LatticeDomainConfig];
  // Domain blending
  blendWidth?: number;            // 0.02-0.5 — domain transition width
  linkParams?: boolean;           // @deprecated — use linkType + linkGeometry instead
  linkColors?: boolean;           // true = all domains use domain 0 colors
  // Granular domain linking (v69)
  linkType?: boolean;             // true = all domains use domain 0 TPMS type
  linkGeometry?: boolean;         // true = all domains use domain 0 freq/thick/iso

  // Animation
  breathAmp?: number;             // 0-0.15 — thickness breathing amplitude
  breathSpeed?: number;           // 0-5 — breathing oscillation rate
  isoSweepAmp?: number;           // 0-0.4 — iso-value sweep amplitude
  isoSweepSpeed?: number;         // 0-3 — iso sweep rate
  warpSpeed?: number;             // 0-0.15 — domain warp time multiplier
  morphTarget?: TpmsPreference;   // target TPMS for morphing
  morphBlend?: number;            // 0-1 — morph transition (0=current, 1=target)
  phaseMode?: PhaseMode;          // per-domain phase offset pattern

  // Curvature
  curvatureColorStrength?: number; // 0-5 — curvature-to-color mapping strength
  curvatureMode?: CurvatureMode;   // Off/Roughness Mod/Debug Viz

  // Quality
  stepMult?: number;              // 0.4-1.0 — step size multiplier

  // TPMS bicontinuous domain mode (v65)
  tpmsMode?: 'sheet' | 'solidA' | 'solidB';

  // Translucency (v66)
  translucency?: number;          // 0-1 — 0=opaque (zero overhead), 1=full glass
  maxLayers?: number;             // 1-5 — multi-hit layer count for translucency

  // Void opacity — how opaque the gaps between TPMS walls are
  voidOpacity?: number;           // 0=transparent (stars show), 1=opaque dark voids

  // === Additional shader features (v67) ===

  // Capstone Layers 2-5
  curvAO?: number;                // 0-2 — curvature-based AO proxy (0=off, use SDF AO)
  kColor?: number;                // 0-2 — Gaussian K curvature color shift
  roughMod?: number;              // 0-1 — normal-variation roughness modulation
  rimStrength?: number;           // 0-1 — Fresnel rim/edge glow strength

  // QW features
  sssDensity?: number;            // 0-10 — thickness-based SSS density
  thickOpacity?: number;          // 0-1 — thin shells become more transparent
  absorption?: number;            // 0-10 — Beer-Lambert absorption density
  absorptionColor?: string;       // hex — absorption tint color (complement absorbed)
  auraScale?: number;             // 0-1 — core+aura dual-threshold glow

  // Spatial color + atmospherics
  spatialColor?: number;          // 0-1 — position-based albedo tint
  atmoFog?: number;               // 0-1 — atmospheric fog density

  // === W3 rim/env/shadow enhancements (v68) ===
  envWeight?: number;             // 0-1 — environment/IBL lighting weight
  shadowStrength?: number;        // 0-1 — shadow intensity
  shadowPulse?: boolean;          // periodic shadow modulation
  rimExponent?: number;           // 0.5-5.0 — rim falloff exponent
  rimColor?: string;              // hex or 'auto' — rim tint color
  rimShadow?: number;             // 0-1 — shadow contribution to rim masking
  rimAOMask?: number;             // 0-1 — AO contribution to rim masking
}

// Saved radial preset (user-created or built-in)
export interface RadialPreset {
  id: string;
  name: string;
  createdAt: string;            // ISO timestamp
  prefs: Partial<LatticePreferences>;
  builtin?: boolean;            // true = cannot be deleted, not stored in Zustand
}

// Gesture tracking state for Radial Arc Command (persisted)
export interface GestureState {
  radialVisitCount: number;
  hasUsedArcScroll: boolean;
  arcScrollCount: number;
  hasUsedDirectionalDrag: boolean;
  gestureHintsShown: { tier1: number; tier2: number };
  dismissedHints: string[];
}

// Planning/Living Mode: Manual override or auto-detection
// 'living' = Default, user is in their day (pull, don't push)
// 'planning' = User explicitly chose to do weekly planning
// 'auto' = Let the system detect (legacy behavior)
export type PlanningLivingMode = 'living' | 'planning' | 'auto';

// Module visibility settings
export interface ModuleSettings {
  events: boolean;
  meals: boolean;
  bills: boolean;
}

// Developer settings
export interface DeveloperSettings {
  showDebugPanel: boolean;
}

export interface AppStore {
  // First-run experience
  hasCompletedFirstRun: boolean;
  hasSeenSettingsTooltip: boolean;
  onboardingStep: number;
  completeFirstRun: () => void;
  dismissSettingsTooltip: () => void;
  setOnboardingStep: (step: number) => void;

  // Feature toggles
  showInventory: boolean;
  toggleInventory: () => void;

  // Week navigation
  currentWeekStart: string;
  setCurrentWeekStart: (date: string) => void;
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToThisWeek: () => void;

  // UI Mode (Traditional vs Intelligent)
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  toggleUiMode: () => void;

  // Theme
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;

  // Module visibility (Events, Meals, Bills)
  modules: ModuleSettings;
  setModuleEnabled: (module: keyof ModuleSettings, enabled: boolean) => void;
  toggleModule: (module: keyof ModuleSettings) => void;

  // Developer settings
  developer: DeveloperSettings;
  setShowDebugPanel: (show: boolean) => void;
  toggleDebugPanel: () => void;

  // Planning/Living Mode (manual override)
  planningLivingMode: PlanningLivingMode;
  setPlanningLivingMode: (mode: PlanningLivingMode) => void;
  togglePlanningLivingMode: () => void;

  // Reset functions for fresh start
  resetFirstRun: () => void;

  // Finance view mode (Radial, Classic tabs, Living Vitals)
  financeViewMode: FinanceViewMode;
  setFinanceViewMode: (mode: FinanceViewMode) => void;
  cycleFinanceViewMode: () => void;

  // Vital layout state (Living Vitals behavioral learning)
  vitalLayout: VitalLayoutState;
  setVitalLayout: (layout: VitalLayoutState) => void;

  // Gesture state (Radial Arc Command — persisted)
  gestureState: GestureState;
  setGestureState: (state: GestureState) => void;
  dismissHint: (hintId: string) => void;
  resetHints: () => void;

  // Living Lattice preferences (persisted)
  latticePrefs: LatticePreferences;
  setLatticePrefs: (prefs: Partial<LatticePreferences>) => void;
  resetLatticePrefs: () => void;

  // Radial presets (persisted)
  radialPresets: RadialPreset[];
  activePresetId: string | null;
  saveRadialPreset: (name: string) => void;
  loadRadialPreset: (id: string) => void;
  deleteRadialPreset: (id: string) => void;

  // Layer overrides for Design Hub isolation (NOT persisted — session-only)
  latticeLayerOverrides: Record<string, number>;
  setLatticeLayerOverrides: (overrides: Record<string, number>) => void;

  // Default view preference (first-time experience + settings)
  defaultView: 'radial' | 'week';
  hasChosenDefaultView: boolean;
  setDefaultView: (view: 'radial' | 'week') => void;

  // Active view — which top-level screen is shown (radial hub vs week view)
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  // Context panel width (persisted — remembers last drag position)
  contextPanelWidth: number;
  setContextPanelWidth: (width: number) => void;

  // Meal scheduling context bridge — set by MealsOverviewCard, read by RecipesCard WheelPicker
  lastMealSchedulingContext: MealSlotContext | null;
  setMealSchedulingContext: (ctx: MealSlotContext | null) => void;

  // Cooking Mode - App-level state for fullscreen cooking view
  // Per Intelligence Principles: This is a cognitive mode shift, not a CSS overlay
  isCookingMode: boolean;
  cookingRecipeId: number | null;
  cookingMealId: number | null;
  cookingMealSlotContext: MealSlotContext | null; // Track which slot was clicked for auto-assignment
  enterCookingMode: (recipeId: number, mealId: number | null, mealSlotContext?: MealSlotContext) => void;
  exitCookingMode: () => void;
}
