/**
 * Pattern Detection Hooks
 *
 * TanStack Query hooks for accessing pattern detection data.
 * Part of the intelligence layer (inference).
 */

import { useQuery } from '@tanstack/react-query';
import { useBackendReady } from './useBackendReady';
import {
  patternsApi,
  type TemporalPatterns,
  type BehavioralPatterns,
  type DayHealth,
  type PatternWeekSummary,
  type SpendingTrend,
  type MealGap,
  type AllPatterns,
  type Insight,
  type ConfidenceScores,
  type RecurringMealPattern,
  type IngredientVariety,
  type RestockingPrediction,
  type LowStockMealAlert,
  type TrackingModeSuggestion,
} from '@/api/client';

// Query keys for patterns
export const patternKeys = {
  all: ['patterns'] as const,
  temporal: () => [...patternKeys.all, 'temporal'] as const,
  behavioral: () => [...patternKeys.all, 'behavioral'] as const,
  dayHealth: (date: string) => [...patternKeys.all, 'day-health', date] as const,
  weekSummary: (weekStart: string) => [...patternKeys.all, 'week-summary', weekStart] as const,
  conflicts: (weekStart: string) => [...patternKeys.all, 'conflicts', weekStart] as const,
  spendingTrends: () => [...patternKeys.all, 'spending-trends'] as const,
  mealGaps: (weekStart: string) => [...patternKeys.all, 'meal-gaps', weekStart] as const,
  combined: (weekStart?: string) => [...patternKeys.all, 'combined', weekStart] as const,
  insights: (weekStart?: string) => [...patternKeys.all, 'insights', weekStart] as const,
  confidence: () => [...patternKeys.all, 'confidence'] as const,
  recurringMeals: (weeksBack?: number) => [...patternKeys.all, 'recurring-meals', weeksBack] as const,
  ingredientVariety: (weekStart: string) => [...patternKeys.all, 'ingredient-variety', weekStart] as const,
  restockingPredictions: () => [...patternKeys.all, 'restocking-predictions'] as const,
  lowStockMeals: (weekStart: string) => [...patternKeys.all, 'low-stock-meals', weekStart] as const,
  trackingSuggestions: () => [...patternKeys.all, 'tracking-suggestions'] as const,
};

/**
 * Hook to fetch temporal patterns.
 *
 * Includes planning time, peak hours, busiest day, etc.
 */
