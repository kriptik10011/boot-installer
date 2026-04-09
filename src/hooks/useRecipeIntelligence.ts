/**
 * Recipe Intelligence Hook (Simplified — Phase A5)
 *
 * Fetches fully computed recipe intelligence from backend.
 * All computation (complexity, favorites, suggestions) happens server-side.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRecipes } from './useRecipes';
import { useBackendReady } from './useBackendReady';
import { intelligenceApi, intelligenceKeys } from '@/api/intelligence';
import type { Recipe } from '@/types';

// =============================================================================
// TYPES (preserved for consumer compatibility)
// =============================================================================

export interface RecipeInsight {
  type: 'favorite' | 'quick_option' | 'complexity_adjusted' | 'variety_suggestion' | 'seasonal';
  recipeId: number;
  recipeName: string;
  message: string;
  reasoning: string;
  confidence: number;
  priority: 1 | 2 | 3 | 4 | 5;
}

export interface RecipeComplexity {
  recipeId: number;
  estimatedMinutes: number;
  actualMedianMinutes: number | null;
  complexityLabel: 'Quick' | 'Medium' | 'Involved';
  accuracyNote: string;
}

export interface RecipeFavorite {
  recipe: Recipe;
  cookCount: number;
  lastCooked: string | null;
  reasoning: string;
}

export interface RecipeIntelligence {
  favorites: RecipeFavorite[];
  complexityScores: RecipeComplexity[];
  suggestedRecipes: Recipe[];
  recordRecipeView: (recipeId: number) => void;
  confidence: number;
  isLearning: boolean;
  isLoading: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

export function useRecipeIntelligence(recipesOverride?: Recipe[]): RecipeIntelligence {
  const backendReady = useBackendReady();
  const { data: fetchedRecipes = [], isLoading: recipesLoading } = useRecipes();
  const recipes = recipesOverride ?? fetchedRecipes;

  const { data: intel, isLoading: intelLoading } = useQuery({
    queryKey: intelligenceKeys.recipes(),
    queryFn: () => intelligenceApi.getRecipes(),
    staleTime: 60_000,
    enabled: backendReady,
  });

  const isLoading = recipesLoading || intelLoading;
  const recipeMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  // Map backend favorites to full Recipe objects (consumers need the full Recipe)
  const favorites = useMemo((): RecipeFavorite[] => {
    if (!intel?.favorites) return [];
    return (intel.favorites as Array<Record<string, unknown>>)
      .map((f) => {
        const recipe = recipeMap.get(f.recipeId as number);
        if (!recipe) return null;
        return {
          recipe,
          cookCount: f.cookCount as number,
          lastCooked: f.lastCooked as string | null,
          reasoning: f.reasoning as string,
        };
      })
      .filter((f): f is RecipeFavorite => f !== null);
  }, [intel, recipeMap]);

  const complexityScores = (intel?.complexityScores as RecipeComplexity[]) ?? [];

  // Map backend suggested recipes to full Recipe objects
  const suggestedRecipes = useMemo((): Recipe[] => {
    if (!intel?.suggestedRecipes) return [];
    return (intel.suggestedRecipes as Array<Record<string, unknown>>)
      .map((s) => recipeMap.get(s.id as number))
      .filter((r): r is Recipe => r !== undefined);
  }, [intel, recipeMap]);

  const recordRecipeView = useMemo(
    () => (recipeId: number) => {
      const viewHistory = JSON.parse(localStorage.getItem('recipe_view_history') || '[]');
      viewHistory.push({ recipeId, timestamp: new Date().toISOString() });
      if (viewHistory.length > 100) viewHistory.shift();
      localStorage.setItem('recipe_view_history', JSON.stringify(viewHistory));
    },
    []
  );

  return {
    favorites,
    complexityScores,
    suggestedRecipes,
    recordRecipeView,
    confidence: (intel?.confidence as number) ?? 0.5,
    isLearning: (intel?.isLearning as boolean) ?? true,
    isLoading,
  };
}

/**
 * Get complexity info for a specific recipe.
 */
export function useRecipeComplexity(recipeId: number): {
  complexity: RecipeComplexity | null;
  isLoading: boolean;
} {
  const { complexityScores, isLoading } = useRecipeIntelligence();

  const complexity = useMemo(
    () => complexityScores.find((c) => c.recipeId === recipeId) ?? null,
    [complexityScores, recipeId]
  );

  return { complexity, isLoading };
}
