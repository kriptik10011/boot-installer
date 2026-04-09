/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * V2 Finance hooks — Budget, Income, Transactions, Savings, Debt,
 * Net Worth, Recurring, Investments, Reports.
 *
 * Wraps all V2 finance API endpoints with TanStack Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  budgetApi, incomeApi, transactionsApi, savingsApi,
  debtApi, netWorthApi, recurringApi, investmentsApi, reportsApi,
} from '@/api/client';

/** Global staleTime for all finance queries — prevents refetch spam on window focus.
 *  Finance data changes slowly (user actions only). 5 minutes is plenty fresh. */
export const FINANCE_STALE_TIME = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Cache keys
// =============================================================================

export const financeV2Keys = {
  budget: ['budget'] as const,
  budgetStatus: (period: string) => ['budget', 'status', period] as const,
  safeToSpend: ['budget', 'safe-to-spend'] as const,
  budgetCategories: ['budget', 'categories'] as const,

  income: ['income'] as const,
  incomeSources: ['income', 'sources'] as const,
  incomeSummary: (period: string) => ['income', 'summary', period] as const,

  transactions: ['transactions'] as const,
  transactionList: (params?: Record<string, string>) => ['transactions', 'list', params] as const,
  spendingVelocity: ['transactions', 'velocity'] as const,

  savings: ['savings'] as const,
  savingsGoals: ['savings', 'goals'] as const,
  savingsProjections: ['savings', 'projections'] as const,
  emergencyFund: ['savings', 'emergency-fund'] as const,

  debt: ['debt'] as const,
  debtAccounts: ['debt', 'accounts'] as const,
  debtSummary: ['debt', 'summary'] as const,
  payoffPlan: (strategy?: string) => ['debt', 'payoff', strategy] as const,

  netWorth: ['net-worth'] as const,
  netWorthCurrent: ['net-worth', 'current'] as const,
  netWorthTrend: (months?: number) => ['net-worth', 'trend', months] as const,
  netWorthForecast: ['net-worth', 'forecast'] as const,
  assets: ['net-worth', 'assets'] as const,

  recurring: ['recurring'] as const,
  recurringList: ['recurring', 'list'] as const,
  recurringUpcoming: (days?: number) => ['recurring', 'upcoming', days] as const,
  subscriptions: ['recurring', 'subscriptions'] as const,

  investments: ['investments'] as const,
  investmentAccounts: ['investments', 'accounts'] as const,
  investmentSummary: ['investments', 'summary'] as const,
  allocation: ['investments', 'allocation'] as const,
  performance: ['investments', 'performance'] as const,

  reports: ['reports'] as const,
  healthScore: ['reports', 'health-score'] as const,
};

// =============================================================================
// Budget hooks
// =============================================================================

export function useBudgetStatus(periodStart: string) {
  return useQuery({
    queryKey: financeV2Keys.budgetStatus(periodStart),
    queryFn: () => budgetApi.getStatus(periodStart),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useSafeToSpend() {
  return useQuery({
    queryKey: financeV2Keys.safeToSpend,
    queryFn: budgetApi.safeToSpend,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useBudgetCategories(activeOnly = true) {
  return useQuery({
    queryKey: financeV2Keys.budgetCategories,
    queryFn: () => budgetApi.getCategories(activeOnly),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCreateBudgetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: budgetApi.createCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.budget }); },
  });
}

export function useAllocateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: budgetApi.allocate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.budget }); },
  });
}

// =============================================================================
// Income hooks
// =============================================================================

export function useIncomeSources() {
  return useQuery({
    queryKey: financeV2Keys.incomeSources,
    queryFn: incomeApi.getSources,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCreateIncomeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: incomeApi.createSource,
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.income }); },
  });
}

export function useDeleteIncomeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: incomeApi.deleteSource,
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.income }); },
  });
}

export function useIncomeSummary(periodStart: string) {
  return useQuery({
    queryKey: financeV2Keys.incomeSummary(periodStart),
    queryFn: () => incomeApi.getSummary(periodStart),
    staleTime: FINANCE_STALE_TIME,
  });
}

// =============================================================================
// Transaction hooks
// =============================================================================

export function useTransactions(params?: Record<string, string>) {
  return useQuery({
    queryKey: financeV2Keys.transactionList(params),
    queryFn: () => transactionsApi.list(params),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.transactions });
      qc.invalidateQueries({ queryKey: financeV2Keys.budget });
      qc.invalidateQueries({ queryKey: financeV2Keys.reports });
    },
  });
}

export function useSpendingVelocity(periodStart?: string) {
  return useQuery({
    queryKey: financeV2Keys.spendingVelocity,
    queryFn: () => transactionsApi.spendingVelocity(periodStart),
    staleTime: FINANCE_STALE_TIME,
  });
}

// =============================================================================
// Savings hooks
// =============================================================================

export function useSavingsGoals() {
  return useQuery({
    queryKey: financeV2Keys.savingsGoals,
    queryFn: savingsApi.getGoals,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useSavingsProjections() {
  return useQuery({
    queryKey: financeV2Keys.savingsProjections,
    queryFn: savingsApi.getProjections,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useEmergencyFund() {
  return useQuery({
    queryKey: financeV2Keys.emergencyFund,
    queryFn: savingsApi.getEmergencyFund,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savingsApi.createGoal,
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.savings }); },
  });
}

export function useContributeToGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => savingsApi.contribute(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.savings }); },
  });
}

