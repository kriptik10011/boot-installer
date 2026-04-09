import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recurrenceRuleApi } from '@/api/client';
import { useBackendReady } from './useBackendReady';
import type { RecurrenceRuleCreate } from '@/types';

export const recurrenceKeys = {
  all: ['recurrence-rules'] as const,
  detail: (id: number) => [...recurrenceKeys.all, 'detail', id] as const,
};

export function useRecurrenceRule(id: number | null) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: recurrenceKeys.detail(id ?? 0),
    queryFn: () => {
      if (id === null) throw new Error('Recurrence rule ID is required');
      return recurrenceRuleApi.get(id);
    },
    enabled: backendReady && id !== null && id > 0,
  });
}

export function useCreateRecurrenceRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RecurrenceRuleCreate) => recurrenceRuleApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurrenceKeys.all });
    },
  });
}

export function useDeleteRecurrenceRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => recurrenceRuleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurrenceKeys.all });
    },
  });
}