export function useTemporalPatterns() {
  const backendReady = useBackendReady();
  return useQuery<TemporalPatterns>({
    queryKey: patternKeys.temporal(),
    queryFn: () => patternsApi.getTemporal(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch behavioral patterns.
 *
 * Includes session analysis, view preferences, action frequency.
 */
export function useBehavioralPatterns() {
  const backendReady = useBackendReady();
  return useQuery<BehavioralPatterns>({
    queryKey: patternKeys.behavioral(),
    queryFn: () => patternsApi.getBehavioral(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch day health score.
 *
 * @param date - Date string (YYYY-MM-DD)
 */
export function useDayHealth(date: string) {
  const backendReady = useBackendReady();
  return useQuery<DayHealth>({
    queryKey: patternKeys.dayHealth(date),
    queryFn: () => patternsApi.getDayHealth(date),
    staleTime: 60 * 1000, // 1 minute (day health can change)
    enabled: backendReady && !!date,
  });
}

/**
 * Hook to fetch week summary.
 *
 * @param weekStart - Week start date (YYYY-MM-DD)
 */
export function useWeekSummary(weekStart: string) {
  const backendReady = useBackendReady();
  return useQuery<PatternWeekSummary>({
    queryKey: patternKeys.weekSummary(weekStart),
    queryFn: () => patternsApi.getWeekSummary(weekStart),
    staleTime: 60 * 1000, // 1 minute
    enabled: backendReady && !!weekStart,
  });
}

/**
 * Hook to fetch spending trends.
 *
 * Compares current week to 4-week EWMA average.
 */
export function useSpendingTrends() {
  const backendReady = useBackendReady();
  return useQuery<SpendingTrend>({
    queryKey: patternKeys.spendingTrends(),
    queryFn: () => patternsApi.getSpendingTrends(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

/**
 * Hook to fetch meal gaps for a week.
 *
 * @param weekStart - Week start date (YYYY-MM-DD)
 */
export function useMealGaps(weekStart: string) {
  const backendReady = useBackendReady();
  return useQuery<MealGap[]>({
    queryKey: patternKeys.mealGaps(weekStart),
    queryFn: () => patternsApi.getMealGaps(weekStart),
    staleTime: 60 * 1000, // 1 minute
    enabled: backendReady && !!weekStart,
  });
}

/**
 * Hook to fetch all patterns combined.
 *
 * This is the main hook for getting all pattern data at once.
 *
 * @param weekStart - Optional week start date (defaults to current week)
 */
export function useWeekPatterns(weekStart?: string) {
  const backendReady = useBackendReady();
  return useQuery<AllPatterns>({
    queryKey: patternKeys.combined(weekStart),
    queryFn: () => patternsApi.getAll(weekStart),
    staleTime: 60 * 1000, // 1 minute
    enabled: backendReady,
  });
}

/**
 * Hook to fetch actionable insights.
 *
 * Insights are filtered by confidence and sorted by priority.
 *
 * @param weekStart - Optional week start date
 */
export function useInsights(weekStart?: string) {
  const backendReady = useBackendReady();
  return useQuery<Insight[]>({
    queryKey: patternKeys.insights(weekStart),
    queryFn: () => patternsApi.getInsights(weekStart),
    staleTime: 60 * 1000, // 1 minute
    enabled: backendReady,
  });
}

/**
 * Hook to fetch confidence scores.
 *
 * Shows how confident the system is in detected patterns.
 */
export function usePatternConfidence() {
  const backendReady = useBackendReady();
  return useQuery<ConfidenceScores>({
    queryKey: patternKeys.confidence(),
    queryFn: () => patternsApi.getConfidence(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

// =============================================================================
// DOMAIN INTELLIGENCE HOOKS
// =============================================================================

/**
 * Hook to fetch recurring meal patterns.
 *
 * Detects meals cooked on the same day of week repeatedly.
 */
export function useRecurringMealPatterns(weeksBack: number = 4) {
  const backendReady = useBackendReady();
  return useQuery<RecurringMealPattern[]>({
    queryKey: patternKeys.recurringMeals(weeksBack),
    queryFn: () => patternsApi.getRecurringMeals(weeksBack),
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}

/**
 * Hook to fetch ingredient variety for a week.
 *
 * @param weekStart - Week start date (YYYY-MM-DD)
 */
export function useIngredientVariety(weekStart: string) {
  const backendReady = useBackendReady();
  return useQuery<IngredientVariety>({
    queryKey: patternKeys.ingredientVariety(weekStart),
    queryFn: () => patternsApi.getIngredientVariety(weekStart),
    staleTime: 60 * 1000,
    enabled: backendReady && !!weekStart,
  });
}

/**
 * Hook to fetch restocking predictions using Reference Class Forecasting.
 */
export function useRestockingPredictions() {
  const backendReady = useBackendReady();
  return useQuery<RestockingPrediction[]>({
    queryKey: patternKeys.restockingPredictions(),
    queryFn: () => patternsApi.getRestockingPredictions(),
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}

/**
 * Hook to fetch low-stock meal alerts for upcoming week.
 *
 * @param weekStart - Week start date (YYYY-MM-DD)
 */
export function useLowStockMeals(weekStart: string) {
  const backendReady = useBackendReady();
  return useQuery<LowStockMealAlert[]>({
    queryKey: patternKeys.lowStockMeals(weekStart),
    queryFn: () => patternsApi.getLowStockMeals(weekStart),
    staleTime: 60 * 1000,
    enabled: backendReady && !!weekStart,
  });
}

/**
 * Hook to fetch LinUCB tracking mode suggestions.
 */
export function useTrackingSuggestions() {
  const backendReady = useBackendReady();
  return useQuery<TrackingModeSuggestion[]>({
    queryKey: patternKeys.trackingSuggestions(),
    queryFn: () => patternsApi.getTrackingSuggestions(),
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get the current week's start date (Sunday).
 * Uses local timezone to avoid off-by-one-day errors.
 */
export function getCurrentWeekStart(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const diff = today.getDate() - dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(diff);
  // Use local date formatting instead of toISOString() which returns UTC
  const year = sunday.getFullYear();
  const month = String(sunday.getMonth() + 1).padStart(2, '0');
  const day = String(sunday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format day name from day number (0 = Sunday).
 */
export function getDayName(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day] || '';
}

/**
 * Format hour for display (e.g., "7 PM").
 */
export function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

/**
 * Get status color class for day health.
 */
export function getDayHealthColor(status: DayHealth['status']): string {
  switch (status) {
    case 'light':
      return 'text-emerald-400';
    case 'balanced':
      return 'text-cyan-400';
    case 'busy':
      return 'text-amber-400';
    case 'overloaded':
      return 'text-amber-400';
    default:
      return 'text-slate-400';
  }
}

/**
 * Get trend indicator for spending.
 */
export function getSpendingTrendIndicator(trend: SpendingTrend['trend']): {
  icon: string;
  color: string;
  label: string;
} {
  switch (trend) {
    case 'higher':
      return { icon: '↑', color: 'text-amber-400', label: 'Higher than usual' };
    case 'lower':
      return { icon: '↓', color: 'text-emerald-400', label: 'Lower than usual' };
    case 'normal':
    default:
      return { icon: '→', color: 'text-slate-400', label: 'Normal range' };
  }
}
