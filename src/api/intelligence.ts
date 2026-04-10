/**
 * Intelligence API — patterns, insights, habits, recipe intelligence,
 * domain intelligence (restocking, variety, etc.).
 */

import { request } from './core';

// =============================================================================
// TEMPORAL PATTERN TYPES
// =============================================================================

export interface PlanningTime {
  day: number;
  hour: number;
  confidence: number;
  session_count: number;
  total_planning_sessions: number;
}

export interface TemporalPatterns {
  planning_time: PlanningTime | null;
  peak_hours: number[];
  busiest_day: number | null;
  events_by_day: Record<number, number>;
  events_by_hour: Record<number, number>;
  weekly_pattern: Record<string, unknown> | null;
}

// =============================================================================
// BEHAVIORAL PATTERN TYPES
// =============================================================================

export interface SessionAnalysis {
  total_sessions: number;
  median_duration_seconds: number | null;
  mean_duration_seconds: number | null;
  ewma_duration_seconds: number | null;
  duration_trend: string | null;
  planning_sessions: number | null;
  living_sessions: number | null;
  planning_ratio: number | null;
  sessions_per_day: number | null;
  insufficient_data: boolean;
}

export interface ViewPreference {
  view: string;
  total_seconds: number;
  entries: number;
  avg_seconds_per_visit: number;
  time_share: number;
}

export interface ActionFrequency {
  action: string;
  count: number;
  frequency_share: number;
}

export interface BehavioralPatterns {
  sessions: SessionAnalysis;
  view_preferences: ViewPreference[];
  action_frequency: ActionFrequency[];
  preferred_start_view: string | null;
  dismissals: Record<string, unknown>;
}

// =============================================================================
// DAY HEALTH + WEEK SUMMARY TYPES
// =============================================================================

export interface DayHealth {
  date: string;
  score: number;
  status: 'light' | 'balanced' | 'busy' | 'overloaded';
  event_count: number;
  has_conflicts: boolean;
  conflict_count: number;
  bills_due: number;
  bills_amount: number;
  overdue_bills: number;
  unplanned_meals: number;
}

export interface PatternWeekSummary {
  week_start: string;
  week_end: string;
  busy_days: number;
  total_bills_due: number;
  unpaid_bills: number;
  overdue_bills: number;
  unplanned_meals: number;
  event_conflicts: number;
  summary_sentence: string;
  day_healths: DayHealth[];
}

export interface EventConflict {
  date: string;
  event1_id: number;
  event1_name: string;
  event2_id: number;
  event2_name: string;
  overlap_minutes: number;
}

export interface SpendingTrend {
  current_week: number;
  four_week_average: number;
  percent_change: number;
  trend: 'higher' | 'lower' | 'normal';
  weekly_history: number[];
  insufficient_data: boolean;
}

export interface MealGap {
  date: string;
  meal_type: string;
  day_name: string;
}

// =============================================================================
// INSIGHT TYPES
// =============================================================================

export interface InsightEvidence {
  observation_count?: number;
  pattern_strength?: number;
  last_observed?: string;
  context?: string;
}

export interface Insight {
  type: string;
  message: string;
  priority: number;
  confidence: number;
  evidence?: InsightEvidence;
  is_template?: boolean;
  learning_message?: string;
  learning_features?: string[];
  next_ready?: string;
  next_ready_progress?: number;
}

export interface ConfidenceScores {
  temporal: number;
  behavioral: number;
  overall: number;
  ready_for_surfacing: boolean;
}

// =============================================================================
// HABIT TYPES
// =============================================================================

export interface HabitStreakDisplay {
  streak: number;
  trend_score: number;
  best_of_y: string;
  trend_label: 'Strong habit' | 'Building' | 'Fading' | 'Starting fresh';
  saves_remaining: number;
  saves_text: string;
  total_weeks: number;
  total_occurrences: number;
  display_text: string;
  trend_text: string;
  recorded_this_week: boolean | null;
}

export interface HabitStreak {
  id: number;
  habit_name: string;
  current_streak: number;
  forgiveness_tokens: number;
  trend_score: number;
  total_occurrences: number;
  tracking_weeks: number;
  last_occurrence: string | null;
  tokens_used: number;
  max_tokens: number;
  display: HabitStreakDisplay;
}

