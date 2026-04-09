/**
 * Hook for weekly review wizard data.
 * Aggregates meals, events, finance, inventory for the guided close process.
 */

import { useQuery } from '@tanstack/react-query';
import { weeklyReviewApi } from '@/api/client';
import type { WeekReviewSummary } from '@/types';

export function useWeeklyReview(weekStart: string) {
  return useQuery<WeekReviewSummary>({
    queryKey: ['weekly-review', weekStart],
    queryFn: () => weeklyReviewApi.getSummary(weekStart),
    enabled: !!weekStart,
    staleTime: 2 * 60 * 1000, // 2 min
  });
}
