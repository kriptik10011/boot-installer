/**
 * Shopping List Hook
 *
 * Provides CRUD operations for shopping list items.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  shoppingListApi,
  type ShoppingListItem,
  type ShoppingListItemCreate,
  type ShoppingListItemUpdate,
  type PackageDataItem,
} from '@/api/client';
import { recordAction } from '@/services/observation';
import { useBackendReady } from './useBackendReady';

export const shoppingListKeys = {
  all: ['shoppingList'] as const,
  weeks: () => [...shoppingListKeys.all, 'week'] as const,
  week: (weekStart: string) => [...shoppingListKeys.weeks(), weekStart] as const,
  details: () => [...shoppingListKeys.all, 'detail'] as const,
  detail: (id: number) => [...shoppingListKeys.details(), id] as const,
  categories: () => [...shoppingListKeys.all, 'categories'] as const,
};

/**
 * Fetch shopping list items for a specific week.
 */
export function useShoppingListWeek(weekStart: string) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: shoppingListKeys.week(weekStart),
    queryFn: () => shoppingListApi.getWeek(weekStart),
    staleTime: 1 * 60 * 1000, // 1 minute
    enabled: backendReady,
  });
}

/**
 * Fetch a single shopping list item by ID.
 */
export function useShoppingListItem(id: number | null) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: shoppingListKeys.detail(id!),
    queryFn: () => shoppingListApi.get(id!),
    enabled: backendReady && id !== null,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Fetch available categories for shopping list items.
 */
export function useShoppingListCategories() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: shoppingListKeys.categories(),
    queryFn: shoppingListApi.getCategories,
    staleTime: 30 * 60 * 1000, // 30 minutes (categories rarely change)
    enabled: backendReady,
  });
}

/**
 * Create a new shopping list item.
 */
export function useCreateShoppingListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ShoppingListItemCreate) => shoppingListApi.create(data),
    onSuccess: (newItem, variables) => {
      // Record observation for intelligence layer
      // Track manually added items (not from meal plan) for impulse tracking
      recordAction('shopping_item_added', 'shopping', newItem.id, {
        is_manual: true, // Manually added, not auto-generated
        item_name: variables.name,
        has_quantity: !!variables.quantity,
      });

      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.week(newItem.week_start),
      });
    },
  });
}

/**
 * Update an existing shopping list item.
 */
export function useUpdateShoppingListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ShoppingListItemUpdate }) =>
      shoppingListApi.update(id, data),
    onSuccess: (updatedItem, variables) => {
      // Record observation for intelligence layer
      // Track what fields were changed for pattern learning
      const changedFields = Object.keys(variables.data).filter(
        (k) => variables.data[k as keyof ShoppingListItemUpdate] !== undefined
      );
      recordAction('shopping_item_updated', 'shopping', updatedItem.id, {
        item_name: updatedItem.name,
        changed_fields: changedFields,
        quantity_changed: changedFields.includes('quantity'),
      });

      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.week(updatedItem.week_start),
      });
      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.detail(updatedItem.id),
      });
    },
  });
}

/**
 * Toggle the checked status of a shopping list item.
 */
export function useToggleShoppingListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => shoppingListApi.toggle(id),
    onSuccess: (updatedItem) => {
      // Record observation for intelligence layer
      // This is critical for purchase pattern learning
      if (updatedItem.is_checked) {
        // Item was checked off (purchased)
        recordAction('item_purchased', 'shopping', updatedItem.id, {
          item_name: updatedItem.name,
          quantity: updatedItem.quantity,
          day_of_week: new Date().getDay(),
        });
      } else {
        // Item was unchecked (correction or need to re-buy)
        recordAction('item_unchecked', 'shopping', updatedItem.id, {
          item_name: updatedItem.name,
          correction: true, // Likely a misclick correction
        });
      }

      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.week(updatedItem.week_start),
      });
    },
  });
}

/**
 * Delete a shopping list item.
 */
export function useDeleteShoppingListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, weekStart }: { id: number; weekStart: string }) =>
      shoppingListApi.delete(id).then(() => ({ id, weekStart })),
    onSuccess: ({ id, weekStart }) => {
      // Record observation for intelligence layer
      // Item removed from list (skipped/not needed)
      recordAction('item_skipped', 'shopping', id, {
        reason: 'deleted_from_list',
      });

      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.week(weekStart),
      });
    },
  });
}

/**
 * Clear all items for a specific week.
 */
export function useClearShoppingListWeek() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (weekStart: string) =>
      shoppingListApi.clearWeek(weekStart).then(() => weekStart),
    onSuccess: (weekStart) => {
      // Record observation for intelligence layer
      // Track when user clears their list (timing patterns)
      recordAction('shopping_list_cleared', 'shopping', undefined, {
        week_start: weekStart,
        day_of_week: new Date().getDay(),
      });

      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.week(weekStart),
      });
    },
  });
}

/**
 * Generate shopping list from meal plan.
 */
export function useGenerateShoppingList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (weekStart: string) =>
      shoppingListApi.generate(weekStart).then((result) => ({ ...result, weekStart })),
    onSuccess: (result) => {
      // Record observation for intelligence layer
      // Track when user generates a shopping list (timing pattern)
      recordAction('shopping_list_generated', 'shopping', undefined, {
        week_start: result.weekStart,
        items_generated: result.items_created ?? 0,
        day_of_week: new Date().getDay(),
      });

      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.week(result.weekStart),
      });
    },
  });
}

/**
 * Complete shopping trip - transfers checked items to inventory and clears them.
 * Per UX Decision: This is the "Shopping Done" flow that bridges shopping to inventory.
 */
export function useCompleteShoppingTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekStart, packageData }: { weekStart: string; packageData?: PackageDataItem[] }) => {
      // Transfer checked items to inventory and clear them
      // V2: Pass optional package data for package-aware inventory tracking
      const body = packageData?.length ? { package_data: packageData } : undefined;
      const result = await shoppingListApi.completeTrip(weekStart, body);
      return { ...result, weekStart };
    },
    onSuccess: (result) => {
      // Record observation for intelligence layer
      // Track shopping trip completion for timing patterns
      recordAction('shopping_trip_completed', 'shopping', undefined, {
        week_start: result.weekStart,
        items_transferred: result.items_transferred ?? 0,
        day_of_week: new Date().getDay(),
      });

      // Invalidate shopping, inventory, and pattern queries
      // Pattern invalidation ensures meal coverage warnings refresh
      // after inventory items are transferred from shopping list
      queryClient.invalidateQueries({
        queryKey: shoppingListKeys.week(result.weekStart),
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory'],
      });
      queryClient.invalidateQueries({
        queryKey: ['patterns'],
      });
    },
  });
}

export type {
  ShoppingListItem,
  ShoppingListItemCreate,
  ShoppingListItemUpdate,
};
