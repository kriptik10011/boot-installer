/**
 * Events API — calendar events, recurrence rules, calendar import.
 */

import { request } from './core';
import type {
  Event,
  EventCreate,
  EventUpdate,
  EventCategory,
  RecurrenceRule,
  RecurrenceRuleCreate,
} from '@/types';

// =============================================================================
// RECURRENCE RULES API
// =============================================================================

export const recurrenceRuleApi = {
  create: (data: RecurrenceRuleCreate) =>
    request<RecurrenceRule>('/recurrence', { method: 'POST', body: data }),
  get: (id: number) =>
    request<RecurrenceRule>(`/recurrence/${id}`),
  update: (id: number, data: Partial<RecurrenceRuleCreate>) =>
    request<RecurrenceRule>(`/recurrence/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) =>
    request<void>(`/recurrence/${id}`, { method: 'DELETE' }),
};

// =============================================================================
// EVENTS API
// =============================================================================

export const eventsApi = {
  list: () => request<Event[]>('/events'),
  get: (id: number) => request<Event>(`/events/${id}`),
  create: (data: EventCreate) => request<Event>('/events', { method: 'POST', body: data }),
  update: (id: number, data: EventUpdate) => request<Event>(`/events/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) => request<void>(`/events/${id}`, { method: 'DELETE' }),
  getWeek: (weekStart: string) => request<Event[]>(`/events/week/${weekStart}`),
};

// =============================================================================
// EVENT CATEGORIES
// =============================================================================

export const eventCategoriesApi = {
  list: () => request<EventCategory[]>('/categories/events'),
  create: (data: { name: string }) =>
    request<EventCategory>('/categories/events', { method: 'POST', body: data }),
};