// =============================================================================
// Debt hooks
// =============================================================================

export function useDebtAccounts() {
  return useQuery({
    queryKey: financeV2Keys.debtAccounts,
    queryFn: debtApi.getAccounts,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useDebtSummary() {
  return useQuery({
    queryKey: financeV2Keys.debtSummary,
    queryFn: debtApi.getSummary,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function usePayoffPlan(strategy?: string, extra?: number) {
  return useQuery({
    queryKey: financeV2Keys.payoffPlan(strategy),
    queryFn: () => debtApi.getPayoffPlan(strategy, extra),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCreateDebtAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: debtApi.createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.debt });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}

export function useDeleteDebtAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: debtApi.deleteAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.debt });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}

export function useRecordDebtPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => debtApi.recordPayment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.debt });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}

// =============================================================================
// Net Worth hooks
// =============================================================================

export function useNetWorthCurrent() {
  return useQuery({
    queryKey: financeV2Keys.netWorthCurrent,
    queryFn: netWorthApi.getCurrent,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useNetWorthTrend(months?: number) {
  return useQuery({
    queryKey: financeV2Keys.netWorthTrend(months),
    queryFn: () => netWorthApi.getTrend(months),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCashFlowForecast(days?: number) {
  return useQuery({
    queryKey: financeV2Keys.netWorthForecast,
    queryFn: () => netWorthApi.getForecast(days),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useAssets() {
  return useQuery({
    queryKey: financeV2Keys.assets,
    queryFn: netWorthApi.getAssets,
    staleTime: FINANCE_STALE_TIME,
  });
}

// =============================================================================
// Recurring hooks
// =============================================================================

export function useRecurringList() {
  return useQuery({
    queryKey: financeV2Keys.recurringList,
    queryFn: recurringApi.list,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useUpcomingBills(days?: number) {
  return useQuery({
    queryKey: financeV2Keys.recurringUpcoming(days),
    queryFn: () => recurringApi.upcoming(days),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useSubscriptionSummary() {
  return useQuery({
    queryKey: financeV2Keys.subscriptions,
    queryFn: recurringApi.subscriptionSummary,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recurringApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.recurring }); },
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recurringApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.recurring }); },
  });
}

export function useMarkBillPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => recurringApi.markPaid(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.recurring });
      qc.invalidateQueries({ queryKey: financeV2Keys.budget });
      // Mark-paid creates a Transaction row — refresh transaction list + reports
      qc.invalidateQueries({ queryKey: financeV2Keys.transactions });
      qc.invalidateQueries({ queryKey: financeV2Keys.reports });
    },
  });
}

// =============================================================================
// Investment hooks
// =============================================================================

export function useInvestmentAccounts() {
  return useQuery({
    queryKey: financeV2Keys.investmentAccounts,
    queryFn: () => investmentsApi.getAccounts(),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useInvestmentSummary() {
  return useQuery({
    queryKey: financeV2Keys.investmentSummary,
    queryFn: investmentsApi.getSummary,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useCreateInvestmentHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: investmentsApi.createHolding,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.investments });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}

export function useDeleteInvestmentHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: investmentsApi.deleteHolding,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.investments });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savingsApi.deleteGoal,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.savings });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}

export function usePortfolioAllocation(accountId?: number) {
  return useQuery({
    queryKey: [...financeV2Keys.allocation, accountId],
    queryFn: () => investmentsApi.getAllocation(accountId),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function usePortfolioPerformance(accountId?: number) {
  return useQuery({
    queryKey: [...financeV2Keys.performance, accountId],
    queryFn: () => investmentsApi.getPerformance(accountId),
    staleTime: FINANCE_STALE_TIME,
  });
}

// =============================================================================
// Reports hooks
// =============================================================================

export function useHealthScore() {
  return useQuery({
    queryKey: financeV2Keys.healthScore,
    queryFn: reportsApi.healthScore,
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useIncomeVsExpenses(months?: number) {
  return useQuery({
    queryKey: ['reports', 'income-vs-expenses', months],
    queryFn: () => reportsApi.incomeVsExpenses(months),
    staleTime: FINANCE_STALE_TIME,
  });
}

export function useSavingsRate(months?: number) {
  return useQuery({
    queryKey: ['reports', 'savings-rate', months],
    queryFn: () => reportsApi.savingsRate(months),
    staleTime: FINANCE_STALE_TIME,
  });
}

// =============================================================================
// Missing update/delete mutation hooks (foundation)
// =============================================================================

export function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => recurringApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.recurring }); },
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => transactionsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.transactions });
      qc.invalidateQueries({ queryKey: financeV2Keys.budget });
      qc.invalidateQueries({ queryKey: financeV2Keys.reports });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.transactions });
      qc.invalidateQueries({ queryKey: financeV2Keys.budget });
      qc.invalidateQueries({ queryKey: financeV2Keys.reports });
    },
  });
}

export function useUpdateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => savingsApi.updateGoal(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.savings }); },
  });
}

export function useUpdateDebtAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => debtApi.updateAccount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.debt });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}

export function useUpdateIncomeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => incomeApi.updateSource(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: financeV2Keys.income }); },
  });
}

export function useUpdateInvestmentHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => investmentsApi.updateHolding(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeV2Keys.investments });
      qc.invalidateQueries({ queryKey: financeV2Keys.netWorth });
    },
  });
}
