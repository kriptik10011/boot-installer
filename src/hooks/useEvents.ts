import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '@/api/client';
import { recordAction } from '@/services/observation';
import { invalidateIntelligence } from '@/utils/invalidateIntelligence';
import { useBackendReady } from './useBackendReady';
import type { EventCreate, EventUpdate } from '@/types';

// Query keys factory
export const eventKeys = {
  all: ['events'] as const,
  lists: () => [...eventKeys.all, 'list'] as const,
  list: () => [...eventKeys.lists()] as const,
  week: (weekStart: string) => [...eventKeys.all, 'week', weekStart] as const,
  details: () => [...eventKeys.all, 'detail'] as const,
  detail: (id: number) => [...eventKeys.details(), id] as const,
};

// Fetch all events
export function useEvents() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: eventKeys.list(),
    queryFn: eventsApi.list,
    enabled: backendReady,
  });
}

// Fetch events for a specific week
export function useWeekEvents(weekStart: string) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: eventKeys.week(weekStart),
    queryFn: () => eventsApi.getWeek(weekStart),
    enabled: backendReady && !!weekStart,
  });
}

// Fetch a single event by ID
export function useEvent(id: number | null) {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: eventKeys.detail(id ?? 0),
    queryFn: () => {
      if (id === null) throw new Error('Event ID is required');
      return eventsApi.get(id);
    },
    enabled: backendReady && id !== null,
  });
}

// Create a new event
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EventCreate) => eventsApi.create(data),
    onSuccess: (createdEvent, variables) => {
      // Record observation for intelligence layer
      const eventDate = new Date(variables.date);
      recordAction('event_created', 'event', createdEvent.id, {
        day_of_week: eventDate.getDay(),
        has_time: !!variables.start_time,
        has_location: !!variables.location,
        has_category: !!variables.category_id,
        is_recurring: !!variables.recurrence_rule_id,
      });

      // Invalidate all event queries to refetch
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
      invalidateIntelligence(queryClient, 'events');
    },
  });
}

// Update an existing event
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: EventUpdate }) =>
      eventsApi.update(id, data),
    onSuccess: (updatedEvent, variables) => {
      // Record observation for intelligence layer
      // Track what fields were changed for pattern learning
      const changedFields = Object.keys(variables.data).filter(
        (key) => variables.data[key as keyof EventUpdate] !== undefined
      );
      const wasRescheduled = changedFields.includes('date');

      recordAction(wasRescheduled ? 'event_rescheduled' : 'event_updated', 'event', updatedEvent.id, {
        changed_fields: changedFields,
        was_rescheduled: wasRescheduled,
        new_date: variables.data.date ? String(variables.data.date) : undefined,
      });

      // Update the specific event in cache
      queryClient.setQueryData(eventKeys.detail(updatedEvent.id), updatedEvent);
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
      queryClient.invalidateQueries({ queryKey: [...eventKeys.all, 'week'] });
      invalidateIntelligence(queryClient, 'events');
    },
  });
}

// Delete an event
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => eventsApi.delete(id),
    onSuccess: (_data, id) => {
      // Record observation for intelligence layer
      recordAction('event_deleted', 'event', id);

      // Remove from cache
      queryClient.removeQueries({ queryKey: eventKeys.detail(id) });
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
      queryClient.invalidateQueries({ queryKey: [...eventKeys.all, 'week'] });
      invalidateIntelligence(queryClient, 'events');
    },
  });
}
