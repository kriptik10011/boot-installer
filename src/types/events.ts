/**
 * Event & Recurrence Types
 */

export interface EventCategory {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceEndType = 'never' | 'count' | 'date';

export interface RecurrenceRule {
  id: number;
  frequency: RecurrenceFrequency;
  interval: number;
  day_of_week: number | null;
  day_of_month: number | null;
  end_type: RecurrenceEndType;
  end_count: number | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurrenceRuleCreate {
  frequency: RecurrenceFrequency;
  interval?: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
  end_type?: RecurrenceEndType;
  end_count?: number | null;
  end_date?: string | null;
}

export interface Event {
  id: number;
  name: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  category_id: number | null;
  recurrence_rule_id: number | null;
  created_at: string;
  updated_at: string;
  is_occurrence?: boolean;
  master_id?: number | null;
  occurrence_date?: string | null;
}

export interface EventCreate {
  name: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  description?: string | null;
  category_id?: number | null;
  recurrence_rule_id?: number | null;
}

export interface EventUpdate extends Partial<EventCreate> {}
