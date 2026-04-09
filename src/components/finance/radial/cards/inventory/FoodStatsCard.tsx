/**
 * FoodStatsCard — Inventory sub-arc "STATS" card.
 *
 * Default: CircularCardLayout with diversity hero + Variety + Expiring PillLists.
 * Drill-down: formZone states for diversity, waste risk, and restocking.
 * All overlays absorbed — no OverlayShell usage. Amber only, never red.
 */

import { useState, useMemo, useCallback } from 'react';
import { getMonday } from '@/utils/dateUtils';
import { useInventoryIntelligence } from '@/hooks/useInventoryIntelligence';
import { useIngredientVariety } from '@/hooks/usePatterns';
import { useRestockingPredictions, getCurrentWeekStart } from '@/hooks/usePatterns';
import { useCreateShoppingListItem } from '@/hooks';
import { useToastStore } from '@/stores/toastStore';
import { CIRCULAR_ROOT_STYLE, SUB_ARC_ACCENTS } from '../../cardTemplate';
import {
  CircularCardLayout, HeroMetric, PillList, ScrollZone,
  ProgressBar, InfoBanner,
} from '../../shapes';
import type { PillListItem } from '../../shapes';
import { ActionBar } from '../../shapes/ActionBar';
import {
  useFoodStatsHeroAdapter,
  useVarietyPillsAdapter,
  useWasteRiskPillsAdapter,
  useRestockPillsAdapter,
} from '../../registry/adapters/inventoryAdapters';

type DrillView = 'diversity' | 'waste' | 'restock' | null;

const ACCENT = SUB_ARC_ACCENTS.inventory;

