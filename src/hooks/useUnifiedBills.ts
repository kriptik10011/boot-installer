/**
 * Unified Bills Hook
 *
 * Bridge that merges one-time (FinancialItem) unpaid bills and recurring
 * (TransactionRecurrence) upcoming bills into a single sorted list with
 * source-aware actions.
 *
 * One-time: BillPanel, DayCard, Open Loops — /api/finances
 * Recurring: BillsRadarCard, BillsTab — /api/recurring
 */

import { useMemo } from 'react';
import { useFinancialItems, useMarkPaid } from './useFinances';
import { useUpcomingBills, useMarkBillPaid } from './useFinanceV2';
import { getTodayLocal } from '@/utils/dateUtils';

export interface UnifiedBill {
  uid: string;          // "ot:42" or "rec:17" — unique across sources
  rawId: number;        // Numeric ID for API calls
  source: 'one_time' | 'recurring';
  name: string;
  amount: number;
  dueDate: string;      // YYYY-MM-DD
  isOverdue: boolean;
  daysUntilDue: number;
  isSubscription: boolean;
  frequency: string | null;
}

interface UseUnifiedBillsOptions {
  days?: number;
}

export function useUnifiedBills(options: UseUnifiedBillsOptions = {}) {
  const { days = 30 } = options;

  // One-time bills: unpaid FinancialItems (TanStack deduplicates if already fetched)
  const { data: oneTimeBills = [], isLoading: oneTimeLoading } = useFinancialItems('bill', false);

  // Recurring bills: upcoming TransactionRecurrences
  const { data: recurringBills = [], isLoading: recurringLoading } = useUpcomingBills(days);

  // Source-aware mutations
  const oneTimeMarkPaid = useMarkPaid();
  const recurringMarkPaid = useMarkBillPaid();

  const bills = useMemo(() => {
    const today = getTodayLocal();
    const todayMs = new Date(today).getTime();
    const unified: UnifiedBill[] = [];

    // Normalize one-time bills
    for (const item of oneTimeBills) {
      if (item.type !== 'bill') continue;
      const dueDateStr = item.due_date?.split('T')[0] ?? today;
      const dueMs = new Date(dueDateStr).getTime();
      const daysDiff = Math.floor((dueMs - todayMs) / (1000 * 60 * 60 * 24));

      unified.push({
        uid: `ot:${item.id}`,
        rawId: item.id,
        source: 'one_time',
        name: item.name,
        amount: item.amount,
        dueDate: dueDateStr,
        isOverdue: daysDiff < 0,
        daysUntilDue: daysDiff,
        isSubscription: !!item.recurrence_rule_id,
        frequency: null,
      });
    }

    // Normalize recurring bills
    // Recurring shape: { id, description, amount, frequency, next_due_date, is_overdue, days_until_due, is_subscription }
    for (const item of recurringBills) {
      const dueDateStr = item.next_due_date?.split('T')[0] ?? today;

      unified.push({
        uid: `rec:${item.id}`,
        rawId: item.id,
        source: 'recurring',
        name: item.description ?? 'Unnamed',
        amount: item.amount ?? 0,
        dueDate: dueDateStr,
        isOverdue: item.is_overdue ?? false,
        daysUntilDue: item.days_until_due ?? 0,
        isSubscription: item.is_subscription ?? false,
        frequency: item.frequency ?? null,
      });
    }

    // Sort: overdue first, then by daysUntilDue ascending
    unified.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return a.daysUntilDue - b.daysUntilDue;
    });

    return unified;
  }, [oneTimeBills, recurringBills]);

  const markPaid = (bill: UnifiedBill) => {
    if (bill.source === 'one_time') {
      return oneTimeMarkPaid.mutateAsync(bill.rawId);
    }
    return recurringMarkPaid.mutateAsync(bill.rawId);
  };

  return {
    bills,
    isLoading: oneTimeLoading || recurringLoading,
    markPaid,
    isPending: oneTimeMarkPaid.isPending || recurringMarkPaid.isPending,
  };
}
