/**
 * Inventory hooks using TanStack Query
 *
 * Includes support for:
 * - Auto-filled expiration dates
 * - Expiration feedback (learning system)
 * - Leftover quick-select from recent meals
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  inventoryApi,
  type InventoryItem,
  type InventoryItemCreate,
  type InventoryItemUpdate,
  type InventoryCategory,
  type InventoryCategoryCreate,
  type StorageLocation,
  type ExpirationFeedback,
  type ExpirationFeedbackCreate,
  type RecentMeal,
  type LeftoverCreate,
  type BulkCreateResponse,
} from '@/api/client';
import { recordAction } from '@/services/observation';
import { invalidateIntelligence } from '@/utils/invalidateIntelligence';
import { useBackendReady } from './useBackendReady';

// Query keys for inventory
export const inventoryKeys = {
  all: ['inventory'] as const,
  categories: () => [...inventoryKeys.all, 'categories'] as const,
  items: () => [...inventoryKeys.all, 'items'] as const,
  itemsList: (location?: StorageLocation, categoryId?: number) =>
    [...inventoryKeys.items(), { location, categoryId }] as const,
  item: (id: number) => [...inventoryKeys.items(), id] as const,
  expiring: (days: number) => [...inventoryKeys.all, 'expiring', days] as const,
  lowStock: (threshold: number) => [...inventoryKeys.all, 'low-stock', threshold] as const,
  leftovers: (includeExpired?: boolean) => [...inventoryKeys.all, 'leftovers', { includeExpired }] as const,
  recentMeals: (days: number) => [...inventoryKeys.all, 'recent-meals', days] as const,
  expirationFeedback: (foodCategory?: string) => [...inventoryKeys.all, 'expiration-feedback', { foodCategory }] as const,
  foodGroupSummary: () => [...inventoryKeys.all, 'food-group-summary'] as const,
};

// =============================================================================
// Category Hooks
// =============================================================================

/**
 * Hook to fetch all inventory categories
 */
export function useInventoryCategories() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.categories(),
    queryFn: () => inventoryApi.listCategories(),
    staleTime: 10 * 60 * 1000, // 10 minutes (categories rarely change)
    enabled: backendReady,
  });
}

/**
 * Hook to create a new inventory category
 */
export function useCreateInventoryCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InventoryCategoryCreate) => inventoryApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.categories() });
    },
  });
}

/**
 * Hook to delete an inventory category
 */
export function useDeleteInventoryCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => inventoryApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

// =============================================================================
// Item Hooks
// =============================================================================

/**
 * Hook to fetch inventory items with optional filtering
 */
export function useInventoryItems(location?: StorageLocation, categoryId?: number) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.itemsList(location, categoryId),
    queryFn: () => inventoryApi.listItems(location, categoryId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch a single inventory item by ID
 */
export function useInventoryItem(id: number) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.item(id),
    queryFn: () => inventoryApi.getItem(id),
    enabled: backendReady && id > 0,
  });
}

/**
 * Hook to fetch items expiring within N days
 */
export function useExpiringItems(days: number = 7) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.expiring(days),
    queryFn: () => inventoryApi.getExpiring(days),
    staleTime: 60 * 1000, // 1 minute (expiration is time-sensitive)
    enabled: backendReady,
  });
}

/**
 * Hook to fetch items with low stock
 */
export function useLowStockItems(threshold: number = 1) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.lowStock(threshold),
    queryFn: () => inventoryApi.getLowStock(threshold),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch food group summary for bezel arcs.
 */
export function useFoodGroupSummary() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.foodGroupSummary(),
    queryFn: () => inventoryApi.getFoodGroupSummary(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to create a new inventory item
 */
export function useCreateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InventoryItemCreate) => inventoryApi.createItem(data),
    onSuccess: (newItem, variables) => {
      // ALWAYS invalidate cache first — this is the critical side effect
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      invalidateIntelligence(queryClient, 'inventory');

      // Record observation — non-critical, must not block cache update
      try {
        recordAction('inventory_item_added', 'inventory', newItem.id, {
          item_name: variables.name,
          quantity: variables.quantity,
          unit: variables.unit,
          location: variables.location,
          has_expiration: !!variables.expiration_date,
          category_id: variables.category_id,
        });
      } catch {
        // Observation recording is non-critical — don't block UI updates
      }
    },
  });
}

/**
 * Hook to bulk create inventory items in a single request.
 * Uses the batch endpoint to avoid rate limiting on large imports.
 */
export function useBulkCreateInventoryItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (items: InventoryItemCreate[]) => inventoryApi.bulkCreateItems(items),
    onSuccess: (result: BulkCreateResponse) => {
      // ALWAYS invalidate cache first — this is the critical side effect
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      invalidateIntelligence(queryClient, 'inventory');

      // Record observations — non-critical, must not block cache update
      for (const item of result.created) {
        try {
          recordAction('inventory_item_added', 'inventory', item.id, {
            item_name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            location: item.location,
            source: 'bulk_import',
          });
        } catch {
          // Observation recording is non-critical — don't block UI updates
        }
      }
    },
  });
}

/**
 * Hook to update an existing inventory item
 */
