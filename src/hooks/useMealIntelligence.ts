/**
 * Meal Intelligence Hook (Simplified — Phase A5)
 *
 * Fetches fully computed meal intelligence from backend.
 * All computation (gaps, suggestions, scoring) happens server-side.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWeekMeals } from './useMeals';
import { useBackendReady } from './useBackendReady';
import { intelligenceApi, intelligenceKeys } from '@/api/intelligence';
import type { MealPlanEntry, MealType } from '@/types';
import type { MealGap } from '@/api/client';

// =============================================================================
// TYPES (preserved for consumer compatibility)
// =============================================================================

export interface MealSuggestion {
  date: string;
  mealType: MealType;
  suggestedRecipes: SuggestedRecipe[];
  reasoning: string;
  confidence: number;
}

export interface SuggestedRecipe {
  recipe: { id: number; name: string; prep_time_minutes?: number | null; cook_time_minutes?: number | null };
  score: number;
  reason: string;
}

export interface MealPattern {
  dayOfWeek: number;
  mealType: MealType;
  pattern: string;
  confidence: number;
}

export interface ExpiringIngredientSuggestion {
  inventoryItem: {
    id: number;
    name: string;
    expirationDate: string | null;
    daysUntilExpiration: number | null;
    quantity: number;
    unit: string | null;
  };
  matchingRecipes: Array<{
    recipe: { id: number; name: string };
    ingredientMatch: string;
    matchScore: number;
  }>;
  urgency: 'critical' | 'soon' | 'upcoming';
  reasoning: string;
}

export interface MealDayFill {
  date: string;
  dayName: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  filledCount: number;
}

export interface MealIntelligence {
  gaps: MealGap[];
  suggestions: MealSuggestion[];
  expiringIngredientSuggestions: ExpiringIngredientSuggestion[];
  plannedCount: number;
  unplannedCount: number;
  confidence: number;
  isLearning: boolean;
  isLoading: boolean;
  byDate: Record<string, Array<{ meal_type: string; description: string | null; recipe_id: number | null }>>;
  nextMealGap: MealGap | null;
  coveragePct: number;
  dayFills: MealDayFill[];
  allMeals: MealPlanEntry[];
}

// =============================================================================
// HOOK
// =============================================================================

export function useMealIntelligence(weekStart: string): MealIntelligence {
  const backendReady = useBackendReady();
  const { data: meals = [], isLoading: mealsLoading } = useWeekMeals(weekStart);

  const { data: intel, isLoading: intelLoading } = useQuery({
    queryKey: intelligenceKeys.meals(weekStart),
    queryFn: () => intelligenceApi.getMeals(weekStart),
    staleTime: 60_000,
    enabled: backendReady && !!weekStart,
  });

  const isLoading = mealsLoading || intelLoading;

  // Map backend suggestions to consumer format
  const suggestions = useMemo((): MealSuggestion[] => {
    if (!intel?.suggestions) return [];
    return (intel.suggestions as Array<Record<string, unknown>>).map((s) => ({
      date: s.date as string,
      mealType: s.mealType as MealType,
      suggestedRecipes: ((s.suggestedRecipes as Array<Record<string, unknown>>) || []).map((r) => ({
        recipe: { id: r.recipeId as number, name: r.recipeName as string },
        score: r.score as number,
        reason: r.reason as string,
      })),
      reasoning: s.reasoning as string,
      confidence: s.confidence as number,
    }));
  }, [intel]);

  return {
    gaps: (intel?.gaps as MealGap[]) ?? [],
    suggestions,
    expiringIngredientSuggestions: [], // Handled by backend in future iteration
    plannedCount: (intel?.plannedCount as number) ?? 0,
    unplannedCount: (intel?.unplannedCount as number) ?? 0,
    confidence: (intel?.confidence as number) ?? 0.5,
    isLearning: (intel?.isLearning as boolean) ?? true,
    isLoading,
    byDate: (intel?.byDate as MealIntelligence['byDate']) ?? {},
    nextMealGap: (intel?.nextMealGap as MealGap | null) ?? null,
    coveragePct: (intel?.coveragePct as number) ?? 0,
    dayFills: (intel?.dayFills as MealDayFill[]) ?? [],
    allMeals: meals as MealPlanEntry[],
  };
}

/**
 * Get recipe suggestions for a specific meal slot.
 * Delegates to the main hook's suggestions.
 */
export function useMealSlotSuggestions(
  date: string,
  mealType: MealType
): {
  suggestions: SuggestedRecipe[];
  reasoning: string;
  isLoading: boolean;
} {
  // Derive weekStart from date
  const weekStart = useMemo(() => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [date]);

  const { suggestions: allSuggestions, isLoading } = useMealIntelligence(weekStart);

  const match = useMemo(() => {
    return allSuggestions.find((s) => s.date === date && s.mealType === mealType);
  }, [allSuggestions, date, mealType]);

  return {
    suggestions: match?.suggestedRecipes ?? [],
    reasoning: match?.reasoning ?? 'Loading suggestions...',
    isLoading,
  };
}