export interface HabitReference {
  name: string;
  display: HabitStreakDisplay;
}

export interface HabitsSummary {
  has_data: boolean;
  habits_tracked: number;
  overall_health: number;
  strongest_habit: HabitReference | null;
  weakest_habit: HabitReference | null;
  habits: HabitStreak[];
}

export interface AllPatterns {
  temporal: TemporalPatterns;
  behavioral: BehavioralPatterns;
  week_summary: PatternWeekSummary;
  day_healths: DayHealth[];
  conflicts: EventConflict[];
  spending_trend: SpendingTrend;
  meal_gaps: MealGap[];
  week_start: string;
}

// =============================================================================
// DOMAIN INTELLIGENCE TYPES
// =============================================================================

export interface RecurringMealPattern {
  recipe_id: number;
  recipe_name: string;
  day_of_week: number;
  meal_type: string;
  occurrences: number;
}

export interface IngredientRepeat {
  ingredient_id: number;
  ingredient_name: string;
  count: number;
  recipe_names: string[];
}

export interface IngredientVariety {
  variety_score: number;
  repeated_ingredients: IngredientRepeat[];
  total_unique: number;
  total_uses: number;
}

export interface RestockingPrediction {
  item_id: number;
  item_name: string;
  ingredient_id: number | null;
  tracking_mode: string;
  needs_restock: boolean;
  percent_full: number | null;
  quantity: number | null;
  unit: string | null;
  predicted_depletion_days: number | null;
}

export interface LowStockMealAlert {
  ingredient_id: number;
  ingredient_name: string;
  recipe_name: string;
  meal_date: string;
  reason: string;
}

export interface TrackingModeSuggestion {
  ingredient_id: number;
  ingredient_name: string;
  suggested_mode: string;
  current_mode: string;
  count_interactions: number;
  percentage_interactions: number;
}

// =============================================================================
// RECIPE INSIGHT TYPES
// =============================================================================

export interface CookingHistoryItem {
  meal_id: number;
  date: string;
  cooked_at: string | null;
  actual_servings: number | null;
  actual_prep_minutes: number | null;
  actual_cook_minutes: number | null;
  total_minutes: number;
  notes: string | null;
}

export interface RecipeDurationEstimate {
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  source: 'recipe' | 'personalized';
  confidence: number;
  sample_count: number;
  recipe_prep_minutes: number | null;
  recipe_cook_minutes: number | null;
  message?: string;
}

export interface ChefNote {
  note: string;
  date: string;
  cooked_at: string | null;
  servings: number | null;
}

export interface RecipeTimeSuggestion {
  recipe_id: number;
  recipe_name?: string;
  suggestion_type: string;
  direction: 'longer' | 'shorter';
  message: string;
  recipe_total_minutes: number;
  actual_total_minutes: number;
  suggested_prep_minutes: number;
  suggested_cook_minutes: number;
  variance_percent: number;
  confidence: number;
  sample_count: number;
}

export interface RecipeFavoriteItem {
  recipe_id: number;
  recipe_name: string;
  cook_count: number;
  last_cooked: string | null;
}

export interface RecipeInsights {
  recipe_id: number;
  duration_estimate: RecipeDurationEstimate;
  chef_notes: ChefNote[];
  time_suggestion: RecipeTimeSuggestion | null;
}

// =============================================================================
// PATTERNS API
// =============================================================================

