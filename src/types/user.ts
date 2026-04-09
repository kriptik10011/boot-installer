/**
 * User, UI State & Summary Types
 */

export type LensType = 'normal' | 'risk' | 'money';

// Weekly Review Summary
export interface WeekReviewSummary {
  week_start: string;
  week_end: string;
  meals_planned: number;
  meals_cooked: number;
  meals_skipped: number;
  top_recipes: string[];
  events_total: number;
  events_completed: number;
  total_income: number;
  total_expenses: number;
  bills_paid: number;
  bills_unpaid: number;
  budget_categories_over: number;
  savings_contributed: number;
  low_stock_count: number;
  expiring_soon_count: number;
  shopping_items_completed: number;
  shopping_items_total: number;
}

// Day Notes
export interface DayNote {
  id: number;
  date: string;
  content: string;
  mood?: string | null;
  is_pinned: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}
