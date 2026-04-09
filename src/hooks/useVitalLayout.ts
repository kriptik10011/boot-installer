/**
 * useVitalLayout — Behavioral learning engine for Living Vitals.
 *
 * Tracks user interactions (opens, actions, dwell time) and computes
 * optimal sizing/ordering using EWMA (Exponential Weighted Moving Average).
 * Vitals the user interacts with more grow larger; neglected vitals shrink.
 *
 * Persistence: VitalLayoutState stored in appStore (Zustand persist).
 * Smart defaults: On first open, detects available data and populates vitals.
 */

import { useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import type {
  VitalType,
  VitalSize,
  VitalLayoutState,
  VitalInteraction,
  DataAvailability,
} from '@/types/vitals';
import { EMPTY_VITAL_LAYOUT } from '@/types/vitals';
import { getDefaultVitals, ALL_VITAL_TYPES } from '@/components/finance/vitals/vitalRegistry';
import {
  useBudgetCategories,
  useRecurringList,
  useDebtAccounts,
  useSavingsGoals,
  useInvestmentAccounts,
  useNetWorthCurrent,
} from '@/hooks/useFinanceV2';

// =============================================================================
// EWMA scoring constants
// =============================================================================

/** 14-day decay factor — older interactions count less */
const EWMA_DECAY_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/** Scoring weights for interaction types */
const WEIGHT_OPEN = 1.0;
const WEIGHT_ACTION = 2.0;
const WEIGHT_DWELL = 0.5; // per second

/** Size thresholds */
const THRESHOLD_LARGE = 0.7;
const THRESHOLD_STANDARD = 0.3;
const THRESHOLD_COMPACT_AGE_DAYS = 14;
const THRESHOLD_COMPACT_SCORE = 0.1;

// =============================================================================
// Scoring functions (pure, testable)
// =============================================================================

/**
 * Compute raw interaction score for a vital.
 */
export function computeRawScore(interaction: VitalInteraction): number {
  return (
    interaction.openCount * WEIGHT_OPEN +
    interaction.actionCount * WEIGHT_ACTION +
    (interaction.totalDwellMs / 1000) * WEIGHT_DWELL
  );
}

/**
 * Apply EWMA decay based on time since last interaction.
 */
export function applyDecay(rawScore: number, lastInteraction: number, now: number): number {
  const daysSince = (now - lastInteraction) / MS_PER_DAY;
  const decayFactor = Math.exp(-daysSince / EWMA_DECAY_DAYS);
  return rawScore * decayFactor;
}

/**
 * Compute behavioral size for a vital.
 */
export function computeSize(
  interaction: VitalInteraction | undefined,
  maxScore: number,
  now: number,
  isPinned: boolean
): VitalSize {
  if (!interaction || maxScore === 0) return 'standard';
  if (isPinned) return 'standard'; // Pinned vitals keep their default

  const rawScore = computeRawScore(interaction);
  const decayedScore = applyDecay(rawScore, interaction.lastInteraction, now);
  const normalizedScore = maxScore > 0 ? decayedScore / maxScore : 0;

  if (normalizedScore > THRESHOLD_LARGE) return 'large';
  if (normalizedScore > THRESHOLD_STANDARD) return 'standard';

  // Only compact if old enough AND low score
  const daysSince = (now - interaction.lastInteraction) / MS_PER_DAY;
  if (normalizedScore < THRESHOLD_COMPACT_SCORE && daysSince > THRESHOLD_COMPACT_AGE_DAYS) {
    return 'compact';
  }

  return 'standard';
}

// =============================================================================
// Hook
// =============================================================================

export interface UseVitalLayoutResult {
  /** Ordered list of active vital types (excludes removed) */
  orderedVitals: VitalType[];
  /** Computed size per vital */
  sizes: Record<string, VitalSize>;
  /** Pinned set */
  pinned: Set<string>;
  /** Removed set */
  removed: Set<string>;
  /** Full layout state */
  layout: VitalLayoutState;
  /** Record that user opened/expanded a vital */
  recordOpen: (type: VitalType) => void;
  /** Record that user took an action on a vital */
  recordAction: (type: VitalType) => void;
  /** Record dwell time (ms) on a vital */
  recordDwell: (type: VitalType, ms: number) => void;
  /** Move vital to a new position */
  reorder: (type: VitalType, newIndex: number) => void;
  /** Pin a vital's position */
  pin: (type: VitalType) => void;
  /** Unpin a vital */
  unpin: (type: VitalType) => void;
  /** Remove a vital (user can restore via VitalPicker) */
  removeVital: (type: VitalType) => void;
  /** Restore a previously removed vital */
  restoreVital: (type: VitalType) => void;
  /** Apply smart defaults based on data availability */
  applySmartDefaults: () => void;
}

export function useVitalLayout(): UseVitalLayoutResult {
  const vitalLayout = useAppStore((s) => s.vitalLayout);
  const setVitalLayout = useAppStore((s) => s.setVitalLayout);
  const layout = vitalLayout ?? EMPTY_VITAL_LAYOUT;

  // Data availability queries (for smart defaults)
  const { data: budgetCats } = useBudgetCategories();
  const { data: recurringList } = useRecurringList();
  const { data: debtAccounts } = useDebtAccounts();
  const { data: savingsGoals } = useSavingsGoals();
  const { data: investmentAccounts } = useInvestmentAccounts();
  const { data: netWorth } = useNetWorthCurrent();

  const dataAvailability = useMemo((): DataAvailability => ({
    hasBudget: Array.isArray(budgetCats) && budgetCats.length > 0,
    hasBills: Array.isArray(recurringList) && recurringList.length > 0,
    hasDebt: Array.isArray(debtAccounts) && debtAccounts.length > 0,
    hasSavings: Array.isArray(savingsGoals) && savingsGoals.length > 0,
    hasInvestments: Array.isArray(investmentAccounts) && investmentAccounts.length > 0,
    hasNetWorth: netWorth != null && typeof netWorth === 'object',
  }), [budgetCats, recurringList, debtAccounts, savingsGoals, investmentAccounts, netWorth]);

  // Smart defaults: auto-populate on first open
  const applySmartDefaults = useCallback(() => {
    if (layout.defaultsApplied) return;
    const defaults = getDefaultVitals(dataAvailability);
    setVitalLayout({
      ...layout,
      order: defaults,
      defaultsApplied: true,
    });
  }, [layout, dataAvailability, setVitalLayout]);

  // Compute sizes
  const now = Date.now();
  const sizes = useMemo(() => {
    const interactions = layout.interactions;
    const pinnedSet = new Set(layout.pinned);

    // Find max score for normalization
    let maxScore = 0;
    for (const key of layout.order) {
      const inter = interactions[key];
      if (inter) {
        const raw = computeRawScore(inter);
        const decayed = applyDecay(raw, inter.lastInteraction, now);
        if (decayed > maxScore) maxScore = decayed;
      }
    }

    const result: Record<string, VitalSize> = {};
    for (const type of layout.order) {
      result[type] = computeSize(interactions[type], maxScore, now, pinnedSet.has(type));
    }
    return result;
  }, [layout.order, layout.interactions, layout.pinned, now]);

  // Ordered vitals (exclude removed)
  const orderedVitals = useMemo(() => {
    const removedSet = new Set(layout.removed);
    return layout.order.filter((t) => !removedSet.has(t)) as VitalType[];
  }, [layout.order, layout.removed]);

  // Interaction recording helpers
  const updateInteraction = useCallback(
    (type: VitalType, updater: (prev: VitalInteraction) => VitalInteraction) => {
      const prev = layout.interactions[type] ?? {
        openCount: 0,
        actionCount: 0,
        lastInteraction: Date.now(),
        totalDwellMs: 0,
      };
      setVitalLayout({
        ...layout,
        interactions: {
          ...layout.interactions,
          [type]: updater(prev),
        },
      });
    },
    [layout, setVitalLayout]
  );

  const recordOpen = useCallback(
    (type: VitalType) =>
      updateInteraction(type, (prev) => ({
        ...prev,
        openCount: prev.openCount + 1,
        lastInteraction: Date.now(),
      })),
    [updateInteraction]
  );

  const recordAction = useCallback(
    (type: VitalType) =>
      updateInteraction(type, (prev) => ({
        ...prev,
        actionCount: prev.actionCount + 1,
        lastInteraction: Date.now(),
      })),
    [updateInteraction]
  );

  const recordDwell = useCallback(
    (type: VitalType, ms: number) =>
      updateInteraction(type, (prev) => ({
        ...prev,
        totalDwellMs: prev.totalDwellMs + ms,
        lastInteraction: Date.now(),
      })),
    [updateInteraction]
  );

  // Reorder
  const reorder = useCallback(
    (type: VitalType, newIndex: number) => {
      const current = [...layout.order];
      const fromIndex = current.indexOf(type);
      if (fromIndex === -1) return;
      current.splice(fromIndex, 1);
      current.splice(newIndex, 0, type);
      setVitalLayout({ ...layout, order: current });
    },
    [layout, setVitalLayout]
  );

  // Pin / Unpin
  const pin = useCallback(
    (type: VitalType) => {
      if (layout.pinned.includes(type)) return;
      setVitalLayout({
        ...layout,
        pinned: [...layout.pinned, type],
      });
    },
    [layout, setVitalLayout]
  );

  const unpin = useCallback(
    (type: VitalType) => {
      setVitalLayout({
        ...layout,
        pinned: layout.pinned.filter((t) => t !== type),
      });
    },
    [layout, setVitalLayout]
  );

  // Remove / Restore
  const removeVital = useCallback(
    (type: VitalType) => {
      const meta = ALL_VITAL_TYPES.find((t) => t === type);
      if (!meta) return;
      setVitalLayout({
        ...layout,
        removed: [...layout.removed, type],
      });
    },
    [layout, setVitalLayout]
  );

  const restoreVital = useCallback(
    (type: VitalType) => {
      const newRemoved = layout.removed.filter((t) => t !== type);
      const newOrder = layout.order.includes(type)
        ? layout.order
        : [...layout.order, type];
      setVitalLayout({
        ...layout,
        removed: newRemoved,
        order: newOrder,
      });
    },
    [layout, setVitalLayout]
  );

  return {
    orderedVitals,
    sizes,
    pinned: new Set(layout.pinned),
    removed: new Set(layout.removed),
    layout,
    recordOpen,
    recordAction,
    recordDwell,
    reorder,
    pin,
    unpin,
    removeVital,
    restoreVital,
    applySmartDefaults,
  };
}
