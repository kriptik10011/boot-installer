/**
 * Inventory domain adapter hooks (West arc).
 * All pure adapters — no Date.now() or nested queries needed.
 */

import { useMemo } from 'react';
import { useExpiringItems, useInventoryItems } from '@/hooks';
import { useInventoryIntelligence } from '@/hooks/useInventoryIntelligence';
import { useLowStockMeals, useRestockingPredictions, useIngredientVariety } from '@/hooks/usePatterns';
import { getMonday, parseDateLocal, getTodayLocal } from '@/utils/dateUtils';
import { inventoryHealthColor } from './sharedThresholds';
import type { StorageLocation } from '@/api/client';
import type {
  HeroMetricShapeProps,
  PillListShapeProps,
  StatGridShapeProps,
} from '../types';

// ── inventory-health ──

export function useInventoryHealthAdapter(): HeroMetricShapeProps {
  const intel = useInventoryIntelligence();
  const score = intel.health.score;
  return {
    value: score,
    label: intel.health.label,
    sublabel: intel.leftoverCount
      ? `${intel.leftoverCount} leftover${intel.leftoverCount === 1 ? '' : 's'}`
      : 'inventory health',
    color: inventoryHealthColor(score),
  };
}

// ── at-risk-meals ──

export function useAtRiskMealsAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: lowStockMealAlerts } = useLowStockMeals(periodStart);

  const mealsAtRisk = useMemo(() => {
    const map = new Map<string, number>();
    for (const alert of lowStockMealAlerts ?? []) {
      map.set(alert.recipe_name, (map.get(alert.recipe_name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, missingCount]) => ({
        label,
        badge: String(missingCount),
        dotColor: '#fb923c',
      }))
      .slice(0, 3);
  }, [lowStockMealAlerts]);

  return {
    items: mealsAtRisk.length > 0
      ? mealsAtRisk
      : [{ label: 'All meals covered', dotColor: '#34d399' }],
    header: 'At Risk',
    headerColor: '#fbbf24',
    emptyMessage: 'All meals covered',
    maxItems: 3,
  };
}

// ── expiring-soon ──

export function useExpiringSoonAdapter(): PillListShapeProps {
  const intel = useInventoryIntelligence();
  const items = intel.expiringWithDays.slice(0, 5).map((item) => ({
    label: item.name,
    badge: item.daysLeft === 0 ? 'today' : `${item.daysLeft}d`,
    dotColor: item.daysLeft <= 1 ? '#d97706' : '#f59e0b',
  }));

  return {
    items,
    header: 'Expiring',
    headerColor: '#fbbf24',
    emptyMessage: 'Nothing expiring',
    maxItems: 3,
  };
}

// ── low-stock-items ──

export function useLowStockItemsAdapter(): PillListShapeProps {
  const intel = useInventoryIntelligence();
  const items = intel.lowStockDisplay.slice(0, 5).map((item) => ({
    label: item.name,
    badge: `qty: ${item.currentQty}`,
    dotColor: '#fbbf24',
  }));

  return {
    items,
    header: 'Low Stock',
    headerColor: '#fbbf24',
    emptyMessage: 'All stocked up',
    maxItems: 3,
  };
}

// ── food-group-balance ──

export function useFoodGroupBalanceAdapter(): StatGridShapeProps {
  const intel = useInventoryIntelligence();
  const fills = intel.foodGroupFills;

  const stats = [
    { value: `${Math.round((fills.protein ?? 0) * 100)}%`, label: 'Protein', color: '#f97316' },
    { value: `${Math.round((fills.dairy ?? 0) * 100)}%`, label: 'Dairy', color: '#3b82f6' },
    { value: `${Math.round((fills.grains ?? 0) * 100)}%`, label: 'Grains', color: '#a16207' },
    { value: `${Math.round((fills.vegetables ?? 0) * 100)}%`, label: 'Vegs', color: '#22c55e' },
  ];

  return { stats, columns: 2, maxItems: 4 };
}

// ── pantry-suggestions ──

