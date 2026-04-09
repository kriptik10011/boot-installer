/**
 * Finance API — bills, budget, income, transactions, savings, debt,
 * net worth, recurring, investments, reports, predictions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { request, getAuthHeaders, API_BASE_URL } from './core';
import type {
  FinancialItem,
  FinancialItemCreate,
  FinancialItemUpdate,
  FinancialCategory,
} from '@/types';

// =============================================================================
// FINANCIAL IMPORT TYPES
// =============================================================================

export interface FinancialImportItem {
  name: string;
  amount: number | null;
  due_date: string | null;
  type: string;
  is_recurring: boolean;
  frequency: string | null;
  notes: string | null;
  source_row: number;
  confidence: number;
  validation_errors: string[];
  is_valid: boolean;
}

export interface FinancialImportResult {
  items: FinancialImportItem[];
  detected_columns: Record<string, string>;
  unmapped_columns: string[];
  parse_errors: Array<{ row: number; column: string; message: string }>;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
}

export interface FinancialImportConfirmResponse {
  imported_count: number;
  failed_count: number;
  items: FinancialItem[];
}

// =============================================================================
// FINANCES API
// =============================================================================

export const financesApi = {
  list: (type?: string, isPaid?: boolean, categoryId?: number) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (isPaid !== undefined) params.append('is_paid', String(isPaid));
    if (categoryId) params.append('category_id', String(categoryId));
    const queryString = params.toString();
    return request<FinancialItem[]>(`/finances${queryString ? `?${queryString}` : ''}`);
  },
  get: (id: number) => request<FinancialItem>(`/finances/${id}`),
  create: (data: FinancialItemCreate) => request<FinancialItem>('/finances', { method: 'POST', body: data }),
  update: (id: number, data: FinancialItemUpdate) => request<FinancialItem>(`/finances/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) => request<void>(`/finances/${id}`, { method: 'DELETE' }),
  markPaid: (id: number) => request<FinancialItem>(`/finances/${id}/mark-paid`, { method: 'POST' }),
  getOverdue: () => request<FinancialItem[]>('/finances/overdue'),
  getUpcoming: (days: number = 30) => request<FinancialItem[]>(`/finances/upcoming?days=${days}`),
  importUpload: async (file: File): Promise<FinancialImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/finances/import/upload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || 'Upload failed');
    }
    return response.json();
  },
  importConfirm: (items: FinancialImportItem[]) =>
    request<FinancialImportConfirmResponse>('/finances/import/confirm', {
      method: 'POST',
      body: { items },
    }),
};

// =============================================================================
// FINANCIAL CATEGORIES
// =============================================================================

export const financialCategoriesApi = {
  list: () => request<FinancialCategory[]>('/categories/finances'),
  create: (data: { name: string }) =>
    request<FinancialCategory>('/categories/finances', { method: 'POST', body: data }),
};

// =============================================================================
// BUDGET API
// =============================================================================

export interface SafeToSpendResponse {
  amount: number;
  total_income: number;
  upcoming_bills: number;
  budget_allocated: number;
  already_spent: number;
  savings_contributions: number;
  breakdown: Record<string, number>;
}

export const budgetApi = {
  getStatus: (periodStart: string) => request<any>(`/budget/status/${periodStart}`),
  safeToSpend: () => request<SafeToSpendResponse>('/budget/safe-to-spend'),
  getCategories: (activeOnly = true) => request<any[]>(`/budget/categories?active_only=${activeOnly}`),
  createCategory: (data: any) => request<any>('/budget/categories', { method: 'POST', body: data }),
  getCategory: (id: number) => request<any>(`/budget/categories/${id}`),
  updateCategory: (id: number, data: any) => request<any>(`/budget/categories/${id}`, { method: 'PUT', body: data }),
  deleteCategory: (id: number) => request<void>(`/budget/categories/${id}`, { method: 'DELETE' }),
  allocate: (data: any) => request<any>('/budget/allocate', { method: 'POST', body: data }),
  getRollover: (categoryId: number) => request<any>(`/budget/rollover/${categoryId}`),
};

// =============================================================================
// INCOME API
// =============================================================================

export const incomeApi = {
  getSources: () => request<any[]>('/income/sources'),
  createSource: (data: any) => request<any>('/income/sources', { method: 'POST', body: data }),
  getSource: (id: number) => request<any>(`/income/sources/${id}`),
  updateSource: (id: number, data: any) => request<any>(`/income/sources/${id}`, { method: 'PUT', body: data }),
  deleteSource: (id: number) => request<void>(`/income/sources/${id}`, { method: 'DELETE' }),
  getSummary: (periodStart: string) => request<any>(`/income/summary/${periodStart}`),
};

// =============================================================================
// TRANSACTIONS API
// =============================================================================

export const transactionsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/transactions${qs}`);
  },
  get: (id: number) => request<any>(`/transactions/${id}`),
  create: (data: any) => request<any>('/transactions', { method: 'POST', body: data }),
  update: (id: number, data: any) => request<any>(`/transactions/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) => request<void>(`/transactions/${id}`, { method: 'DELETE' }),
  checkDuplicate: (amount: number, merchant: string, date: string) =>
    request<any>(`/transactions/check-duplicate?amount=${amount}&merchant=${encodeURIComponent(merchant)}&date=${date}`),
  suggestCategory: (merchant: string) =>
    request<any>(`/transactions/suggest-category/${encodeURIComponent(merchant)}`),
  spendingVelocity: (periodStart?: string) =>
    request<any[]>(`/transactions/spending-velocity${periodStart ? `?period_start=${periodStart}` : ''}`),
  split: (data: any) => request<any[]>('/transactions/split', { method: 'POST', body: data }),
};

// =============================================================================
// SAVINGS API
// =============================================================================

export const savingsApi = {
  getGoals: () => request<any[]>('/savings/goals'),
  createGoal: (data: any) => request<any>('/savings/goals', { method: 'POST', body: data }),
  getGoal: (id: number) => request<any>(`/savings/goals/${id}`),
  updateGoal: (id: number, data: any) => request<any>(`/savings/goals/${id}`, { method: 'PUT', body: data }),
  deleteGoal: (id: number) => request<void>(`/savings/goals/${id}`, { method: 'DELETE' }),
  contribute: (id: number, data: any) => request<any>(`/savings/goals/${id}/contribute`, { method: 'POST', body: data }),
  getProjections: () => request<any[]>('/savings/projections'),
  getEmergencyFund: () => request<any>('/savings/emergency-fund'),
  getMilestones: () => request<any[]>('/savings/milestones'),
};

// =============================================================================
// DEBT API
// =============================================================================

export const debtApi = {
  getAccounts: () => request<any[]>('/debt/accounts'),
  createAccount: (data: any) => request<any>('/debt/accounts', { method: 'POST', body: data }),
  getAccount: (id: number) => request<any>(`/debt/accounts/${id}`),
  updateAccount: (id: number, data: any) => request<any>(`/debt/accounts/${id}`, { method: 'PUT', body: data }),
  deleteAccount: (id: number) => request<void>(`/debt/accounts/${id}`, { method: 'DELETE' }),
  recordPayment: (id: number, data: any) => request<any>(`/debt/accounts/${id}/payment`, { method: 'POST', body: data }),
  getPayments: (id: number) => request<any[]>(`/debt/accounts/${id}/payments`),
  getPayoffPlan: (strategy?: string, extra?: number) => {
    const params = new URLSearchParams();
    if (strategy) params.set('strategy', strategy);
    if (extra) params.set('extra_monthly', extra.toString());
    return request<any>(`/debt/payoff-plan?${params}`);
  },
  compareStrategies: (extra?: number) =>
    request<any>(`/debt/compare-strategies${extra ? `?extra_monthly=${extra}` : ''}`),
  whatIf: (extra: number, strategy?: string) =>
    request<any>(`/debt/what-if?extra_amount=${extra}${strategy ? `&strategy=${strategy}` : ''}`),
  getSummary: () => request<any>('/debt/summary'),
};

// =============================================================================
// NET WORTH API
// =============================================================================

export const netWorthApi = {
  getCurrent: () => request<any>('/net-worth/current'),
  getTrend: (months?: number) => request<any[]>(`/net-worth/trend${months ? `?months=${months}` : ''}`),
  getMilestones: () => request<any[]>('/net-worth/milestones'),
  createSnapshot: () => request<any>('/net-worth/snapshot', { method: 'POST' }),
  getForecast: (days?: number, threshold?: number) => {
    const params = new URLSearchParams();
    if (days) params.set('days', days.toString());
    if (threshold) params.set('low_balance_threshold', threshold.toString());
    return request<any>(`/net-worth/forecast?${params}`);
  },
  getAssets: () => request<any[]>('/net-worth/assets'),
  createAsset: (data: any) => request<any>('/net-worth/assets', { method: 'POST', body: data }),
  updateAsset: (id: number, data: any) => request<any>(`/net-worth/assets/${id}`, { method: 'PUT', body: data }),
  deleteAsset: (id: number) => request<void>(`/net-worth/assets/${id}`, { method: 'DELETE' }),
  getAssetHistory: (id: number) => request<any[]>(`/net-worth/assets/${id}/history`),
};

// =============================================================================
// RECURRING TRANSACTIONS API
// =============================================================================

export const recurringApi = {
  list: () => request<any[]>('/recurring'),
  create: (data: any) => request<any>('/recurring', { method: 'POST', body: data }),
  get: (id: number) => request<any>(`/recurring/${id}`),
  update: (id: number, data: any) => request<any>(`/recurring/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) => request<void>(`/recurring/${id}`, { method: 'DELETE' }),
  upcoming: (days?: number) => request<any[]>(`/recurring/upcoming${days ? `?days=${days}` : ''}`),
  overdue: () => request<any[]>('/recurring/overdue'),
  subscriptionSummary: () => request<any>('/recurring/subscriptions/summary'),
  markPaid: (id: number) => request<any>(`/recurring/${id}/mark-paid`, { method: 'POST' }),
};

// =============================================================================
// INVESTMENTS API
// =============================================================================

export const investmentsApi = {
  getAccounts: (activeOnly = true) => request<any[]>(`/investments/accounts?active_only=${activeOnly}`),
  createAccount: (data: any) => request<any>('/investments/accounts', { method: 'POST', body: data }),
  getAccount: (id: number) => request<any>(`/investments/accounts/${id}`),
  updateAccount: (id: number, data: any) => request<any>(`/investments/accounts/${id}`, { method: 'PUT', body: data }),
  archiveAccount: (id: number) => request<void>(`/investments/accounts/${id}`, { method: 'DELETE' }),
  getHoldings: (accountId: number) => request<any[]>(`/investments/holdings/${accountId}`),
  createHolding: (data: any) => request<any>('/investments/holdings', { method: 'POST', body: data }),
  getHolding: (id: number) => request<any>(`/investments/holdings/detail/${id}`),
  updateHolding: (id: number, data: any) => request<any>(`/investments/holdings/${id}`, { method: 'PUT', body: data }),
  deleteHolding: (id: number) => request<void>(`/investments/holdings/${id}`, { method: 'DELETE' }),
  getAllocation: (accountId?: number) =>
    request<any>(`/investments/allocation${accountId ? `?account_id=${accountId}` : ''}`),
  getPerformance: (accountId?: number) =>
    request<any>(`/investments/performance${accountId ? `?account_id=${accountId}` : ''}`),
  getTargets: (accountId: number) => request<any[]>(`/investments/allocation/targets/${accountId}`),
  setTarget: (accountId: number, data: any) =>
    request<any>(`/investments/allocation/targets/${accountId}`, { method: 'POST', body: data }),
  deleteTarget: (accountId: number, assetClass: string) =>
    request<void>(`/investments/allocation/targets/${accountId}/${assetClass}`, { method: 'DELETE' }),
  getContributions: (accountId: number) => request<any[]>(`/investments/contributions/${accountId}`),
  recordContribution: (accountId: number, data: any) =>
    request<any>(`/investments/contributions/${accountId}`, { method: 'POST', body: data }),
  rebalancePreview: (accountId: number) =>
    request<any>(`/investments/rebalance/preview?account_id=${accountId}`, { method: 'POST' }),
  getSummary: () => request<any>('/investments/summary'),
};

// =============================================================================
// REPORTS API
// =============================================================================

export const reportsApi = {
  spending: (periodStart: string, periodEnd?: string) =>
    request<any>(`/reports/spending/${periodStart}${periodEnd ? `?period_end=${periodEnd}` : ''}`),
  incomeVsExpenses: (months?: number) =>
    request<any>(`/reports/income-vs-expenses${months ? `?months=${months}` : ''}`),
  categoryTrends: (months?: number) =>
    request<any>(`/reports/category-trends${months ? `?months=${months}` : ''}`),
  merchants: (periodStart: string, periodEnd?: string) =>
    request<any>(`/reports/merchants?period_start=${periodStart}${periodEnd ? `&period_end=${periodEnd}` : ''}`),
  savingsRate: (months?: number) =>
    request<any>(`/reports/savings-rate${months ? `?months=${months}` : ''}`),
  healthScore: () => request<any>('/reports/health-score'),
  monthlyClose: (monthDate: string) => request<any>(`/reports/monthly-close/${monthDate}`),
  yearReview: (year: number) => request<any>(`/reports/year-review/${year}`),
  exportData: (periodStart: string, format?: string) =>
    request<any>(`/reports/export?period_start=${periodStart}${format ? `&format=${format}` : ''}`),
};

// =============================================================================
// PREDICTIONS API
// =============================================================================

export interface DraftMealSuggestion {
  date: string;
  meal_type: string;
  recipe_id: number | null;
  recipe_name: string | null;
  description: string | null;
  confidence: number;
  reason: string;
}

export interface DraftWeekResponse {
  week_start: string;
  suggestions: DraftMealSuggestion[];
  total_suggestions: number;
}

export interface PredictedBill {
  recurrence_id: number;
  description: string;
  predicted_amount: number;
  predicted_date: string;
  confidence: number;
  category: string | null;
  last_3_amounts: number[];
}

export interface SpendingVelocityInsight {
  category_id: number;
  category_name: string;
  daily_rate: number;
  period_days: number;
  total_spent: number;
  budget_amount: number | null;
  projected_total: number | null;
  projected_depletion_date: string | null;
  pace_ratio: number;
  confidence: number;
  recommendation: string;
}

export const predictionsApi = {
  getMealDrafts: (weekStart: string) =>
    request<DraftWeekResponse>(`/predictions/meal-drafts/${weekStart}`),
  applyMealDrafts: (suggestions: DraftMealSuggestion[], overwrite = false) =>
    request<{ created: number; skipped: number; message: string }>('/predictions/meal-drafts/apply', {
      method: 'POST',
      body: { suggestions, overwrite_existing: overwrite },
    }),
  getBillPredictions: (weekStart: string, windowDays = 14) =>
    request<{ predictions: PredictedBill[]; window_days: number }>(
      `/predictions/bill-predictions/${weekStart}?window_days=${windowDays}`
    ),
  applyBillPrediction: (recurrenceId: number, amount: number, date: string) =>
    request<{ transaction_id: number | null; message: string }>('/predictions/bill-predictions/apply', {
      method: 'POST',
      body: { recurrence_id: recurrenceId, amount, date },
    }),
  getSpendingVelocity: (categoryId?: number, days = 30) =>
    request<{ insights: SpendingVelocityInsight[]; period_days: number }>(
      `/predictions/spending-velocity?days=${days}${categoryId ? `&category_id=${categoryId}` : ''}`
    ),
};
