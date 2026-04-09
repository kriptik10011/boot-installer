/**
 * Event Intelligence Hook (Simplified — Phase A5)
 *
 * Fetches fully computed event intelligence from backend.
 * All computation (conflicts, status, suggestions) happens server-side.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWeekEvents } from './useEvents';
import { useDayHealth } from './usePatterns';
import { getTodayLocal, parseDateLocal } from '@/utils/dateUtils';
import { useBackendReady } from './useBackendReady';
import { intelligenceApi, intelligenceKeys } from '@/api/intelligence';
import type { Event } from '@/types';
import type { DayHealth } from '@/api/client';

// =============================================================================
// TYPES (preserved for consumer compatibility)
// =============================================================================

export interface DayInsight {
  date: string;
  dayName: string;
  isToday: boolean;
  eventCount: number;
  status: DayHealth['status'];
  conflicts: ConflictInsight[];
  suggestions: string[];
  reasoning: string;
}

export interface ConflictInsight {
  event1: Event;
  event2: Event;
  overlapMinutes: number;
  message: string;
  suggestion: string;
}

export interface EventIntelligence {
  dayInsights: DayInsight[];
  totalConflicts: number;
  overloadedDays: number;
  conflictDays: number;
  confidence: number;
  isLearning: boolean;
  isLoading: boolean;
  byDate: Record<string, Event[]>;
  upcoming: Event[];
  weekEventCount: number;
  allEvents: Event[];
}

// =============================================================================
// HOOK
// =============================================================================

export function useEventIntelligence(weekStart: string): EventIntelligence {
  const backendReady = useBackendReady();
  const { data: events = [], isLoading: eventsLoading } = useWeekEvents(weekStart);

  const { data: intel, isLoading: intelLoading } = useQuery({
    queryKey: intelligenceKeys.events(weekStart),
    queryFn: () => intelligenceApi.getEvents(weekStart),
    staleTime: 60_000,
    enabled: backendReady && !!weekStart,
  });

  const isLoading = eventsLoading || intelLoading;

  // Map backend response to consumer interface
  const dayInsights = useMemo((): DayInsight[] => {
    if (!intel?.dayInsights) return [];
    return (intel.dayInsights as Array<Record<string, unknown>>).map((di) => ({
      date: di.date as string,
      dayName: di.dayName as string,
      isToday: di.isToday as boolean,
      eventCount: di.eventCount as number,
      status: di.status as DayHealth['status'],
      conflicts: ((di.conflicts as Array<Record<string, unknown>>) || []).map((c) => ({
        event1: { name: c.event1Name } as Event,
        event2: { name: c.event2Name } as Event,
        overlapMinutes: c.overlapMinutes as number,
        message: c.message as string,
        suggestion: c.suggestion as string,
      })),
      suggestions: (di.suggestions as string[]) || [],
      reasoning: di.reasoning as string,
    }));
  }, [intel]);

  const byDate = useMemo(() => {
    const index: Record<string, Event[]> = {};
    for (const e of events) {
      const key = e.date;
      if (!index[key]) index[key] = [];
      index[key].push(e);
    }
    return index;
  }, [events]);

  const today = getTodayLocal();
  const upcoming = useMemo(
    () => events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [events, today]
  );

  return {
    dayInsights,
    totalConflicts: (intel?.totalConflicts as number) ?? 0,
    overloadedDays: (intel?.overloadedDays as number) ?? 0,
    conflictDays: (intel?.conflictDays as number) ?? 0,
    confidence: (intel?.confidence as number) ?? 0.5,
    isLearning: (intel?.isLearning as boolean) ?? true,
    isLoading,
    byDate,
    upcoming,
    weekEventCount: events.length,
    allEvents: events,
  };
}

/**
 * Get insights for a specific day.
 */
export function useDayEventIntelligence(date: string): {
  insight: DayInsight | null;
  isLoading: boolean;
} {
  const { data: health, isLoading: healthLoading } = useDayHealth(date);

  const weekStart = useMemo(() => {
    const d = parseDateLocal(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [date]);

  const { dayInsights, isLoading: weekLoading } = useEventIntelligence(weekStart);

  const insight = useMemo(() => {
    return dayInsights.find((d) => d.date === date) ?? null;
  }, [dayInsights, date]);

  return {
    insight,
    isLoading: healthLoading || weekLoading,
  };
}