export const patternsApi = {
  getTemporal: () => request<TemporalPatterns>('/patterns/temporal'),
  getBehavioral: () => request<BehavioralPatterns>('/patterns/behavioral'),

  getDayHealth: (date: string) => request<DayHealth>(`/patterns/day-health/${date}`),
  getWeekSummary: (weekStart: string) =>
    request<PatternWeekSummary>(`/patterns/week-summary/${weekStart}`),
  getConflicts: (weekStart: string) =>
    request<EventConflict[]>(`/patterns/conflicts/${weekStart}`),
  getSpendingTrends: () => request<SpendingTrend>('/patterns/spending-trends'),
  getMealGaps: (weekStart: string) =>
    request<MealGap[]>(`/patterns/meal-gaps/${weekStart}`),

  getHabits: () => request<HabitStreak[]>('/patterns/habits'),
  getHabitsSummary: () => request<HabitsSummary>('/patterns/habits/summary'),
  getHabit: (habitName: string) => request<HabitStreak>(`/patterns/habits/${habitName}`),
  recordHabit: (habitName: string, occurred: boolean) =>
    request<HabitStreak>(`/patterns/habits/${habitName}/record`, {
      method: 'POST',
      body: { occurred },
    }),

  getRecurringMeals: (weeksBack: number = 4) =>
    request<RecurringMealPattern[]>(`/patterns/recurring-meals?weeks_back=${weeksBack}`),
  getIngredientVariety: (weekStart: string) =>
    request<IngredientVariety>(`/patterns/ingredient-variety/${weekStart}`),
  getRestockingPredictions: () =>
    request<RestockingPrediction[]>('/patterns/restocking-predictions'),
  getLowStockMeals: (weekStart: string) =>
    request<LowStockMealAlert[]>(`/patterns/low-stock-meals/${weekStart}`),
  getTrackingSuggestions: () =>
    request<TrackingModeSuggestion[]>('/patterns/tracking-suggestions'),

  getAll: (weekStart?: string) => {
    const params = weekStart ? `?week_start=${weekStart}` : '';
    return request<AllPatterns>(`/patterns/all${params}`);
  },

  getInsights: (weekStart?: string) => {
    const params = weekStart ? `?week_start=${weekStart}` : '';
    return request<Insight[]>(`/patterns/insights${params}`);
  },

  getConfidence: () => request<ConfidenceScores>('/patterns/confidence'),

  getRecipeCookingHistory: (recipeId: number, limit: number = 10) =>
    request<CookingHistoryItem[]>(`/patterns/recipes/${recipeId}/cooking-history?limit=${limit}`),
  getRecipeDurationEstimate: (recipeId: number) =>
    request<RecipeDurationEstimate>(`/patterns/recipes/${recipeId}/duration-estimate`),
  getRecipeChefNotes: (recipeId: number, limit: number = 5) =>
    request<ChefNote[]>(`/patterns/recipes/${recipeId}/chef-notes?limit=${limit}`),
  getRecipeTimeSuggestion: (recipeId: number) =>
    request<RecipeTimeSuggestion | null>(`/patterns/recipes/${recipeId}/time-suggestion`),
  getRecipeInsights: (recipeId: number) =>
    request<RecipeInsights>(`/patterns/recipes/${recipeId}/insights`),
  getAllTimeSuggestions: () =>
    request<RecipeTimeSuggestion[]>('/patterns/recipes/time-suggestions'),
  getRecipeFavorites: (limit: number = 10) =>
    request<RecipeFavoriteItem[]>(`/patterns/recipes/favorites?limit=${limit}`),
};

// =============================================================================
// INTELLIGENCE API
// =============================================================================

export const intelligenceKeys = {
  all: ['intelligence'] as const,
  recipes: () => [...intelligenceKeys.all, 'recipes'] as const,
  events: (weekStart: string) => [...intelligenceKeys.all, 'events', weekStart] as const,
  finance: () => [...intelligenceKeys.all, 'finance'] as const,
  inventory: () => [...intelligenceKeys.all, 'inventory'] as const,
  meals: (weekStart: string) => [...intelligenceKeys.all, 'meals', weekStart] as const,
  crossFeature: (weekStart?: string) => [...intelligenceKeys.all, 'cross-feature', weekStart] as const,
};

export const intelligenceApi = {
  getRecipes: () =>
    request<Record<string, unknown>>('/intelligence/recipes'),
  getEvents: (weekStart: string) =>
    request<Record<string, unknown>>(`/intelligence/events?week_start=${weekStart}`),
  getFinance: () =>
    request<Record<string, unknown>>('/intelligence/finance'),
  getInventory: () =>
    request<Record<string, unknown>>('/intelligence/inventory'),
  getMeals: (weekStart: string) =>
    request<Record<string, unknown>>(`/intelligence/meals?week_start=${weekStart}`),
  getCrossFeature: (weekStart?: string) => {
    const qs = weekStart ? `?week_start=${weekStart}` : '';
    return request<Record<string, unknown>>(`/intelligence/cross-feature${qs}`);
  },
};
