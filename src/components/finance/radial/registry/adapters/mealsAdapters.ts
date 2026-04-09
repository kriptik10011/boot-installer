/**
 * Meals domain adapter hooks (East arc).
 * HARDEST domain — needs Date.now() + nested useQuery for coverage.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRecipes } from '@/hooks';
import { useRecipeFavorites } from '@/hooks/useRecipeInsights';
import { useLowStockMeals } from '@/hooks/usePatterns';
import { useCrossFeatureIntelligence } from '@/hooks/useCrossFeatureIntelligence';
import { useMealIntelligence } from '@/hooks/useMealIntelligence';
import { recipesApi } from '@/api';
import { getMonday, getTodayLocal, getWeekDates } from '@/utils/dateUtils';
import type {
  HeroMetricShapeProps,
  PillListShapeProps,
  ProgressBarShapeProps,
  GaugeRingShapeProps,
} from '../types';

// Shared types for meal adapters
interface MealEntry {
  id: number;
  meal_type: string;
  description: string | null;
  recipe_id: number | null;
  cooked_at: string | null;
}

type MealSlotKey = 'breakfast' | 'lunch' | 'dinner';
const MEAL_SLOT_KEYS: MealSlotKey[] = ['breakfast', 'lunch', 'dinner'];
const MEAL_CUTOFF: Record<string, number> = { breakfast: 11, lunch: 14, dinner: 23 };

// ── next-meal ──

export function useNextMealAdapter(): HeroMetricShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(periodStart);
  const todayDate = getTodayLocal();
  const currentHour = new Date().getHours();

  const todayMeals = mealIntel.byDate[todayDate] ?? [];
  const todaySlots: Record<MealSlotKey, boolean> = {
    breakfast: todayMeals.some((m) => m.meal_type === 'breakfast'),
    lunch: todayMeals.some((m) => m.meal_type === 'lunch'),
    dinner: todayMeals.some((m) => m.meal_type === 'dinner'),
  };

  const upcomingMealTypes = MEAL_SLOT_KEYS.filter((t) => currentHour < MEAL_CUTOFF[t]);
  const nextPlannedEntry = upcomingMealTypes
    .map((t) => todayMeals.find((m) => m.meal_type === t))
    .find((entry) => entry != null);
  const nextUnplannedSlot = upcomingMealTypes.find((t) => !todaySlots[t]);
  const nextMealType: string = nextPlannedEntry?.meal_type ?? nextUnplannedSlot ?? '';

  const nextMealName = nextPlannedEntry
    ? (nextPlannedEntry.description || nextPlannedEntry.meal_type.charAt(0).toUpperCase() + nextPlannedEntry.meal_type.slice(1))
    : (nextUnplannedSlot ? `Plan ${nextUnplannedSlot}` : 'All done');

  const hasPlannedMeal = nextMealName !== 'All done' && !nextMealName.startsWith('Plan ');
  const heroName = hasPlannedMeal ? nextMealName : nextMealType ? `No ${nextMealType}` : 'All done';

  return {
    value: heroName,
    label: nextMealType || 'meals',
    color: '#10b981',
  };
}

// ── ingredients-needed ──

export function useIngredientsNeededAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(periodStart);
  const { data: recipesData } = useRecipes();
  const todayDate = getTodayLocal();
  const currentHour = new Date().getHours();

  // Resolve next meal's recipe from intelligence byDate
  const todayMeals = mealIntel.byDate[todayDate] ?? [];
  const upcomingMealTypes = MEAL_SLOT_KEYS.filter((t) => currentHour < MEAL_CUTOFF[t]);

  const nextPlannedEntry = upcomingMealTypes
    .map((t) => todayMeals.find((m) => m.meal_type === t))
    .find((entry) => entry != null);

  const recipeId = nextPlannedEntry?.recipe_id;
  const recipe = recipeId && recipesData
    ? (recipesData as Array<{ id: number; ingredients?: Array<{ ingredient_name: string }> }>).find((r) => r.id === recipeId)
    : null;
  const ingredientNames = (recipe?.ingredients ?? []).map((i) => i.ingredient_name).filter(Boolean);

  // Coverage check via nested query
  const ingredientNamesKey = ingredientNames.join(',');
  const { data: coverageData } = useQuery({
    queryKey: ['mealCoverage', ingredientNamesKey],
    queryFn: () => recipesApi.checkCoverage(ingredientNames),
    enabled: ingredientNames.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const coverageMap = new Map(
    coverageData?.ingredients?.map(
      (i: { name: string; in_stock: boolean }) => [i.name.toLowerCase().trim(), i.in_stock]
    ) ?? [],
  );
  const hasCoverage = coverageData != null;

  // Sort: missing first
  const sorted = [...ingredientNames].sort((a, b) => {
    const aStock = coverageMap.get(a.toLowerCase().trim()) ?? true;
    const bStock = coverageMap.get(b.toLowerCase().trim()) ?? true;
    return (aStock ? 1 : 0) - (bStock ? 1 : 0);
  });

  const items = sorted.map((name) => {
    const inStock = coverageMap.get(name.toLowerCase().trim());
    const dotColor = !hasCoverage ? '#64748b' : inStock ? '#34d399' : '#fbbf24';
    return { label: name, dotColor };
  });

  return {
    items,
    header: 'Ingredients',
    headerColor: '#34d399',
    emptyMessage: 'No recipe selected',
    maxItems: 3,
  };
}

// ── meal-coverage ──

export function useMealCoverageAdapter(): ProgressBarShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(periodStart);
  const coverage = mealIntel.coveragePct;
  const mealCount = Math.round(coverage * 21);
  const totalSlots = 21;

  return {
    progress: coverage,
    label: 'Meal Coverage',
    sublabel: `${mealCount} of ${totalSlots} slots filled`,
    color: coverage >= 0.7 ? '#10b981' : coverage >= 0.4 ? '#f59e0b' : '#f97316',
    showPct: true,
  };
}

// ── meal-gaps ──

export function useMealGapsAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { gaps } = useMealIntelligence(periodStart);
  const todayDate = getTodayLocal();

  // Use backend-computed meal gaps from intelligence hook (not raw data)
  const items = useMemo(() => {
    return gaps
      .filter((g) => g.date >= todayDate)
      .slice(0, 3)
      .map((g) => ({
        label: `${g.day_name}: ${g.meal_type} unplanned`,
        dotColor: '#f59e0b',
      }));
  }, [gaps, todayDate]);

  return {
    items,
    header: 'Unplanned',
    headerColor: '#f59e0b',
    emptyMessage: 'All meals planned',
    maxItems: 3,
  };
}

// ── meal-intelligence ──

export function useMealIntelligenceAdapter(): PillListShapeProps {
  const crossFeatureIntel = useCrossFeatureIntelligence();
  const mealInsights = (crossFeatureIntel.insights ?? [])
    .filter((i) => i.affectedFeatures.includes('meals'))
    .slice(0, 3);

  const insightColors: Record<string, string> = {
    busy_week_meals: '#fbbf24',
    weekend_prep: '#22d3ee',
    light_week_opportunity: '#34d399',
    end_of_month_budget: '#a78bfa',
    spending_anomaly: '#d97706',
  };

  const items = mealInsights.map((i) => ({
    label: i.suggestion ?? i.message,
    dotColor: insightColors[i.type] ?? '#10b981',
  }));

  return {
    items,
    header: 'Suggestions',
    headerColor: '#10b981',
    emptyMessage: 'No suggestions',
    maxItems: 3,
  };
}

// ── ingredient-variety ──

export function useIngredientVarietyAdapter(): GaugeRingShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(periodStart);

  // Use intelligence-computed variety data
  const byDate = mealIntel.byDate;
  const uniqueIngredients = Object.values(byDate).flat().filter((m) => m.recipe_id != null).length;

  // Normalize: 20+ unique ingredients = 100%
  const progress = Math.min(1, uniqueIngredients / 20);

  return {
    progress,
    color: progress >= 0.7 ? '#10b981' : progress >= 0.4 ? '#f59e0b' : '#f97316',
    label: `${uniqueIngredients} meals`,
    compact: true,
  };
}

// ── recipe-favorites ──

export function useRecipeFavoritesAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(periodStart);
  const { data: recipesData } = useRecipes();

  const favorites = useMemo(() => {
    const allMeals = Object.values(mealIntel.byDate).flat();
    const recipes = (recipesData ?? []) as Array<{ id: number; name: string }>;
    const counts = new Map<number, { name: string; count: number }>();
    for (const meal of allMeals) {
      if (!meal.recipe_id) continue;
      const recipe = recipes.find((r) => r.id === meal.recipe_id);
      if (!recipe) continue;
      const existing = counts.get(meal.recipe_id);
      counts.set(meal.recipe_id, {
        name: recipe.name,
        count: (existing?.count ?? 0) + 1,
      });
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [mealIntel.byDate, recipesData]);

  const items = favorites.map((f) => ({
    label: f.name,
    badge: `${f.count}x`,
    dotColor: '#10b981',
  }));

  return {
    items,
    header: 'Favorites',
    headerColor: '#10b981',
    emptyMessage: 'No recipes used',
    maxItems: 3,
  };
}

// ── low-stock-meal-alerts ──

export function useLowStockMealAlertsAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: lowStockMealAlerts } = useLowStockMeals(periodStart);

  const items = useMemo(() => {
    const alerts = lowStockMealAlerts ?? [];
    const map = new Map<string, string[]>();
    for (const alert of alerts) {
      const existing = map.get(alert.recipe_name) ?? [];
      existing.push(alert.ingredient_name);
      map.set(alert.recipe_name, existing);
    }
    return Array.from(map.entries())
      .slice(0, 3)
      .map(([recipe, ingredients]) => ({
        label: recipe,
        badge: `${ingredients.length} missing`,
        dotColor: '#fbbf24',
      }));
  }, [lowStockMealAlerts]);

  return {
    items,
    header: 'Missing',
    headerColor: '#fbbf24',
    emptyMessage: 'All ingredients available',
    maxItems: 3,
  };
}

// ── Action params for start-cooking ──

/**
 * Resolves the next meal's recipeId and mealId for the start-cooking action.
 * Uses the same meal resolution logic as useNextMealAdapter.
 * Called directly in ArcCardRenderer (not through the registry).
 */