export function FoodStatsCard() {
  const intelligence = useInventoryIntelligence();
  const hero = useFoodStatsHeroAdapter();
  const variety = useVarietyPillsAdapter();
  const waste = useWasteRiskPillsAdapter();
  const restockPreview = useRestockPillsAdapter();
  const [drillView, setDrillView] = useState<DrillView>(null);

  // Hooks called unconditionally (React rules) — data for drill-down states
  const weekStart = useMemo(() => getMonday(), []);
  const { data: varietyData } = useIngredientVariety(weekStart);
  const { data: predictions = [] } = useRestockingPredictions();
  const addToShoppingList = useCreateShoppingListItem();
  const addToast = useToastStore((s) => s.addToast);
  const restockWeekStart = getCurrentWeekStart();

  // ─── Diversity drill-down data ──────────────────────────────────────────────

  const varietyPct = Math.round((varietyData?.variety_score ?? 0) * 100);
  const varietyColor = varietyPct >= 70 ? '#4ade80' : varietyPct >= 40 ? '#fbbf24' : '#d97706';
  const totalUnique = varietyData?.total_unique ?? 0;

  const repeatedPills = useMemo(() => {
    const repeated = [...(varietyData?.repeated_ingredients ?? [])]
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count);
    return repeated.map((ing: { ingredient_name: string; count: number }) => ({
      label: ing.ingredient_name,
      badge: `${ing.count}x`,
      dotColor: varietyColor,
    }));
  }, [varietyData, varietyColor]);

  // ─── Waste drill-down data ────────────────────────────────────────────────

  const wasteSorted = useMemo(() =>
    [...intelligence.expiringWithDays].sort((a, b) => a.daysLeft - b.daysLeft),
  [intelligence.expiringWithDays]);

  const urgencyMsg = useMemo(() => {
    const urgentCount = wasteSorted.filter(i => i.daysLeft <= 1).length;
    const warningCount = wasteSorted.filter(i => i.daysLeft > 1 && i.daysLeft <= 3).length;
    return [
      urgentCount > 0 ? `${urgentCount} expiring today` : '',
      warningCount > 0 ? `${warningCount} within 3 days` : '',
    ].filter(Boolean).join(' / ');
  }, [wasteSorted]);

  const wastePills = useMemo(() =>
    wasteSorted.map((item) => ({
      label: item.name,
      badge: item.daysLeft === 0 ? 'today' : `${item.daysLeft}d`,
      dotColor: item.daysLeft <= 1 ? '#d97706' : item.daysLeft <= 3 ? '#fbbf24' : '#64748b',
    })),
  [wasteSorted]);

  // ─── Restock drill-down data ──────────────────────────────────────────────

  const handleAddToList = useCallback(
    (itemName: string) => {
      addToShoppingList.mutate(
        { name: itemName, week_start: restockWeekStart },
        {
          onSuccess: () => addToast({ message: `Added "${itemName}" to shopping list`, type: 'success', durationMs: 2000 }),
          onError: () => addToast({ message: `Failed to add "${itemName}"`, type: 'error', durationMs: 3000 }),
        },
      );
    },
    [addToShoppingList, restockWeekStart, addToast],
  );

  const needsRestock = useMemo(
    () =>
      (predictions as Array<{
        item_id: number;
        item_name: string;
        needs_restock: boolean;
        predicted_depletion_days: number | null;
      }>)
        .filter((p) => p.needs_restock)
        .sort((a, b) => (a.predicted_depletion_days ?? 999) - (b.predicted_depletion_days ?? 999)),
    [predictions],
  );

  const restockPills = useMemo(() =>
    needsRestock.map((item) => ({
      label: item.item_name,
      badge: item.predicted_depletion_days != null ? `~${item.predicted_depletion_days}d` : undefined,
      dotColor: (item.predicted_depletion_days != null && item.predicted_depletion_days <= 2) ? '#f59e0b' : '#fbbf24',
      onItemAction: () => handleAddToList(item.item_name),
      actionLabel: '+ List',
    })),
  [needsRestock, handleAddToList]);

  // ─── Pill click enrichment ──────────────────────────────────────────────────

  const addClick = (
    pills: { items: readonly PillListItem[]; header?: string; headerColor?: string; emptyMessage?: string; maxItems?: number },
    overlay: DrillView,
  ) => ({
    ...pills,
    items: pills.items.map(item => ({
      ...item,
      onItemClick: () => setDrillView(overlay),
    })),
  });

  const handleBack = useCallback(() => setDrillView(null), []);

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (!intelligence.isLoading && intelligence.activeItemCount === 0) {
    return (
      <div
        className="relative w-full h-full overflow-hidden flex items-center justify-center"
        style={CIRCULAR_ROOT_STYLE}
      >
        <HeroMetric value="--" label="No Data" sublabel="Add items to see stats" color="#64748b" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
      {/* Default: hero + pill grid */}
      {drillView === null && (
        <CircularCardLayout
          hero={<HeroMetric {...hero} />}
          pillZone={[
            <PillList key="variety" {...addClick(variety, 'diversity')} />,
            <PillList key="waste" {...addClick(waste, 'waste')} />,
            <PillList key="restock" {...addClick(restockPreview, 'restock')} />,
          ]}
        />
      )}

      {/* Diversity drill-down */}
      {drillView === 'diversity' && (
        <CircularCardLayout
          hero={<HeroMetric value="Diversity" label="FOOD STATS" sublabel={`${totalUnique} unique ingredients`} color={ACCENT} />}
          formZone={
            <>
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                <ProgressBar progress={varietyPct / 100} label="Variety" sublabel={`${varietyPct}%`} color={varietyColor} />
                <div style={{ marginTop: '1cqi' }}>
                  <PillList items={repeatedPills} header="MOST REPEATED" headerColor="#64748b"
                            emptyMessage="No repeated ingredients this week" maxItems={20} />
                </div>
              </ScrollZone>
              <ActionBar actions={[{ label: 'Back', variant: 'slate' as const, onClick: handleBack }]} />
            </>
          }
        />
      )}

      {/* Waste risk drill-down */}
      {drillView === 'waste' && (
        <CircularCardLayout
          hero={<HeroMetric value="Waste Risk" label="FOOD STATS" sublabel={`${wasteSorted.length} item${wasteSorted.length !== 1 ? 's' : ''}`} color={ACCENT} />}
          formZone={
            <>
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                {urgencyMsg && <InfoBanner message={urgencyMsg} variant="warning" />}
                <div style={{ marginTop: '1cqi' }}>
                  <PillList items={wastePills} header="EXPIRING" headerColor="#fbbf24"
                            emptyMessage="No items expiring soon" maxItems={30} />
                </div>
              </ScrollZone>
              <ActionBar actions={[{ label: 'Back', variant: 'slate' as const, onClick: handleBack }]} />
            </>
          }
        />
      )}

      {/* Restock drill-down */}
      {drillView === 'restock' && (
        <CircularCardLayout
          hero={<HeroMetric value="Restocking" label="FOOD STATS" sublabel={`${needsRestock.length} item${needsRestock.length !== 1 ? 's' : ''}`} color={ACCENT} />}
          formZone={
            <>
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                <PillList items={restockPills} header="NEEDS RESTOCK" headerColor="#f59e0b"
                          emptyMessage="Everything well stocked" maxItems={30} />
              </ScrollZone>
              <ActionBar actions={[{ label: 'Back', variant: 'slate' as const, onClick: handleBack }]} />
            </>
          }
        />
      )}
    </div>
  );
}
