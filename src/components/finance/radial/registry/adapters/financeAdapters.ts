/**
 * Finance domain adapter hooks (South arc).
 * Needs Date.now() for month progress calculation.
 */

import { useMemo } from 'react';
import {
  useHealthScore,
  useBudgetStatus,
  useSavingsGoals,
  useNetWorthCurrent,
  useDebtAccounts,
  useInvestmentSummary,
  useInvestmentAccounts,
} from '@/hooks';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { getMonday } from '@/utils/dateUtils';
import { fmtCurrency, fmtPct, CATEGORY_COLORS } from '../../cards/shared/formatUtils';
import {
  healthColor,
  healthLabel,
  paceColor,
  paceLabel,
  getMonthElapsedPct,
} from './sharedThresholds';
import type {
  HeroMetricShapeProps,
  PillListShapeProps,
  ProgressBarShapeProps,
} from '../types';

// ── finance-health-score ──

export function useFinanceHealthScoreAdapter(): HeroMetricShapeProps {
  const { data: healthData } = useHealthScore();
  const score = (healthData as { overall_score?: number })?.overall_score ?? 65;
  return {
    value: score,
    label: healthLabel(score),
    sublabel: 'financial health',
    color: healthColor(score),
  };
}

// ── finance-upcoming-bills ──

export function useFinanceUpcomingBillsAdapter(): PillListShapeProps {
  const { upcoming7d } = useFinanceIntelligence();
  const items = upcoming7d.slice(0, 3).map((b) => ({
    label: b.name,
    badge: b.dayLabel,
    dotColor: b.urgencyColor,
  }));

  return {
    items,
    header: 'Bills',
    headerColor: '#a78bfa',
    emptyMessage: 'No bills due',
    maxItems: 3,
  };
}

// ── budget-pace ──

export function useBudgetPaceAdapter(): ProgressBarShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: budgetData } = useBudgetStatus(periodStart);
  const spent = budgetData?.total_spent ?? 0;
  const budget = budgetData?.total_allocated ?? 0;
  const pacePct = budget > 0 ? (spent / budget) * 100 : 0;
  const monthPct = getMonthElapsedPct();

  return {
    progress: pacePct / 100,
    label: paceLabel(pacePct, monthPct),
    sublabel: `$${Math.round(spent).toLocaleString()} of $${Math.round(budget).toLocaleString()}`,
    color: paceColor(pacePct, monthPct),
  };
}

// ── nearest-goal ──

export function useNearestGoalAdapter(): ProgressBarShapeProps {
  const { data: savingsData } = useSavingsGoals();
  const goals = (savingsData ?? [])
    .map((g: { name: string; current_amount: number; target_amount: number }, i: number) => ({
      name: g.name,
      progress: g.target_amount > 0 ? g.current_amount / g.target_amount : 0,
      color: ['#a78bfa', '#c084fc', '#818cf8'][i % 3],
    }));

  const nearest = goals
    .filter((g) => g.progress < 1)
    .sort((a, b) => b.progress - a.progress)[0];

  return {
    progress: nearest?.progress ?? 0,
    label: nearest?.name ?? 'No goals',
    color: nearest?.color ?? '#a78bfa',
    showPct: true,
  };
}

// ── safe-to-spend ──

export function useSafeToSpendAdapter(): HeroMetricShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: budgetData } = useBudgetStatus(periodStart);
  const spent = budgetData?.total_spent ?? 0;
  const budget = budgetData?.total_allocated ?? 0;
  const safeToSpend = Math.max(0, budget - spent);

  return {
    value: `$${Math.round(safeToSpend).toLocaleString()}`,
    label: 'Safe to Spend',
    sublabel: 'remaining budget',
    color: safeToSpend > budget * 0.3 ? '#22c55e' : '#f59e0b',
  };
}

// ── net-worth ──

export function useNetWorthAdapter(): HeroMetricShapeProps {
  const { data: netWorthData } = useNetWorthCurrent();
  const netWorth = (netWorthData as { net_worth?: number })?.net_worth ?? 0;

  return {
    value: `$${Math.round(netWorth).toLocaleString()}`,
    label: 'Net Worth',
    color: netWorth >= 0 ? '#22c55e' : '#f97316',
  };
}

// ── spending-velocity ──

export function useSpendingVelocityAdapter(): ProgressBarShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: budgetData } = useBudgetStatus(periodStart);
  const spent = budgetData?.total_spent ?? 0;
  const budget = budgetData?.total_allocated ?? 1;
  const monthPct = getMonthElapsedPct();
  const expectedSpend = (monthPct / 100) * budget;
  const velocity = expectedSpend > 0 ? spent / expectedSpend : 0;

  return {
    progress: Math.min(1, velocity),
    label: 'Spending Rate',
    sublabel: velocity > 1.1 ? 'Above expected' : velocity < 0.9 ? 'Below expected' : 'On track',
    color: velocity > 1.1 ? '#f97316' : velocity < 0.9 ? '#22c55e' : '#f59e0b',
  };
}

// ── emergency-fund ──

export function useEmergencyFundAdapter(): HeroMetricShapeProps {
  const { data: savingsData } = useSavingsGoals();
  const emergencyGoal = (savingsData ?? []).find(
    (g: { name: string }) => g.name.toLowerCase().includes('emergency')
  ) as { current_amount: number; target_amount: number } | undefined;

  const progress = emergencyGoal
    ? (emergencyGoal.target_amount > 0
      ? emergencyGoal.current_amount / emergencyGoal.target_amount
      : 0)
    : 0;

  return {
    value: `${Math.round(progress * 100)}%`,
    label: 'Emergency Fund',
    color: progress >= 1 ? '#22c55e' : progress >= 0.5 ? '#f59e0b' : '#f97316',
  };
}