export function usePantrySuggestionsAdapter(): PillListShapeProps {
  // Derived from inventory insights — filter for usage suggestions
  const intel = useInventoryIntelligence();
  const items = intel.insights
    .filter((i) => i.type === 'usage_suggestion' || i.type === 'leftover_reminder')
    .slice(0, 3)
    .map((i) => ({ label: i.itemName, dotColor: '#34d399' }));

  return {
    items,
    header: 'Cook With',
    headerColor: '#34d399',
    emptyMessage: 'No suggestions',
    maxItems: 3,
  };
}

// ── restocking-predictions ──

export function useRestockingPredictionsAdapter(): PillListShapeProps {
  // Derived from inventory insights — filter for depletion predictions
  const intel = useInventoryIntelligence();
  const items = intel.insights
    .filter((i) => i.type === 'depletion_prediction' || i.type === 'low_stock')
    .slice(0, 3)
    .map((i) => ({
      label: i.itemName,
      badge: i.daysUntilAction != null ? `${i.daysUntilAction}d` : undefined,
      dotColor: '#f59e0b',
    }));

  return {
    items,
    header: 'Restock Soon',
    headerColor: '#f59e0b',
    emptyMessage: 'Nothing to restock',
    maxItems: 3,
  };
}

// ── inventory-location-counts ──

export function useInventoryLocationCountsAdapter(): StatGridShapeProps {
  const intel = useInventoryIntelligence();
  const locations = intel.locationCounts ?? {};
  const stats = Object.entries(locations)
    .slice(0, 4)
    .map(([label, value]) => ({
      value: value as number,
      label,
      color: '#fbbf24',
    }));

  return { stats, columns: 2, maxItems: 4 };
}

// ── Sub-arc card adapters ────────────────────────────────────────────────────

// ── expiring-count (ExpiringCard hero) ──

export function useExpiringCountAdapter(): HeroMetricShapeProps {
  const { data: rawItems = [] } = useExpiringItems(7);
  const now = parseDateLocal(getTodayLocal());

  // Filter to items with quantity > 0 AND expiring within 3 days (matches original card)
  const items = (rawItems as Array<{ quantity?: number; expiration_date: string | null }>)
    .filter(item => (item.quantity ?? 0) > 0)
    .map(item => {
      const expDate = item.expiration_date ? parseDateLocal(item.expiration_date) : now;
      const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / 86400000));
      return { ...item, daysLeft };
    })
    .filter(item => item.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const count = items.length;
  const todayCount = items.filter(i => i.daysLeft === 0).length;
  const tomorrowCount = items.filter(i => i.daysLeft === 1).length;

  // Dynamic label matching original card: TODAY / TOMORROW / SOON
  const label = count === 0
    ? 'EXPIRING'
    : todayCount > 0
      ? 'TODAY'
      : tomorrowCount > 0
        ? 'TOMORROW'
        : 'SOON';

  const sublabel = count === 0 ? 'All fresh' : 'expiring items';
  const minDays = items[0]?.daysLeft ?? 999;

  return {
    value: count,
    label,
    sublabel,
    color: minDays <= 1 ? '#d97706' : minDays <= 3 ? '#f59e0b' : '#fbbf24',
  };
}

// ── InventoryOverviewCard + FoodStatsCard adapters ──────────────────────────

// ── Internal helpers (not exported) ──

function computeDaysLeft(expirationDate: string | null): number | null {
  if (!expirationDate) return null;
  const now = parseDateLocal(getTodayLocal());
  const exp = parseDateLocal(expirationDate);
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 86400000));
}

function formatItemBadge(item: { quantity: number; unit: string | null; tracking_mode?: string }): string {
  if (item.tracking_mode === 'percentage') return `${item.quantity}%`;
  const unit = item.unit ? ` ${item.unit}` : '';
  return `${item.quantity}${unit}`;
}

function expiryDotColor(daysLeft: number | null): string | undefined {
  if (daysLeft === null) return undefined;
  if (daysLeft <= 1) return '#d97706';
  if (daysLeft <= 3) return '#f59e0b';
  if (daysLeft <= 7) return '#fbbf24';
  return undefined;
}

// ── inventory-overview-hero (InventoryOverviewCard) ──

export function useInventoryOverviewHeroAdapter(): HeroMetricShapeProps {
  const intel = useInventoryIntelligence();
  const score = intel.health.score;
  return {
    value: score,
    label: intel.health.label,
    sublabel: `${intel.activeItemCount} items tracked`,
    color: inventoryHealthColor(score),
  };
}

