/**
 * usePlanRepair Hook
 *
 * Manages plan repair modal state and item detection.
 * Identifies items that need attention (overdue, missed, etc.)
 * without using shame language.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Event, FinancialItem, MealPlanEntry } from '@/types';
import type {
  RepairableItem,
  RepairableItemType,
  RepairAction,
} from '@/components/week/PlanRepairModal';
import { financesApi } from '@/api/client';
import { financeKeys } from '@/hooks/useFinances';
import { config } from '@/config';

// =============================================================================
// TYPES
// =============================================================================

export interface PlanRepairState {
  isOpen: boolean;
  selectedItem: RepairableItem | null;
}

export interface NeedsAttentionSummary {
  total: number;
  bills: RepairableItem[];
  events: RepairableItem[];
  meals: RepairableItem[];
}

export interface UsePlanRepairReturn {
  // Modal state
  isOpen: boolean;
  selectedItem: RepairableItem | null;

  // Modal actions
  openRepair: (item: RepairableItem) => void;
  closeRepair: () => void;

  // Items detection
  needsAttention: NeedsAttentionSummary;

  // Repair handler (to be connected to API)
  handleRepair: (
    item: RepairableItem,
    action: RepairAction,
    newDate?: string
  ) => Promise<void>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a date is in the past (before today)
 */
function isPastDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Convert a bill to a repairable item
 */
function billToRepairableItem(bill: FinancialItem): RepairableItem {
  return {
    id: bill.id,
    type: 'bill',
    name: bill.name,
    date: bill.due_date,
    amount: bill.amount,
    description: bill.notes ?? undefined,
  };
}

/**
 * Convert an event to a repairable item
 */
function eventToRepairableItem(event: Event): RepairableItem {
  return {
    id: event.id,
    type: 'event',
    name: event.name,
    date: event.date,
    description: event.description ?? undefined,
  };
}

/**
 * Convert a meal to a repairable item
 */
function mealToRepairableItem(meal: MealPlanEntry, date: string): RepairableItem {
  const mealName = meal.description ?? `${meal.meal_type} meal`;
  return {
    id: meal.id,
    type: 'meal',
    name: mealName,
    date: date,
  };
}

// =============================================================================
// HOOK
// =============================================================================

export interface UsePlanRepairOptions {
  bills?: FinancialItem[];
  events?: Event[];
  meals?: MealPlanEntry[];
  onRepairComplete?: (
    item: RepairableItem,
    action: RepairAction,
    newDate?: string
  ) => void;
}

