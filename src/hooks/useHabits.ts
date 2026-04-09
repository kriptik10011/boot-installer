/**
 * useHabits Hook
 *
 * Manages hybrid habit tracking:
 * - Auto-tracked habits (from observations)
 * - User-defined custom habits
 * - Weekly check-in functionality
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/core';
import { recordAction } from '@/services/observation';
import { useAuthStore } from '@/stores/authStore';
import { getMonday } from '@/utils/dateUtils';

// =============================================================================
// TYPES
// =============================================================================

export interface HabitDisplay {
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
}

export interface Habit {
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
  display: HabitDisplay;
}

export interface HabitsSummary {
  has_data: boolean;
  habits_tracked: number;
  overall_health: number;
  strongest_habit: { name: string; display: HabitDisplay } | null;
  weakest_habit: { name: string; display: HabitDisplay } | null;
  habits: Habit[];
}

export interface RecordResult {
  habit: string;
  action: 'increment' | 'token_used' | 'reset' | 'none';
  message: string;
  display: HabitDisplay;
}

// Auto-tracked habit definitions
export const AUTO_HABITS = {
  meal_planning: {
    name: 'meal_planning',
    displayName: 'Meal Planning',
    description: 'Planning meals for the week',
    icon: '*',
  },
  bill_review: {
    name: 'bill_review',
    displayName: 'Bill Review',
    description: 'Reviewing and paying bills',
    icon: '$',
  },
  weekly_planning: {
    name: 'weekly_planning',
    displayName: 'Weekly Planning',
    description: 'Planning your week on Sunday',
    icon: '#',
  },
} as const;

export type AutoHabitKey = keyof typeof AUTO_HABITS;

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Fetch all habits with their current status
 */
export function useHabits() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery<Habit[]>({
    queryKey: ['habits'],
    queryFn: () => request<Habit[]>('/patterns/habits'),
    staleTime: 30000, // 30 seconds
    enabled: isAuthenticated,
  });
}

/**
 * Fetch habits summary with strongest/weakest
 */
export function useHabitsSummary() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery<HabitsSummary>({
    queryKey: ['habits', 'summary'],
    queryFn: () => request<HabitsSummary>('/patterns/habits/summary'),
    staleTime: 30000,
    enabled: isAuthenticated,
  });
}

/**
 * Record a habit occurrence (creates habit if it doesn't exist)
 */
export function useRecordHabit() {
  const queryClient = useQueryClient();

  return useMutation<RecordResult, Error, { habitName: string; occurred: boolean }>({
    mutationFn: async ({ habitName, occurred }) => {
      return request<RecordResult>(`/patterns/habits/${habitName}/record`, {
        method: 'POST',
        body: { occurred },
      });
    },
    onSuccess: (result, variables) => {
      // Record observation for intelligence layer
      // Critical for habit pattern learning and streak predictions
      recordAction(
        variables.occurred ? 'habit_recorded' : 'habit_skipped',
        'habits',
        undefined,
        {
          habit_name: variables.habitName,
          action: result.action,
          streak: result.display.streak,
          trend_label: result.display.trend_label,
          day_of_week: new Date().getDay(),
        }
      );

      // Invalidate habits queries to refresh data
      // TanStack Query cascades from ['habits'] prefix, but add explicit
      // ['habits', 'summary'] invalidation for safety (ensures summary
      // recalculates strongest/weakest after recording)
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['habits', 'summary'] });
    },
  });
}

/**
 * Get habits that need weekly check-in
 * Returns habits that haven't been recorded this week
 */
export function useHabitsNeedingCheckIn() {
  const { data: habits } = useHabits();

  if (!habits) return [];

  const thisWeekStart = getMonday();

  return habits.filter(habit => {
    if (!habit.last_occurrence) return true;
    return new Date(habit.last_occurrence) < new Date(thisWeekStart);
  });
}

/**
 * Format habit name for display
 */
export function formatHabitName(name: string): string {
  // Check if it's an auto-habit
  const autoHabit = AUTO_HABITS[name as AutoHabitKey];
  if (autoHabit) return autoHabit.displayName;

  // Format custom habit names (snake_case to Title Case)
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Get habit icon
 */
export function getHabitIcon(name: string): string {
  const autoHabit = AUTO_HABITS[name as AutoHabitKey];
  if (autoHabit) return autoHabit.icon;
  return '✓'; // Default icon for custom habits
}

/**
 * Get trend color class based on trend label
 */
export function getTrendColor(trendLabel: string): string {
  switch (trendLabel) {
    case 'Strong habit':
      return 'text-emerald-400';
    case 'Building':
      return 'text-cyan-400';
    case 'Fading':
      return 'text-amber-400';
    case 'Starting fresh':
      return 'text-slate-400';
    default:
      return 'text-slate-400';
  }
}

/**
 * Get background color class based on trend label
 */
export function getTrendBgColor(trendLabel: string): string {
  switch (trendLabel) {
    case 'Strong habit':
      return 'bg-emerald-500/10 border-emerald-500/20';
    case 'Building':
      return 'bg-cyan-500/10 border-cyan-500/20';
    case 'Fading':
      return 'bg-amber-500/10 border-amber-500/20';
    case 'Starting fresh':
      return 'bg-slate-700/50 border-slate-600/50';
    default:
      return 'bg-slate-700/50 border-slate-600/50';
  }
}

// =============================================================================
// HELPERS
// =============================================================================
