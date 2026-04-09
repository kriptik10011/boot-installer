/**
 * usePredictions — Hooks for meal drafts, bill predictions, spending velocity.
 *
 * All prediction data is read-only until explicitly applied by the user.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { predictionsApi, type DraftMealSuggestion } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import { useBackendReady } from './useBackendReady';
import { useToastStore } from '@/stores/toastStore';

// Query keys
const predictionKeys = {
  all: ['predictions'] as const,
  mealDrafts: (weekStart: string) => ['predictions', 'meal-drafts', weekStart] as const,
  billPredictions: (weekStart: string) => ['predictions', 'bill-predictions', weekStart] as const,
  spendingVelocity: (days: number) => ['predictions', 'spending-velocity', days] as const,
};

export function useMealDrafts() {
  const weekStart = useAppStore((s) => s.currentWeekStart);
  const backendReady = useBackendReady();

  return useQuery({
    queryKey: predictionKeys.mealDrafts(weekStart),
    queryFn: () => predictionsApi.getMealDrafts(weekStart),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: backendReady,
  });
}

export function useApplyMealDrafts() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({ suggestions, overwrite }: { suggestions: DraftMealSuggestion[]; overwrite?: boolean }) =>
      predictionsApi.applyMealDrafts(suggestions, overwrite),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: predictionKeys.all });
      addToast({
        type: 'success',
        message: data.message,
        durationMs: 4000,
      });
    },
    onError: () => {
      addToast({
        type: 'error',
        message: 'Failed to apply meal drafts',
        durationMs: 4000,
      });
    },
  });
}

export function useBillPredictions(windowDays = 14) {
  const weekStart = useAppStore((s) => s.currentWeekStart);
  const backendReady = useBackendReady();

  return useQuery({
    queryKey: predictionKeys.billPredictions(weekStart),
    queryFn: () => predictionsApi.getBillPredictions(weekStart, windowDays),
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}

export function useApplyBillPrediction() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({ recurrenceId, amount, date }: { recurrenceId: number; amount: number; date: string }) =>
      predictionsApi.applyBillPrediction(recurrenceId, amount, date),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: predictionKeys.all });
      addToast({
        type: 'success',
        message: data.message,
        durationMs: 4000,
      });
    },
    onError: () => {
      addToast({
        type: 'error',
        message: 'Failed to apply bill prediction',
        durationMs: 4000,
      });
    },
  });
}

export function useSpendingVelocity(days = 30) {
  const backendReady = useBackendReady();

  return useQuery({
    queryKey: predictionKeys.spendingVelocity(days),
    queryFn: () => predictionsApi.getSpendingVelocity(undefined, days),
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}