// ── location pills (InventoryOverviewCard: Pantry / Fridge / Freezer) ──

function useLocationPills(location: StorageLocation, header: string): PillListShapeProps {
  const { data: allItems = [] } = useInventoryItems();

  const items = useMemo(() =>
    allItems
      .filter(i => i.location === location && i.quantity > 0)
      .sort((a, b) => {
        const aDays = computeDaysLeft(a.expiration_date) ?? 999;
        const bDays = computeDaysLeft(b.expiration_date) ?? 999;
        if (aDays !== bDays) return aDays - bDays;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 4)
      .map(item => ({
        label: item.name,
        badge: formatItemBadge(item),
        dotColor: expiryDotColor(computeDaysLeft(item.expiration_date)),
      })),
    [allItems, location],
  );

  return { items, header, headerColor: '#fbbf24', emptyMessage: 'Empty', maxItems: 4 };
}

export function usePantryPillsAdapter(): PillListShapeProps {
  return useLocationPills('pantry', 'PANTRY');
}

export function useFridgePillsAdapter(): PillListShapeProps {
  return useLocationPills('fridge', 'FRIDGE');
}

export function useFreezerPillsAdapter(): PillListShapeProps {
  return useLocationPills('freezer', 'FREEZER');
}

// ── restock pills (InventoryOverviewCard bottom section) ──

export function useRestockPillsAdapter(): PillListShapeProps {
  const { data: predictions = [] } = useRestockingPredictions();

  const items = useMemo(() =>
    predictions
      .filter(p => p.needs_restock && (p.quantity ?? 0) > 0)
      .slice(0, 4)
      .map(p => ({
        label: p.item_name,
        badge: p.predicted_depletion_days != null ? `~${p.predicted_depletion_days}d` : undefined,
        dotColor: '#fbbf24',
      })),
    [predictions],
  );

  return { items, header: 'RESTOCK', headerColor: '#fbbf24', emptyMessage: 'All stocked up', maxItems: 4 };
}

// ── food-stats-hero (FoodStatsCard) ──

export function useFoodStatsHeroAdapter(): HeroMetricShapeProps {
  const weekStart = useMemo(() => getMonday(), []);
  const { data: variety } = useIngredientVariety(weekStart);
  const pct = Math.round((variety?.variety_score ?? 0) * 100);
  const unique = variety?.total_unique ?? 0;

  return {
    value: `${pct}%`,
    label: 'Diversity',
    sublabel: `${unique} unique ingredients`,
    color: pct >= 70 ? '#4ade80' : pct >= 40 ? '#fbbf24' : '#d97706',
  };
}

// ── variety pills (FoodStatsCard: food group breakdown) ──

export function useVarietyPillsAdapter(): PillListShapeProps {
  const intel = useInventoryIntelligence();
  const fills = intel.foodGroupFills;

  const GROUP_COLORS: Record<string, string> = {
    protein: '#f97316',
    dairy: '#3b82f6',
    grains: '#a16207',
    vegetables: '#22c55e',
    fruits: '#c084fc',
  };

  const items = useMemo(() =>
    Object.entries(fills)
      .filter(([, v]) => v != null)
      .map(([group, fill]) => ({
        label: group.charAt(0).toUpperCase() + group.slice(1),
        badge: `${Math.round((fill as number) * 100)}%`,
        dotColor: GROUP_COLORS[group] ?? '#94a3b8',
      })),
    [fills],
  );

  return { items, header: 'VARIETY', headerColor: '#34d399', emptyMessage: 'No data', maxItems: 5 };
}

// ── waste-risk pills (FoodStatsCard: expiring items, amber) ──

export function useWasteRiskPillsAdapter(): PillListShapeProps {
  const intel = useInventoryIntelligence();

  const items = useMemo(() =>
    intel.expiringWithDays.slice(0, 4).map(item => ({
      label: item.name,
      badge: item.daysLeft === 0 ? 'today' : `${item.daysLeft}d`,
      dotColor: item.daysLeft <= 1 ? '#d97706' : '#f59e0b',
    })),
    [intel.expiringWithDays],
  );

  return { items, header: 'EXPIRING', headerColor: '#d97706', emptyMessage: 'No waste risk', maxItems: 4 };
}