export function usePlanRepair(options: UsePlanRepairOptions = {}): UsePlanRepairReturn {
  const { bills = [], events = [], meals = [], onRepairComplete } = options;
  const queryClient = useQueryClient();

  // Modal state
  const [state, setState] = useState<PlanRepairState>({
    isOpen: false,
    selectedItem: null,
  });

  // Detect items that need attention
  const needsAttention = useMemo<NeedsAttentionSummary>(() => {
    // Find overdue unpaid bills (past due_date, not paid)
    const overdueBills = bills
      .filter((bill) => !bill.is_paid && isPastDate(bill.due_date))
      .map(billToRepairableItem);

    // Find past events that might need rescheduling
    // (This is less common - events just pass, but some might need follow-up)
    // For now, we'll skip events unless explicitly marked as "needs attention"
    const pastEvents: RepairableItem[] = [];

    // Find unplanned meals in the past
    // (Meals without a recipe_id or description that have passed)
    const missedMeals = meals
      .filter(
        (meal) =>
          isPastDate(meal.date) && !meal.recipe_id && !meal.description
      )
      .map((meal) => mealToRepairableItem(meal, meal.date));

    return {
      total: overdueBills.length + pastEvents.length + missedMeals.length,
      bills: overdueBills,
      events: pastEvents,
      meals: missedMeals,
    };
  }, [bills, events, meals]);

  // Modal actions
  const openRepair = useCallback((item: RepairableItem) => {
    setState({
      isOpen: true,
      selectedItem: item,
    });
  }, []);

  const closeRepair = useCallback(() => {
    setState({
      isOpen: false,
      selectedItem: null,
    });
  }, []);

  // Handle repair action - connected to actual API
  // RepairAction is 'reschedule' | 'reduce' | 'drop'
  const handleRepair = useCallback(
    async (
      item: RepairableItem,
      action: RepairAction,
      newDate?: string
    ): Promise<void> => {
      // Validate newDate if provided for reschedule action
      if (newDate && action === 'reschedule') {
        const date = new Date(newDate);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date format');
        }
      }

      if (import.meta.env.DEV) {
      }

      try {
        // Handle different item types
        if (item.type === 'bill') {
          switch (action) {
            case 'reschedule':
              // Update the due date
              if (newDate) {
                await financesApi.update(item.id, { due_date: newDate });
              }
              break;

            case 'reduce':
              // For bills, "reduce" could mean partial payment or adjustment
              // For now, treat as acknowledging but not marking paid
              break;

            case 'drop':
              // Mark the bill as paid (handled outside app)
              await financesApi.markPaid(item.id);
              break;
          }

          // Invalidate finance queries to refresh data
          queryClient.invalidateQueries({ queryKey: financeKeys.lists() });
          queryClient.invalidateQueries({ queryKey: financeKeys.overdue() });
        } else if (item.type === 'event') {
          // Event repair actions
          switch (action) {
            case 'reschedule':
              if (newDate) {
                // Update event date via events API
                const res = await fetch(`${config.api.baseUrl}/events/${item.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ date: newDate }),
                });
                if (!res.ok) throw new Error('Failed to reschedule event');
              }
              break;

            case 'reduce':
              // Not applicable for events
              break;

            case 'drop':
              // Delete the event
              await fetch(`${config.api.baseUrl}/events/${item.id}`, {
                method: 'DELETE',
              });
              break;
          }

          // Invalidate event queries
          queryClient.invalidateQueries({ queryKey: ['events'] });
        } else if (item.type === 'meal') {
          // Meal repair actions
          switch (action) {
            case 'reschedule':
              if (newDate) {
                // Update meal date via meals API
                const res = await fetch(`${config.api.baseUrl}/meals/${item.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ date: newDate }),
                });
                if (!res.ok) throw new Error('Failed to reschedule meal');
              }
              break;

            case 'reduce':
              // Not applicable for meals
              break;

            case 'drop':
              // Delete the meal entry
              await fetch(`${config.api.baseUrl}/meals/${item.id}`, {
                method: 'DELETE',
              });
              break;
          }

          // Invalidate meal queries
          queryClient.invalidateQueries({ queryKey: ['meals'] });
        }

        // Record observation for adaptation (if we have the observation API)
        try {
          await fetch(`${config.api.baseUrl}/observation/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: 'plan_repair',
              event_data: {
                item_type: item.type,
                action,
                item_id: item.id,
              },
              timestamp: new Date().toISOString(),
            }),
          });
        } catch {
          // Non-critical - don't fail the repair if observation fails
        }

        // Notify completion
        if (onRepairComplete) {
          onRepairComplete(item, action, newDate);
        }
      } catch (error) {
        throw error;
      } finally {
        // Close modal regardless of success/failure
        closeRepair();
      }
    },
    [closeRepair, onRepairComplete, queryClient]
  );

  return {
    isOpen: state.isOpen,
    selectedItem: state.selectedItem,
    openRepair,
    closeRepair,
    needsAttention,
    handleRepair,
  };
}

/**
 * Utility function to create a repairable item from various sources
 */
export function createRepairableItem(
  type: RepairableItemType,
  data: Event | FinancialItem | MealPlanEntry
): RepairableItem {
  switch (type) {
    case 'bill':
      return billToRepairableItem(data as FinancialItem);
    case 'event':
      return eventToRepairableItem(data as Event);
    case 'meal':
      const meal = data as MealPlanEntry;
      return mealToRepairableItem(meal, meal.date);
  }
}