// ── savings-rate ──

export function useSavingsRateAdapter(): ProgressBarShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: budgetData } = useBudgetStatus(periodStart);
  const spent = budgetData?.total_spent ?? 0;
  const budget = budgetData?.total_allocated ?? 1;
  const savingsRate = Math.max(0, (budget - spent) / budget);

  return {
    progress: savingsRate,
    label: 'Savings Rate',
    sublabel: `${Math.round(savingsRate * 100)}% of budget saved`,
    color: savingsRate >= 0.2 ? '#22c55e' : savingsRate >= 0.1 ? '#f59e0b' : '#f97316',
    showPct: true,
  };
}

// ── subscription-total ──

export function useSubscriptionTotalAdapter(): HeroMetricShapeProps {
  const { subscriptionSummary } = useFinanceIntelligence();

  return {
    value: `$${Math.round(subscriptionSummary.monthly).toLocaleString()}`,
    label: 'Subscriptions',
    sublabel: `${subscriptionSummary.count} active`,
    color: '#a78bfa',
  };
}

// ── debt-summary ──

export function useDebtSummaryAdapter(): HeroMetricShapeProps {
  // Debt data from net worth — simplified view
  const { data: netWorthData } = useNetWorthCurrent();
  const liabilities = (netWorthData as { total_liabilities?: number })?.total_liabilities ?? 0;

  return {
    value: liabilities > 0 ? `$${Math.round(liabilities).toLocaleString()}` : '$0',
    label: 'Total Debt',
    color: liabilities > 0 ? '#f97316' : '#22c55e',
  };
}

// ── Sub-arc card adapters ────────────────────────────────────────────────────

// ── budget-hero (BudgetCard hero) ──

export function useBudgetHeroAdapter(): HeroMetricShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: budgetData } = useBudgetStatus(periodStart);
  const spent = budgetData?.total_spent ?? 0;
  const budget = budgetData?.total_allocated ?? 0;
  const monthPct = getMonthElapsedPct();
  const pacePct = budget > 0 ? (spent / budget) * 100 : 0;

  return {
    value: fmtCurrency(spent),
    label: paceLabel(pacePct, monthPct),
    sublabel: `of ${fmtCurrency(budget)} budget`,
    color: paceColor(pacePct, monthPct),
  };
}

// ── budget-categories (BudgetCard pill zone) ──

export function useBudgetCategoriesAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { data: budgetData } = useBudgetStatus(periodStart);
  const categories: Array<{ name: string; allocated: number; spent: number }> =
    budgetData?.categories ?? [];

  const items = categories.slice(0, 5).map((cat, i) => {
    const pctUsed = cat.allocated > 0 ? Math.round((cat.spent / cat.allocated) * 100) : 0;
    return {
      label: cat.name,
      badge: `${pctUsed}%`,
      dotColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    };
  });

  return {
    items,
    header: 'Categories',
    headerColor: '#a78bfa',
    emptyMessage: 'No categories',
    maxItems: 5,
  };
}

// ── top-goals (GoalsCard pill zone) ──

export function useTopGoalsAdapter(): PillListShapeProps {
  const { data: savingsData } = useSavingsGoals();
  const goals: Array<{ name: string; current_amount?: number; target_amount?: number }> =
    savingsData ?? [];

  const items = goals.slice(0, 3).map((g, i) => {
    const target = g.target_amount ?? 0;
    const current = g.current_amount ?? 0;
    const progress = target > 0 ? Math.round((current / target) * 100) : 0;
    return {
      label: g.name,
      badge: `${progress}%`,
      dotColor: ['#a78bfa', '#c084fc', '#818cf8'][i % 3],
    };
  });

  return {
    items,
    header: 'Goals',
    headerColor: '#a78bfa',
    emptyMessage: 'No goals set',
    maxItems: 3,
  };
}

// ── debt-accounts (GoalsCard pill zone — debt section) ──

export function useDebtAccountsAdapter(): PillListShapeProps {
  const { data: debtData } = useDebtAccounts();
  const debts: Array<{ name: string; balance?: number; interest_rate?: number }> =
    debtData ?? [];

  const items = debts.slice(0, 3).map((d) => ({
    label: d.name,
    badge: fmtCurrency(d.balance ?? 0),
    dotColor: '#f97316',
  }));

  return {
    items,
    header: 'Debt',
    headerColor: '#f97316',
    emptyMessage: 'No debt',
    maxItems: 3,
  };
}

// ── portfolio-value (CapitalCard hero) ──

export function usePortfolioValueAdapter(): HeroMetricShapeProps {
  const { data: summary } = useInvestmentSummary();
  const totalValue = Number((summary as Record<string, unknown>)?.total_portfolio_value) || 0;
  const totalReturn = Number((summary as Record<string, unknown>)?.total_gain_loss_pct) || 0;

  return {
    value: fmtCurrency(totalValue),
    label: 'PORTFOLIO',
    sublabel: `YTD ${fmtPct(totalReturn)}`,
    color: totalReturn >= 0 ? '#22c55e' : '#f97316',
  };
}

// ── investment-accounts (CapitalCard pill zone) ──

export function useInvestmentAccountsAdapter(): PillListShapeProps {
  const { data: accounts } = useInvestmentAccounts();
  const accountList: Array<{ name: string; type?: string; total_value?: number }> =
    accounts ?? [];

  const items = accountList.slice(0, 4).map((a) => ({
    label: a.name,
    badge: fmtCurrency(a.total_value ?? 0),
    dotColor: '#a78bfa',
  }));

  return {
    items,
    header: 'Accounts',
    headerColor: '#a78bfa',
    emptyMessage: 'No accounts',
    maxItems: 4,
  };
}
