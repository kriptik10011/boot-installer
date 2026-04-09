/**
 * Inventory Intelligence Hook (Simplified — Phase A5)
 *
 * Fetches fully computed inventory intelligence from backend.
 * All computation (health score, insights, aggregation) happens server-side.
 */

import { useQuery } from '@tanstack/react-query';
import { getCurrentWeekStart } from './usePatterns';
import { useBackendReady } from './useBackendReady';
import { intelligenceApi, intelligenceKeys } from '@/api/intelligence';

// =============================================================================
// TYPES (preserved for consumer compatibility)
// =============================================================================

export interface InventoryInsight {
  type:
    | 'expiring_soon'
    | 'low_stock'
    | 'depletion_prediction'
    | 'leftover_reminder'
    | 'usage_suggestion';
  itemId: number;
  itemName: string;
  message: string;
  reasoning: string;
  confidence: number;
  priority: 1 | 2 | 3 | 4 | 5;
  daysUntilAction?: number;
  suggestedAction?: string;
}

export interface InventoryHealth {
  score: number;
  label: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical';
  reasoning: string;
}

export interface InventoryIntelligence {
  insights: InventoryInsight[];
  health: InventoryHealth;
  expiringCount: number;
  lowStockCount: number;
  leftoverCount: number;
  lowStockMealAlertCount: number;
  trackingSuggestionCount: number;
  restockingPredictionCount: number;
  varietyScore: number | null;
  repeatedIngredientCount: number;
  confidence: number;
  isLearning: boolean;
  isLoading: boolean;
  totalQuantitySum: number;
  activeItemCount: number;
  locationCounts: Record<'pantry' | 'fridge' | 'freezer', number>;
  categoryBreakdown: Array<{ name: string; count: number }>;
  expiringWithDays: Array<{ id: number; name: string; daysLeft: number; quantity: number; unit?: string | null }>;
  lowStockDisplay: Array<{ id: number; name: string; currentQty: number }>;
  foodGroupFills: Partial<Record<'protein' | 'dairy' | 'grains' | 'vegetables' | 'fruits', number>>;
}

const DEFAULT_HEALTH: InventoryHealth = { score: 100, label: 'Excellent', reasoning: 'Loading...' };
const DEFAULT_LOCATIONS: Record<'pantry' | 'fridge' | 'freezer', number> = { pantry: 0, fridge: 0, freezer: 0 };

// =============================================================================
// HOOK
// =============================================================================

export function useInventoryIntelligence(): InventoryIntelligence {
  const weekStart = getCurrentWeekStart();
  const backendReady = useBackendReady();

  const { data: intel, isLoading } = useQuery({
    queryKey: intelligenceKeys.inventory(),
    queryFn: () => intelligenceApi.getInventory(),
    staleTime: 60_000,
    enabled: backendReady,
  });

  return {
    insights: (intel?.insights as InventoryInsight[]) ?? [],
    health: (intel?.health as InventoryHealth) ?? DEFAULT_HEALTH,
    expiringCount: (intel?.expiringCount as number) ?? 0,
    lowStockCount: (intel?.lowStockCount as number) ?? 0,
    leftoverCount: (intel?.leftoverCount as number) ?? 0,
    lowStockMealAlertCount: 0,
    trackingSuggestionCount: 0,
    restockingPredictionCount: 0,
    varietyScore: null,
    repeatedIngredientCount: 0,
    confidence: (intel?.confidence as number) ?? 0.5,
    isLearning: (intel?.isLearning as boolean) ?? true,
    isLoading,
    totalQuantitySum: (intel?.totalQuantitySum as number) ?? 0,
    activeItemCount: (intel?.activeItemCount as number) ?? 0,
    locationCounts: (intel?.locationCounts as Record<'pantry' | 'fridge' | 'freezer', number>) ?? DEFAULT_LOCATIONS,
    categoryBreakdown: (intel?.categoryBreakdown as Array<{ name: string; count: number }>) ?? [],
    expiringWithDays: (intel?.expiringWithDays as InventoryIntelligence['expiringWithDays']) ?? [],
    lowStockDisplay: (intel?.lowStockDisplay as InventoryIntelligence['lowStockDisplay']) ?? [],
    foodGroupFills: (intel?.foodGroupFills as InventoryIntelligence['foodGroupFills']) ?? {},
  };
}