export function useNextMealActionParams(): { recipeId: number | null; mealId: number | null; mealType: string } {
  const periodStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(periodStart);
  const todayDate = getTodayLocal();
  const currentHour = new Date().getHours();

  const todayMeals = mealIntel.byDate[todayDate] ?? [];

  const upcomingMealTypes = MEAL_SLOT_KEYS.filter((t) => currentHour < MEAL_CUTOFF[t]);
  const nextPlannedEntry = upcomingMealTypes
    .map((t) => todayMeals.find((m) => m.meal_type === t))
    .find((entry) => entry != null);

  return {
    recipeId: nextPlannedEntry?.recipe_id ?? null,
    mealId: (nextPlannedEntry as MealEntry | undefined)?.id ?? null,
    mealType: nextPlannedEntry?.meal_type ?? '',
  };
}

// ── Sub-arc card adapters ────────────────────────────────────────────────────

// ── cooking-streak (CookingHistoryCard hero) ──

export function useCookingStreakAdapter(): HeroMetricShapeProps {
  const weekStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(weekStart);
  const today = getTodayLocal();
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const todayIndex = weekDates.indexOf(today);

  const { streak, cookedDays } = useMemo(() => {
    const dayFillMap = new Map(mealIntel.dayFills.map(d => [d.date, d.filledCount > 0]));
    const dayCooked = weekDates.map(date => dayFillMap.get(date) ?? false);
    let count = 0;
    for (let i = todayIndex; i >= 0; i--) {
      if (dayCooked[i]) count++;
      else break;
    }
    return { streak: count, cookedDays: dayCooked.filter(Boolean).length };
  }, [mealIntel.dayFills, weekDates, todayIndex]);

  return {
    value: streak,
    label: 'COOK STREAK',
    sublabel: `${cookedDays}/7 days`,
    color: streak >= 5 ? '#10b981' : streak >= 3 ? '#34d399' : '#6ee7b7',
  };
}

