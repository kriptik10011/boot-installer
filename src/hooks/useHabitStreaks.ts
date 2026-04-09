/**
 * Habit Streak Hooks
 *
 * TanStack Query hooks for accessing habit streak data.
 *
 * Uses forgiveness-based streaks with "Best X of Y" display.
 * No-shame design: focuses on progress, not failure.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patternsApi, type HabitStreak, type HabitsSummary } from '@/api/client';
import { useBackendReady } from './useBackendReady';

// Query keys for habit streaks
export const habitKeys = {
  all: ['habits'] as const,
  list: () => [...habitKeys.all, 'list'] as const,
  summary: () => [...habitKeys.all, 'summary'] as const,
  detail: (habitName: string) => [...habitKeys.all, 'detail', habitName] as const,
};

/**
 * Hook to fetch all habit streaks.
 */
export function useHabitStreaks() {
  const backendReady = useBackendReady();
  return useQuery<HabitStreak[]>({
    queryKey: habitKeys.list(),
    queryFn: () => patternsApi.getHabits(),
    staleTime: 60 * 1000, // 1 minute
    enabled: backendReady,
  });
}

/**
 * Hook to fetch habit streaks summary.
 *
 * Includes strongest/weakest habit for quick overview.
 */
export function useHabitsSummary() {
  const backendReady = useBackendReady();
  return useQuery<HabitsSummary>({
    queryKey: habitKeys.summary(),
    queryFn: () => patternsApi.getHabitsSummary(),
    staleTime: 60 * 1000, // 1 minute
    enabled: backendReady,
  });
}

/**
 * Hook to fetch a specific habit by name.
 *
 * @param habitName - The habit name (e.g., "planning_session")
 */
export function useHabit(habitName: string) {
  const backendReady = useBackendReady();
  return useQuery<HabitStreak>({
    queryKey: habitKeys.detail(habitName),
    queryFn: () => patternsApi.getHabit(habitName),
    staleTime: 60 * 1000, // 1 minute
    enabled: backendReady && !!habitName,
  });
}

/**
 * Hook to record a habit occurrence.
 *
 * Call with occurred=true when the habit was done,
 * occurred=false when it was missed (may use forgiveness token).
 */
export function useRecordHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ habitName, occurred }: { habitName: string; occurred: boolean }) =>
      patternsApi.recordHabit(habitName, occurred),
    onSuccess: (updatedHabit, { habitName }) => {
      // Update the specific habit in cache
      queryClient.setQueryData(habitKeys.detail(habitName), updatedHabit);
      // Invalidate the list and summary to refresh
      queryClient.invalidateQueries({ queryKey: habitKeys.list() });
      queryClient.invalidateQueries({ queryKey: habitKeys.summary() });
    },
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get trend color based on trend label.
 */
export function getHabitTrendColor(trendLabel: HabitStreak['display']['trend_label']): string {
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
 * Get trend background color based on trend label.
 */
export function getHabitTrendBgColor(trendLabel: HabitStreak['display']['trend_label']): string {
  switch (trendLabel) {
    case 'Strong habit':
      return 'bg-emerald-500/15';
    case 'Building':
      return 'bg-cyan-500/15';
    case 'Fading':
      return 'bg-amber-500/15';
    case 'Starting fresh':
      return 'bg-slate-500/15';
    default:
      return 'bg-slate-500/15';
  }
}

/**
 * Get icon for trend label.
 */
export function getHabitTrendIcon(trendLabel: HabitStreak['display']['trend_label']): string {
  switch (trendLabel) {
    case 'Strong habit':
      return '*';
    case 'Building':
      return '+';
    case 'Fading':
      return '-';
    case 'Starting fresh':
      return 'o';
    default:
      return '•';
  }
}
