/**
 * useRecipeInsights Hook
 *
 * Fetches intelligence insights for recipes:
 * - Duration estimates (Reference Class Forecasting)
 * - Chef's notes (user's own past cooking notes)
 * - Time suggestions (when actual differs from recipe)
 *
 * Intelligence Principles Applied:
 * - Confidence threshold: 0.5 minimum for surfacing
 * - Pull Don't Push: Suggestions only in Planning Mode
 * - Suggestion Contracts: Never auto-update, always ask
 *
 * Intelligent cooking mode.
 */

import { useQuery } from '@tanstack/react-query';
import { patternsApi } from '@/api/client';
import type {
  RecipeInsights,
  RecipeDurationEstimate,
  ChefNote,
  RecipeTimeSuggestion,
  CookingHistoryItem,
} from '@/api/client';

// Query keys for recipe insights
export const recipeInsightKeys = {
  all: ['recipeInsights'] as const,
  insights: (recipeId: number) => [...recipeInsightKeys.all, 'insights', recipeId] as const,
  duration: (recipeId: number) => [...recipeInsightKeys.all, 'duration', recipeId] as const,
  notes: (recipeId: number) => [...recipeInsightKeys.all, 'notes', recipeId] as const,
  suggestion: (recipeId: number) => [...recipeInsightKeys.all, 'suggestion', recipeId] as const,
  history: (recipeId: number) => [...recipeInsightKeys.all, 'history', recipeId] as const,
  allSuggestions: () => [...recipeInsightKeys.all, 'allSuggestions'] as const,
};

/**
 * Hook to fetch all insights for a recipe.
 * Use this in the cooking view to get everything at once.
 */
export function useRecipeInsights(recipeId: number | null) {
  return useQuery({
    queryKey: recipeInsightKeys.insights(recipeId ?? 0),
    queryFn: () => patternsApi.getRecipeInsights(recipeId!),
    enabled: recipeId !== null && recipeId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch personalized duration estimate.
 * Uses Reference Class Forecasting (median of last N sessions).
 */
export function useRecipeDurationEstimate(recipeId: number | null) {
  return useQuery({
    queryKey: recipeInsightKeys.duration(recipeId ?? 0),
    queryFn: () => patternsApi.getRecipeDurationEstimate(recipeId!),
    enabled: recipeId !== null && recipeId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch chef's notes for a recipe.
 * RAG pattern: Surface user's own words.
 */
export function useChefNotes(recipeId: number | null, limit: number = 5) {
  return useQuery({
    queryKey: recipeInsightKeys.notes(recipeId ?? 0),
    queryFn: () => patternsApi.getRecipeChefNotes(recipeId!, limit),
    enabled: recipeId !== null && recipeId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch time suggestion for a recipe.
 * Only returns a suggestion if variance > 20% or > 10 minutes.
 */
export function useRecipeTimeSuggestion(recipeId: number | null) {
  return useQuery({
    queryKey: recipeInsightKeys.suggestion(recipeId ?? 0),
    queryFn: () => patternsApi.getRecipeTimeSuggestion(recipeId!),
    enabled: recipeId !== null && recipeId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch cooking history for a recipe.
 * Use for debugging or showing historical data.
 */
export function useCookingHistory(recipeId: number | null, limit: number = 10) {
  return useQuery({
    queryKey: recipeInsightKeys.history(recipeId ?? 0),
    queryFn: () => patternsApi.getRecipeCookingHistory(recipeId!, limit),
    enabled: recipeId !== null && recipeId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch all recipes with time suggestions.
 * Use in Planning Mode to surface suggestions proactively.
 */
export function useAllTimeSuggestions() {
  return useQuery({
    queryKey: recipeInsightKeys.allSuggestions(),
    queryFn: () => patternsApi.getAllTimeSuggestions(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch user's favorite (most-cooked) recipes.
 */
export function useRecipeFavorites(limit: number = 10) {
  return useQuery({
    queryKey: [...recipeInsightKeys.all, 'favorites', limit] as const,
    queryFn: () => patternsApi.getRecipeFavorites(limit),
    staleTime: 5 * 60 * 1000,
  });
}

// Re-export types for convenience
export type {
  RecipeInsights,
  RecipeDurationEstimate,
  ChefNote,
  RecipeTimeSuggestion,
  CookingHistoryItem,
};
