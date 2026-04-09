/**
 * AppStore — Zustand persisted store for global app state.
 *
 * Types:      ./types.ts
 * Defaults:   ./defaults.ts
 * Migrations: ./migrations.ts
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getMonday, addWeeks } from '@/utils/dateUtils';
import { EMPTY_VITAL_LAYOUT } from '@/types/vitals';
import type { VitalLayoutState } from '@/types/vitals';

import type {
  AppStore,
  FinanceViewMode,
  ActiveView,
  GestureState,
  MealSlotContext,
  ModuleSettings,
  RadialPreset,
} from './types';
import { FINANCE_VIEW_CYCLE, DEFAULT_LATTICE_PREFS } from './defaults';
import { STORE_VERSION, migrateStore } from './migrations';
import { setViewTransitioning } from '@/api/core';

// Re-export all types and defaults for backward compatibility
export type {
  MealSlotContext,
  UiMode,
  ThemeMode,
  FinanceViewMode,
  ActiveView,
  TpmsPreference,
  CardShape,
  LatticePreferences,
  GestureState,
  PlanningLivingMode,
  ModuleSettings,
  DeveloperSettings,
  RadialPreset,
} from './types';
export { DEFAULT_LATTICE_PREFS } from './defaults';

// Built-in presets — constants, NOT stored in Zustand
export const BUILT_IN_PRESETS: RadialPreset[] = [
  {
    id: 'builtin-base',
    name: 'Base',
    createdAt: '2026-01-01T00:00:00Z',
    builtin: true,
    prefs: DEFAULT_LATTICE_PREFS,
  },
  {
    id: 'builtin-glass-sculpture',
    name: 'Glass Sculpture',
    createdAt: '2026-01-01T00:00:00Z',
    builtin: true,
    prefs: {
      // View — slower orbit, dimmer, wider camera for glass clarity
      lightIntensity: 0.9,
      cameraOrbitSpeed: 0.05,
      cameraDistance: 3.5,
      // Material — dielectric glass: no metal, mirror-smooth, full SSS
      metalnessBase: 0.0,
      roughness: 0.05,
      sssIntensity: 1.0,
      sssDensity: 20.0,
      curvAO: 0.17,
      kColor: 1.5,
      roughMod: 1.0,
      rimStrength: 0.21,
      atmoFog: 0,
      spatialColor: 0,
      // Glass volume
      translucency: 1.0,
      thickOpacity: 0.0,
      absorption: 3.0,
      absorptionColor: '#f58b00',
      auraScale: 0.15,
      // Animation — gentle breathing + morph
      breathAmp: 0.02,
      isoSweepAmp: 0.09,
      isoSweepSpeed: 0.3,
      warpStrength: 0.4,
      morphBlend: 0.50,
      phaseMode: 'antiphase' as const,
      // Domain 0 override — single gyroid, thin walls
      domainConfigs: [
        { type: 'gyroid' as const, frequency: 3.0, thickness: 0.10, isoOffset: -0.10, colors: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'] },
        { type: 'schwarzP' as const, frequency: 9.0, thickness: 0.30, isoOffset: -0.40, colors: ['#401018', '#702030', '#c04050', '#e06050', '#ff9070'] },
        { type: 'diamond' as const, frequency: 4.0, thickness: 0.30, isoOffset: 0.30, colors: ['#0a3010', '#1a5020', '#309040', '#50b860', '#80e888'] },
        { type: 'iwp' as const, frequency: 3.5, thickness: 0.30, isoOffset: 0.60, colors: ['#280a40', '#481a68', '#7830a0', '#a050c8', '#c880f0'] },
      ],
      // W3 enhancements
      envWeight: 0.55,
      shadowStrength: 1.0,
      shadowPulse: false,
    },
  },
];

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // First-run experience
      hasCompletedFirstRun: false,
      hasSeenSettingsTooltip: false,
      onboardingStep: 0,
      completeFirstRun: () => set({ hasCompletedFirstRun: true }),
      dismissSettingsTooltip: () => set({ hasSeenSettingsTooltip: true }),
      setOnboardingStep: (step) => set({ onboardingStep: step }),

      // Feature toggles
      showInventory: true,
      toggleInventory: () =>
        set((state) => ({ showInventory: !state.showInventory })),

      // Week navigation
      currentWeekStart: getMonday(),
      setCurrentWeekStart: (date) => set({ currentWeekStart: date }),
      goToPreviousWeek: () =>
        set((state) => ({ currentWeekStart: addWeeks(state.currentWeekStart, -1) })),
      goToNextWeek: () =>
        set((state) => ({ currentWeekStart: addWeeks(state.currentWeekStart, 1) })),
      goToThisWeek: () => set({ currentWeekStart: getMonday() }),

      // UI Mode (default to traditional until intelligent features are built)
      uiMode: 'traditional',
      setUiMode: (mode) => set({ uiMode: mode }),
      toggleUiMode: () =>
        set((state) => ({ uiMode: state.uiMode === 'traditional' ? 'intelligent' : 'traditional' })),

      // Theme (default to dark)
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      // Module visibility (all enabled by default)
      modules: {
        events: true,
        meals: true,
        bills: true,
      },
      setModuleEnabled: (module, enabled) =>
        set((state) => ({
          modules: { ...state.modules, [module]: enabled },
        })),
      toggleModule: (module) =>
        set((state) => ({
          modules: { ...state.modules, [module]: !state.modules[module] },
        })),

      // Planning/Living Mode — default to Living (the user must opt in to Planning)
      planningLivingMode: 'living',
      setPlanningLivingMode: (mode) => set({ planningLivingMode: mode }),
      togglePlanningLivingMode: () =>
        set((state) => ({
          planningLivingMode: state.planningLivingMode === 'living' ? 'planning' : 'living',
        })),

      // Developer settings (debug panel hidden by default)
      developer: {
        showDebugPanel: false,
      },
      setShowDebugPanel: (show) =>
        set((state) => ({
          developer: { ...state.developer, showDebugPanel: show },
        })),
      toggleDebugPanel: () =>
        set((state) => ({
          developer: { ...state.developer, showDebugPanel: !state.developer.showDebugPanel },
        })),

      // Reset first-run state (used after database deletion)
      resetFirstRun: () =>
        set({
          hasCompletedFirstRun: false,
          hasSeenSettingsTooltip: false,
          onboardingStep: 0,
        }),

      // Finance view mode (default: radial — the new homepage)
      financeViewMode: 'radial' as FinanceViewMode,
      setFinanceViewMode: (mode: FinanceViewMode) => set({ financeViewMode: mode }),
      cycleFinanceViewMode: () =>
        set((state) => {
          const idx = FINANCE_VIEW_CYCLE.indexOf(state.financeViewMode);
          const next = FINANCE_VIEW_CYCLE[(idx + 1) % FINANCE_VIEW_CYCLE.length];
          return { financeViewMode: next };
        }),

      // Vital layout state (Living Vitals behavioral learning)
      vitalLayout: EMPTY_VITAL_LAYOUT,
      setVitalLayout: (layout: VitalLayoutState) => set({ vitalLayout: layout }),

      // Gesture state (Radial Arc Command)
      gestureState: {
        radialVisitCount: 0,
        hasUsedArcScroll: false,
        arcScrollCount: 0,
        hasUsedDirectionalDrag: false,
        gestureHintsShown: { tier1: 0, tier2: 0 },
        dismissedHints: [],
      },
      setGestureState: (gestureState: GestureState) => set({ gestureState }),
      dismissHint: (hintId: string) =>
        set((state) => ({
          gestureState: {
            ...state.gestureState,
            dismissedHints: state.gestureState.dismissedHints.includes(hintId)
              ? state.gestureState.dismissedHints
              : [...state.gestureState.dismissedHints, hintId],
          },
        })),
      resetHints: () =>
        set((state) => ({
          gestureState: { ...state.gestureState, dismissedHints: [] },
        })),

      // Living Lattice preferences
      latticePrefs: { ...DEFAULT_LATTICE_PREFS },
      setLatticePrefs: (prefs) =>
        set((state) => ({
          latticePrefs: { ...state.latticePrefs, ...prefs },
        })),
      resetLatticePrefs: () =>
        set({ latticePrefs: { ...DEFAULT_LATTICE_PREFS } }),

      // Radial presets (user-created, persisted)
      radialPresets: [] as RadialPreset[],
      activePresetId: null as string | null,
      saveRadialPreset: (name: string) =>
        set((state) => ({
          radialPresets: [
            ...state.radialPresets,
            {
              id: crypto.randomUUID(),
              name,
              createdAt: new Date().toISOString(),
              prefs: { ...state.latticePrefs },
            },
          ],
        })),
      loadRadialPreset: (id: string) =>
        set((state) => {
          const all = [...BUILT_IN_PRESETS, ...state.radialPresets];
          const preset = all.find((p) => p.id === id);
          if (!preset) return state;
          return {
            latticePrefs: { ...state.latticePrefs, ...preset.prefs },
            activePresetId: id,
          };
        }),
      deleteRadialPreset: (id: string) =>
        set((state) => ({
          radialPresets: state.radialPresets.filter((p) => p.id !== id),
          activePresetId: state.activePresetId === id ? null : state.activePresetId,
        })),

      // Layer overrides for Design Hub (NOT persisted)
      latticeLayerOverrides: {},
      setLatticeLayerOverrides: (overrides) => set({ latticeLayerOverrides: overrides }),

      // Default view preference
      defaultView: 'radial' as 'radial' | 'week',
      hasChosenDefaultView: false,
      setDefaultView: (view: 'radial' | 'week') => {
        setViewTransitioning(true);
        set({ defaultView: view, hasChosenDefaultView: true, activeView: view });
        setTimeout(() => setViewTransitioning(false), 2000);
      },

      // Active view — radial hub is the default app screen
      activeView: 'radial' as ActiveView,
      setActiveView: (view: ActiveView) => {
        setViewTransitioning(true);
        set({ activeView: view });
        setTimeout(() => setViewTransitioning(false), 2000);
      },

      // Context panel width (persisted — remembers last drag position)
      contextPanelWidth: 480,
      setContextPanelWidth: (width: number) => set({ contextPanelWidth: width }),

      // Meal scheduling context bridge (D-9) — MealsOverviewCard → RecipesCard
      lastMealSchedulingContext: null,
      setMealSchedulingContext: (ctx) => set({ lastMealSchedulingContext: ctx }),

      // Cooking Mode - cognitive mode shift per Intelligence Principles
      // Not persisted - cooking mode should start fresh each session
      isCookingMode: false,
      cookingRecipeId: null,
      cookingMealId: null,
      cookingMealSlotContext: null,
      enterCookingMode: (recipeId, mealId, mealSlotContext) =>
        set({
          isCookingMode: true,
          cookingRecipeId: recipeId,
          cookingMealId: mealId,
          cookingMealSlotContext: mealSlotContext ?? null,
        }),
      exitCookingMode: () =>
        set({
          isCookingMode: false,
          cookingRecipeId: null,
          cookingMealId: null,
          cookingMealSlotContext: null,
        }),
    }),
    {
      name: 'weekly-review-settings',
      version: STORE_VERSION,
      partialize: (state) => ({
        hasCompletedFirstRun: state.hasCompletedFirstRun,
        hasSeenSettingsTooltip: state.hasSeenSettingsTooltip,
        onboardingStep: state.onboardingStep,
        uiMode: state.uiMode,
        theme: state.theme,
        modules: state.modules,
        developer: state.developer,
        planningLivingMode: state.planningLivingMode,
        showInventory: state.showInventory,
        financeViewMode: state.financeViewMode,
        vitalLayout: state.vitalLayout,
        gestureState: state.gestureState,
        latticePrefs: state.latticePrefs,
        radialPresets: state.radialPresets,
        activePresetId: state.activePresetId,
        activeView: state.activeView,
        defaultView: state.defaultView,
        hasChosenDefaultView: state.hasChosenDefaultView,
        contextPanelWidth: state.contextPanelWidth,
      }),
      migrate: migrateStore,
    }
  )
);
