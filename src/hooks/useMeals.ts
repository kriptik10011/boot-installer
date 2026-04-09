/**
 * Meal plan hooks using TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mealsApi } from '@/api/client';
import { recordAction } from '@/services/observation';
import { invalidateIntelligence } from '@/utils/invalidateIntelligence';
import { useBackendReady } from './useBackendReady';
import { shoppingListKeys } from './useShoppingList';
import type { MealPlanCreate, MealPlanUpdate } from '@/types';

// Query keys for meals
export const mealKeys = {
  all: ['meals'] as const,
  lists: () => [...mealKeys.all, 'list'] as const,
  list: () => [...mealKeys.lists()] as const,
  weeks: () => [...mealKeys.all, 'week'] as const,
  week: (weekStart: string) => [...mealKeys.weeks(), weekStart] as const,
  details: () => [...mealKeys.all, 'detail'] as const,
  detail: (id: number) => [...mealKeys.details(), id] as const,
};

/**
 * Hook to fetch all meals
 */
export function useMeals() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: mealKeys.list(),
    queryFn: () => mealsApi.list(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch meals for a specific week
 */
export function useWeekMeals(weekStart: string) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: mealKeys.week(weekStart),
    queryFn: () => mealsApi.getWeek(weekStart),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady && !!weekStart,
  });
}

/**
 * Hook to fetch a single meal by ID
 */
export function useMeal(id: number) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: mealKeys.detail(id),
    queryFn: () => mealsApi.get(id),
    enabled: backendReady && id > 0,
  });
}

/**
 * Hook to create a new meal plan entry
 */
export function useCreateMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MealPlanCreate) => mealsApi.create(data),
    onSuccess: (createdMeal, variables) => {
      // Record observation for intelligence layer
      const mealDate = new Date(variables.date);
      recordAction('meal_planned', 'meal', createdMeal.id, {
        meal_type: variables.meal_type,
        day_of_week: mealDate.getDay(),
        has_recipe: !!variables.recipe_id,
        recipe_id: variables.recipe_id,
      });

      // Invalidate all meal lists and weeks to refetch
      queryClient.invalidateQueries({ queryKey: mealKeys.lists() });
      queryClient.invalidateQueries({ queryKey: mealKeys.weeks() });

      // Invalidate shopping list to include new meal's ingredients
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.weeks() });
      invalidateIntelligence(queryClient, 'meals');
    },
  });
}

/**
 * Hook to update an existing meal plan entry
 */
export function useUpdateMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MealPlanUpdate }) =>
      mealsApi.update(id, data),
    onSuccess: (_, variables) => {
      // Record observation for intelligence layer
      // Track recipe changes for pattern learning
      const recipeChanged = variables.data.recipe_id !== undefined;
      recordAction(recipeChanged ? 'meal_changed' : 'meal_updated', 'meal', variables.id, {
        recipe_changed: recipeChanged,
        new_recipe_id: variables.data.recipe_id,
      });

      // Invalidate the specific meal and all lists/weeks
      queryClient.invalidateQueries({ queryKey: mealKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: mealKeys.lists() });
      queryClient.invalidateQueries({ queryKey: mealKeys.weeks() });

      // Invalidate shopping list when serving size or recipe changes
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.weeks() });
      invalidateIntelligence(queryClient, 'meals');
    },
  });
}

/**
 * Hook to delete a meal plan entry
 */
export function useDeleteMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => mealsApi.delete(id),
    onSuccess: (_data, id) => {
      // Record observation for intelligence layer
      // meal_skipped indicates user removed a planned meal (different from never planning)
      recordAction('meal_skipped', 'meal', id);

      // Invalidate all meal queries
      queryClient.invalidateQueries({ queryKey: mealKeys.all });

      // Remove deleted meal's ingredients from shopping list cache
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.all });
      invalidateIntelligence(queryClient, 'meals');
    },
  });
}

/**
 * Hook to complete a cooking session
 * Records actual cooking data (servings, times, notes) for a meal.
 */
export function useCookingComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: {
        actual_servings: number;
        actual_prep_minutes: number;
        actual_cook_minutes: number;
        notes?: string | null;
      };
    }) => mealsApi.completeCooking(id, data),
    onSuccess: (_, variables) => {
      // Record observation for intelligence layer
      // Critical for Reference Class Forecasting - actual vs estimated durations
      recordAction('cooking_completed', 'meal', variables.id, {
        actual_servings: variables.data.actual_servings,
        actual_prep_minutes: variables.data.actual_prep_minutes,
        actual_cook_minutes: variables.data.actual_cook_minutes,
        has_notes: !!variables.data.notes,
      });

      // Invalidate the specific meal and all lists/weeks
      queryClient.invalidateQueries({ queryKey: mealKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: mealKeys.lists() });
      queryClient.invalidateQueries({ queryKey: mealKeys.weeks() });

      // Update shopping list if servings changed during cooking
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.weeks() });

      // Invalidate recipe insights (cook_count, favorites) so CookingHistoryCard updates
      queryClient.invalidateQueries({ queryKey: ['recipeInsights'] });
    },
  });
}
