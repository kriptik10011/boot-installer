/**
 * Recipe hooks using TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recipesApi } from '@/api/client';
import { recordAction } from '@/services/observation';
import { invalidateIntelligence } from '@/utils/invalidateIntelligence';
import { useBackendReady } from './useBackendReady';
import type { RecipeCreate, RecipeUpdate } from '@/types';

// Query keys for recipes
export const recipeKeys = {
  all: ['recipes'] as const,
  lists: () => [...recipeKeys.all, 'list'] as const,
  list: (categoryId?: number, search?: string) =>
    [...recipeKeys.lists(), { categoryId, search }] as const,
  details: () => [...recipeKeys.all, 'detail'] as const,
  detail: (id: number) => [...recipeKeys.details(), id] as const,
};

/**
 * Hook to fetch recipes with optional filtering
 */
export function useRecipes(categoryId?: number, search?: string) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: recipeKeys.list(categoryId, search),
    queryFn: () => recipesApi.list(categoryId, search),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch a single recipe by ID
 */
export function useRecipe(id: number) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipesApi.get(id),
    enabled: backendReady && id > 0,
  });
}

/**
 * Hook to create a new recipe
 */
export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecipeCreate) => recipesApi.create(data),
    onSuccess: (createdRecipe, variables) => {
      // Record observation for intelligence layer
      recordAction('recipe_saved', 'recipe', createdRecipe.id, {
        has_category: !!variables.category_id,
        has_prep_time: !!variables.prep_time_minutes,
        has_cook_time: !!variables.cook_time_minutes,
        has_servings: !!variables.servings,
        source: variables.source ? 'imported' : 'manual',
      });

      // Invalidate all recipe lists to refetch
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
      invalidateIntelligence(queryClient, 'recipes');
    },
  });
}

/**
 * Hook to update an existing recipe
 */
export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RecipeUpdate }) =>
      recipesApi.update(id, data),
    onSuccess: (_, variables) => {
      // Record observation for intelligence layer
      const changedFields = Object.keys(variables.data).filter(
        (key) => variables.data[key as keyof RecipeUpdate] !== undefined
      );
      recordAction('recipe_updated', 'recipe', variables.id, {
        changed_fields: changedFields,
      });

      // Invalidate the specific recipe and all lists
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
      invalidateIntelligence(queryClient, 'recipes');
    },
  });
}

/**
 * Hook to delete a recipe
 */
export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => recipesApi.delete(id),
    onSuccess: (_data, id) => {
      // Record observation for intelligence layer
      recordAction('recipe_deleted', 'recipe', id);

      // Invalidate all recipe queries
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      invalidateIntelligence(queryClient, 'recipes');
    },
  });
}
