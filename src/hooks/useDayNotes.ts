/**
 * Hooks for Day Notes — freeform text notes attached to each day.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dayNotesApi } from '@/api/client';
import type { DayNote } from '@/types';

export function useWeekNotes(weekStart: string) {
  return useQuery<DayNote[]>({
    queryKey: ['day-notes', 'week', weekStart],
    queryFn: () => dayNotesApi.getWeek(weekStart),
    enabled: !!weekStart,
  });
}

export function useDayNote(date: string) {
  return useQuery<DayNote | null>({
    queryKey: ['day-notes', date],
    queryFn: () => dayNotesApi.get(date),
    enabled: !!date,
  });
}

export function useUpsertDayNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { date: string; content: string; mood?: string; is_pinned?: boolean }) =>
      dayNotesApi.upsert(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['day-notes'] });
    },
  });
}

export function useDeleteDayNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => dayNotesApi.delete(date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['day-notes'] });
    },
  });
}
