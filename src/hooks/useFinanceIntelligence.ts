/**
 * Finance Intelligence Hook (Simplified — Phase A5)
 *
 * Intelligence computation (urgency, messages, budget pace) from backend.
 * Raw bill data, mutations, and subscription summary from useUnifiedBills.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUnifiedBills } from './useUnifiedBills';
import { useBackendReady } from './useBackendReady';
import { intelligenceApi, intelligenceKeys } from '@/api/intelligence';
import { getTodayLocal } from '@/utils/dateUtils';
import type { UnifiedBill } from './useUnifiedBills';

// =============================================================================
// TYPES (preserved for consumer compatibility)
// =============================================================================

export interface BillInsight {
  bill: UnifiedBill;
  source: 'one_time' | 'recurring';
  daysUntilDue: number;
  urgencyLevel: 'ambient' | 'approaching' | 'urgent' | 'overdue';
  message: string;
  reasoning: string;
  shouldShow: boolean;
  escalationLevel: 'ambient' | 'passive' | 'notification';
}

export interface BudgetPaceInsight {
  categoryName: string;
  pctUsed: number;
  budgeted: number;
  spent: number;
  level: 'on_pace' | 'warning' | 'exceeded';
  message: string;
  reasoning: string;
}

function getUrgencyColor(daysUntilDue: number): string {
  if (daysUntilDue < 0) return '#d97706';
  if (daysUntilDue <= 1) return '#d97706';
  if (daysUntilDue <= 5) return '#f59e0b';
  return '#64748b';
}

function getDayLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue`;
  if (daysUntilDue === 0) return 'Today';
  if (daysUntilDue === 1) return 'Tomorrow';
  return `In ${daysUntilDue}d`;
}

export interface ComputedBill extends UnifiedBill {
  urgencyColor: string;
  dayLabel: string;
}

export interface SubscriptionSummary {
  monthly: number;
  annual: number;
  count: number;
}

export interface FinanceIntelligence {
  billInsights: BillInsight[];
  budgetPaceInsights: BudgetPaceInsight[];
  upcomingCount: number;
  overdueCount: number;
  totalUpcoming: number;
  confidence: number;
  isLearning: boolean;
  isLoading: boolean;
  all: ComputedBill[];
  byDate: Record<string, ComputedBill[]>;
  overdue: ComputedBill[];
  upcoming7d: ComputedBill[];
  upcoming14d: ComputedBill[];
  upcoming30d: ComputedBill[];
  recurring: ComputedBill[];
  subscriptionSummary: SubscriptionSummary;
  markPaid: (bill: UnifiedBill) => Promise<unknown>;
  markPaidPending: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

export function useFinanceIntelligence(): FinanceIntelligence {
  const backendReady = useBackendReady();

  // Raw bill data + mutations from useUnifiedBills (merges one-time + recurring)
  const { bills: unifiedBills, isLoading: billsLoading, markPaid, isPending: markPaidPending } = useUnifiedBills({ days: 30 });

  // Intelligence computation from backend
  const { data: intel, isLoading: intelLoading } = useQuery({
    queryKey: intelligenceKeys.finance(),
    queryFn: () => intelligenceApi.getFinance(),
    staleTime: 60_000,
    enabled: backendReady,
  });

  const isLoading = billsLoading || intelLoading;

  // Compute display fields on unified bills (urgencyColor, dayLabel)
  const all = useMemo((): ComputedBill[] =>
    unifiedBills.map((b) => ({
      ...b,
      urgencyColor: getUrgencyColor(b.daysUntilDue),
      dayLabel: getDayLabel(b.daysUntilDue),
    })),
    [unifiedBills]
  );

  const byDate = useMemo(() => {
    const index: Record<string, ComputedBill[]> = {};
    for (const b of all) {
      const key = b.dueDate;
      if (!index[key]) index[key] = [];
      index[key].push(b);
    }
    return index;
  }, [all]);

  const overdue = useMemo(() => all.filter((b) => b.isOverdue), [all]);
  const upcoming7d = useMemo(() => all.filter((b) => b.daysUntilDue >= 0 && b.daysUntilDue <= 7), [all]);
  const upcoming14d = useMemo(() => all.filter((b) => b.daysUntilDue >= 0 && b.daysUntilDue <= 14), [all]);
  const upcoming30d = useMemo(() => all.filter((b) => b.daysUntilDue >= 0 && b.daysUntilDue <= 30), [all]);
  const recurring = useMemo(() => all.filter((b) => b.source === 'recurring'), [all]);

  const subscriptionSummary = useMemo((): SubscriptionSummary => {
    const subs = unifiedBills.filter((b) => b.isSubscription);
    let monthly = 0;
    let annual = 0;
    for (const s of subs) {
      if (s.frequency === 'yearly' || s.frequency === 'annual') {
        annual += s.amount;
        monthly += s.amount / 12;
      } else {
        monthly += s.amount;
        annual += s.amount * 12;
      }
    }
    return { monthly, annual, count: subs.length };
  }, [unifiedBills]);

  // Bill insights from backend intelligence
  const billInsights = useMemo((): BillInsight[] => {
    if (!intel?.billInsights) return [];
    // Map backend insights to frontend format with full bill objects from useUnifiedBills
    const billMap = new Map(unifiedBills.map((b) => [b.uid, b]));
    return (intel.billInsights as Array<Record<string, unknown>>)
      .map((bi) => {
        const backendBill = bi.bill as Record<string, unknown>;
        const uid = backendBill?.uid as string;
        const bill = billMap.get(uid) ?? (backendBill as unknown as UnifiedBill);
        return {
          bill,
          source: bi.source as 'one_time' | 'recurring',
          daysUntilDue: bi.daysUntilDue as number,
          urgencyLevel: bi.urgencyLevel as BillInsight['urgencyLevel'],
          message: bi.message as string,
          reasoning: bi.reasoning as string,
          shouldShow: bi.shouldShow as boolean,
          escalationLevel: bi.escalationLevel as BillInsight['escalationLevel'],
        };
      });
  }, [intel, unifiedBills]);

  const budgetPaceInsights = (intel?.budgetPaceInsights as BudgetPaceInsight[]) ?? [];

  return {
    billInsights,
    budgetPaceInsights,
    upcomingCount: upcoming7d.length,
    overdueCount: overdue.length,
    totalUpcoming: upcoming7d.reduce((sum, b) => sum + b.amount, 0),
    confidence: (intel?.confidence as number) ?? 0.5,
    isLearning: (intel?.isLearning as boolean) ?? true,
    isLoading,
    all,
    byDate,
    overdue,
    upcoming7d,
    upcoming14d,
    upcoming30d,
    recurring,
    subscriptionSummary,
    markPaid,
    markPaidPending,
  };
}
