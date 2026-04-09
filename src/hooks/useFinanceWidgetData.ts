/**
 * useFinanceWidgetData — Finance-only data hook for ComprehensiveDashboard.
 *
 * Returns FinanceDashboardData (not the full WidgetData megaobject).
 * TanStack Query deduplicates calls, so no extra API requests if Radial is also mounted.
 */

import { useMemo } from 'react';
import type { FinanceDashboardData } from '@/types/financeDashboard';
import {
  useHealthScore,
  useNetWorthCurrent,
  useNetWorthTrend,
  useBudgetStatus,
  useSavingsGoals,
  useUnifiedBills,
  useInvestmentSummary,
  usePortfolioPerformance,
  useSubscriptionSummary,
  useIncomeVsExpenses,
} from '@/hooks';
import { getMonday } from '@/utils/dateUtils';
import { CATEGORY_COLORS } from '@/utils/formatters';

export function useFinanceWidgetData(): FinanceDashboardData {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: healthData } = useHealthScore();
  const { data: netWorthData } = useNetWorthCurrent();
  const { data: netWorthTrend } = useNetWorthTrend(2);
  const { data: budgetData } = useBudgetStatus(periodStart);
  const { data: savingsData } = useSavingsGoals();
  const { bills: billsData } = useUnifiedBills({ days: 7 });
  const { data: investmentData } = useInvestmentSummary();
  const { data: performanceData } = usePortfolioPerformance();
  const { data: subsData } = useSubscriptionSummary();
  const { data: incomeVsExpData } = useIncomeVsExpenses(2);

  return useMemo(() => {
    const healthScore = (healthData as { total_score?: number })?.total_score ?? 65;

    const netWorth = netWorthData?.net_worth ?? 0;
    const trendPoints = netWorthTrend ?? [];
    const prevNetWorth = trendPoints.length >= 2
      ? trendPoints[trendPoints.length - 2]?.net_worth ?? 0
      : netWorth;
    const netWorthDelta = prevNetWorth > 0
      ? ((netWorth - prevNetWorth) / prevNetWorth) * 100
      : 0;

    const alerts = billsData
      .filter((b) => b.daysUntilDue <= 3)
      .slice(0, 3)
      .map((b, i) => ({
        id: b.rawId ?? i,
        message: `${b.name} due in ${b.daysUntilDue} day${b.daysUntilDue === 1 ? '' : 's'}`,
        severity: (b.daysUntilDue <= 1 ? 'urgent' : 'warning') as 'urgent' | 'warning',
      }));

    const spent = budgetData?.total_spent ?? 0;
    const budget = budgetData?.total_allocated ?? 0;

    // Last month's expenses from income-vs-expenses report (2-month window)
    // API returns {months, data: [{total_expenses, ...}]} — extract the data array
    const iveEntries = ((incomeVsExpData as { data?: Array<{ total_expenses: number }> })?.data ?? []);
    const lastMonthExpenses = iveEntries.length >= 2 ? iveEntries[0]?.total_expenses ?? 0 : 0;

    const categories = (budgetData?.categories ?? []).slice(0, 6).map(
      (c: { name: string; spent: number }, i: number) => ({
        name: c.name,
        amount: c.spent,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      })
    );

    const subscriptions = subsData?.monthly_total ?? 0;

    const goals = (savingsData ?? []).slice(0, 3).map(
      (g: { name: string; current_amount: number; target_amount: number }, i: number) => ({
        name: g.name,
        progress: g.target_amount > 0 ? g.current_amount / g.target_amount : 0,
        color: ['#a78bfa', '#c084fc', '#818cf8'][i % 3],
      })
    );

    const monthlyExpenses = spent > 0 ? spent : 1;
    const runwayMonths = netWorth > 0 ? netWorth / monthlyExpenses : 0;

    const budgetPacePct = budget > 0 ? (spent / budget) * 100 : 0;
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const monthElapsedPct = (today.getDate() / daysInMonth) * 100;
    const netWorthDeltaDollars = netWorth - prevNetWorth;

    const upcomingBills = billsData
      .slice(0, 4)
      .map((b, i) => ({
        id: b.rawId ?? i,
        name: b.name,
        amount: b.amount ?? 0,
        daysUntil: b.daysUntilDue,
      }));

    const nearestGoal = goals
      .filter((g) => g.progress < 1)
      .sort((a, b) => b.progress - a.progress)[0] ?? null;

    // Performance data comes from /investments/performance, not /investments/summary
    const perfData = performanceData as { total_gain_loss_pct?: number; holdings?: Array<{ current_value: number }> } | undefined;
    const perfHoldings = perfData?.holdings ?? [];
    const portfolioPoints = perfHoldings.length > 0
      ? perfHoldings.map((h: { current_value: number }) => ({ value: h.current_value }))
      : [];
    const totalReturn = perfData?.total_gain_loss_pct ?? 0;
    const allocationSegments = (investmentData?.allocation ?? []).map(
      (a: { asset_class: string; percentage: number }, i: number) => ({
        name: a.asset_class,
        percentage: a.percentage,
        color: ['#f59e0b', '#fbbf24', '#fcd34d', '#d97706', '#b45309'][i % 5],
      })
    );

    const savingsRate = (healthData as Record<string, unknown>)?.details
      ? ((healthData as Record<string, Record<string, number>>).details?.savings_rate_pct ?? 0)
      : 0;
    const debtToIncome = (healthData as Record<string, unknown>)?.details
      ? (((healthData as Record<string, Record<string, number>>).details?.dti_ratio_pct ?? 0) / 100)
      : 0;

    return {
      healthScore,
      netWorth,
      netWorthDelta,
      alerts,
      thisMonthSpend: spent,
      lastMonthSpend: lastMonthExpenses,
      categories,
      subscriptions,
      rent: 0,
      utilities: 0,
      goals,
      runwayMonths,
      runwayTrend: 'stable' as const,
      spent,
      budget,
      portfolioPoints,
      totalReturn,
      portfolioTimeframe: '1Y',
      allocationSegments,
      bestMover: null,
      worstMover: null,
      savingsRate,
      debtToIncome,
      budgetPacePct,
      monthElapsedPct,
      nearestGoal,
      upcomingBills,
      netWorthDeltaDollars,
    };
  }, [healthData, netWorthData, netWorthTrend, budgetData, savingsData, billsData, investmentData, performanceData, subsData, incomeVsExpData]);
}
