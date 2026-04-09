/**
 * Hooks for Batch Meal Prep — schedule prep sessions and link meals.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { batchPrepApi } from '@/api/client';
import type { BatchPrepSession } from '@/types';

export function useWeekPrepSessions(weekStart: string) {
  return useQuery<BatchPrepSession[]>({
    queryKey: ['batch-prep', 'week', weekStart],
    queryFn: () => batchPrepApi.getWeek(weekStart),
    enabled: !!weekStart,
  });
}

export function usePrepSession(id: number) {
  return useQuery<BatchPrepSession>({
    queryKey: ['batch-prep', id],
    queryFn: () => batchPrepApi.get(id),
    enabled: !!id,
  });
}

export function useCreatePrepSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => batchPrepApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-prep'] });
    },
  });
}

export function useCompletePrepSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actualMinutes }: { id: number; actualMinutes?: number }) =>
      batchPrepApi.complete(id, actualMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-prep'] });
    },
  });
}

export function useTogglePrepTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, taskId }: { sessionId: number; taskId: number }) =>
      batchPrepApi.toggleTask(sessionId, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-prep'] });
    },
  });
}

export function useDeletePrepSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => batchPrepApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-prep'] });
    },
  });
}