export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: InventoryItemUpdate }) =>
      inventoryApi.updateItem(id, data),
    onSuccess: (updatedItem, variables) => {
      // ALWAYS invalidate cache first — this is the critical side effect
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      invalidateIntelligence(queryClient, 'inventory');

      // Record observation — non-critical, must not block cache update
      try {
        const changedFields = Object.keys(variables.data).filter(
          (k) => variables.data[k as keyof InventoryItemUpdate] !== undefined
        );
        recordAction('inventory_item_updated', 'inventory', variables.id, {
          item_name: updatedItem.name,
          changed_fields: changedFields,
          quantity_changed: changedFields.includes('quantity'),
          expiration_changed: changedFields.includes('expiration_date'),
        });
      } catch {
        // Observation recording is non-critical — don't block UI updates
      }
    },
  });
}

/**
 * Hook to adjust inventory item quantity
 */
export function useAdjustQuantity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, adjustment }: { id: number; adjustment: number }) =>
      inventoryApi.adjustQuantity(id, adjustment),
    onSuccess: (updatedItem, variables) => {
      // ALWAYS invalidate cache first — this is the critical side effect
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      invalidateIntelligence(queryClient, 'inventory');

      // Record observation — non-critical, must not block cache update
      try {
        const isConsumption = variables.adjustment < 0;
        recordAction(
          isConsumption ? 'inventory_item_consumed' : 'inventory_item_restocked',
          'inventory',
          variables.id,
          {
            item_name: updatedItem.name,
            adjustment: variables.adjustment,
            new_quantity: updatedItem.quantity,
            day_of_week: new Date().getDay(),
          }
        );
      } catch {
        // Observation recording is non-critical — don't block UI updates
      }
    },
  });
}

/**
 * Hook to delete an inventory item
 */
export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => inventoryApi.deleteItem(id),
    onSuccess: (_data, id) => {
      // ALWAYS invalidate cache first — this is the critical side effect
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      invalidateIntelligence(queryClient, 'inventory');

      // Record observation — non-critical, must not block cache update
      try {
        recordAction('inventory_item_removed', 'inventory', id, {
          reason: 'deleted',
        });
      } catch {
        // Observation recording is non-critical — don't block UI updates
      }
    },
  });
}

// =============================================================================
// Leftover Hooks
// =============================================================================

/**
 * Hook to fetch leftover items
 */
export function useLeftovers(includeExpired: boolean = false) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.leftovers(includeExpired),
    queryFn: () => inventoryApi.getLeftovers(includeExpired),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch recent meals for leftover quick-select
 */
export function useRecentMeals(days: number = 7) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.recentMeals(days),
    queryFn: () => inventoryApi.getRecentMeals(days),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to create a leftover from a meal
 */
export function useCreateLeftover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LeftoverCreate) => inventoryApi.createLeftover(data),
    onSuccess: (newLeftover, variables) => {
      // ALWAYS invalidate cache first — this is the critical side effect
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });

      // Record observation — non-critical, must not block cache update
      try {
        recordAction('leftover_created', 'inventory', newLeftover.id, {
          meal_id: variables.meal_id,
          quantity: variables.quantity,
          day_of_week: new Date().getDay(),
        });
      } catch {
        // Observation recording is non-critical — don't block UI updates
      }
    },
  });
}

// =============================================================================
// Expiration Feedback Hooks
// =============================================================================

/**
 * Hook to fetch expiration feedback history
 */
export function useExpirationFeedback(foodCategory?: string) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: inventoryKeys.expirationFeedback(foodCategory),
    queryFn: () => inventoryApi.listExpirationFeedback(foodCategory),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to record expiration feedback
 *
 * Use when user reports item spoiled early or lasted longer than expected.
 * System learns from feedback to adjust future expiration predictions.
 */
export function useRecordExpirationFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, feedbackType, actualDays }: {
      itemId: number;
      feedbackType: 'spoiled_early' | 'lasted_longer';
      actualDays: number;
    }) => inventoryApi.recordExpirationFeedback(itemId, {
      feedback_type: feedbackType,
      actual_days: actualDays,
    }),
    onSuccess: (feedback, variables) => {
      // Record observation for intelligence layer
      // Critical for expiration prediction learning (Reference Class Forecasting)
      recordAction('expiration_feedback_recorded', 'inventory', variables.itemId, {
        feedback_type: variables.feedbackType,
        actual_days: variables.actualDays,
        was_early: variables.feedbackType === 'spoiled_early',
      });

      queryClient.invalidateQueries({ queryKey: inventoryKeys.expirationFeedback() });
    },
  });
}

// =============================================================================
// Post-Cooking Depletion Hook
// =============================================================================

/**
 * Hook to deplete inventory after cooking a meal.
 *
 * Assumed consumption with exception handling: automatically deplete
 * ingredients used in cooking, with a 5-second undo window.
 */
export function useDepletFromCooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mealId: number) => inventoryApi.depletFromCooking(mealId),
    onSuccess: (result, mealId) => {
      // ALWAYS invalidate cache first — this is the critical side effect
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });

      // Record observation — non-critical, must not block cache update
      try {
        recordAction('inventory_depleted_from_cooking', 'meal', mealId, {
          depleted_count: result.depleted.length,
          ingredients: result.depleted.map(d => d.ingredient_name),
        });
      } catch {
        // Observation recording is non-critical — don't block UI updates
      }
    },
  });
}