// ── cooking-patterns (CookingHistoryCard pill zone) ──

export function useCookingPatternsAdapter(): PillListShapeProps {
  const weekStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(weekStart);
  const { data: favorites = [] } = useRecipeFavorites(3);

  const items = useMemo(() => {
    const result: { label: string; badge?: string; dotColor: string }[] = [];
    const mealsArr = mealIntel.allMeals as Array<{ date: string; meal_type: string; cooked_at: string | null }>;

    // Cooking count this week
    const cookedCount = mealsArr.filter(m => m.cooked_at != null).length;
    result.push({
      label: `${cookedCount} cooked this week`,
      dotColor: '#10b981',
    });

    // Top recipe from favorites
    const favArr = favorites as Array<{ recipe_name: string; cook_count: number }>;
    if (favArr.length > 0) {
      result.push({
        label: favArr[0].recipe_name,
        badge: `${favArr[0].cook_count}x`,
        dotColor: '#34d399',
      });
    }

    // Meal type breakdown
    const types = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const m of mealsArr) {
      const t = m.meal_type as keyof typeof types;
      if (t in types) types[t]++;
    }
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    if (topType && topType[1] > 0) {
      result.push({
        label: `Most: ${topType[0]} (${topType[1]})`,
        dotColor: '#6ee7b7',
      });
    }

    return result;
  }, [mealIntel.allMeals, favorites]);

  return {
    items,
    header: 'Patterns',
    headerColor: '#10b981',
    emptyMessage: 'No cooking data',
    maxItems: 3,
  };
}
