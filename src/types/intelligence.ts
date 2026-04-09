/**
 * Observation Layer & Intelligence Types
 */

export type ObservationEventType =
  | 'app_open'
  | 'app_close'
  | 'view_enter'
  | 'view_exit'
  | 'action'
  | 'edit'
  | 'dismissal'
  | 'scroll'
  | 'idle_start'
  | 'idle_end';

export type ViewName =
  | 'week'
  | 'today'
  | 'events'
  | 'meals'
  | 'inventory'
  | 'finances'
  | 'recipes'
  | 'shopping_list'
  | 'settings'
  | 'debug';

export interface ObservationEvent {
  id: number;
  event_type: ObservationEventType;
  view_name: ViewName | null;
  action_name: string | null;
  entity_type: string | null;
  entity_id: number | null;
  metadata: Record<string, unknown> | null;
  session_id: string;
  timestamp: string;
  day_of_week: number;
  hour_of_day: number;
}

export interface ObservationEventCreate {
  event_type: ObservationEventType;
  view_name?: ViewName | null;
  action_name?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  metadata?: Record<string, unknown> | null;
  session_id: string;
}

export interface DwellTimeRecord {
  id: number;
  session_id: string;
  view_name: ViewName;
  total_seconds: number;
  entry_count: number;
  updated_at: string;
}

export interface SessionSummary {
  id: number;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  day_of_week: number;
  hour_started: number;
  views_visited: ViewName[];
  actions_taken: string[];
  is_planning_session: boolean | null;
}

export interface ObservationStats {
  total_events: number;
  total_sessions: number;
  events_by_type: Record<string, number>;
  events_by_day: Record<number, number>;
  events_by_hour: Record<number, number>;
  view_popularity: Array<{ view: string; seconds: number; entries: number }>;
  average_session_duration_seconds: number | null;
  planning_sessions: number;
  living_sessions: number;
}
