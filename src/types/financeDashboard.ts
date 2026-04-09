/**
 * FinanceDashboardData — Finance-only subset of the old WidgetData interface.
 *
 * Used by ComprehensiveDashboard and useFinanceWidgetData. Contains only the
 * ~20 fields that the finance dashboard actually reads. Non-finance fields
 * (week, meals, pantry) are excluded.
 */

export interface FinanceDashboardData {
  healthScore: number;
  netWorth: number;
  netWorthDelta: number;
  alerts: Array<{ id: number; message: string; severity: 'info' | 'warning' | 'urgent' }>;
  thisMonthSpend: number;
  lastMonthSpend: number;
  categories: Array<{ name: string; amount: number; color: string }>;
  subscriptions: number;
  rent: number;
  utilities: number;
  goals: Array<{ name: string; progress: number; color: string }>;
  runwayMonths: number;
  runwayTrend: 'up' | 'down' | 'stable';
  spent: number;
  budget: number;
  portfolioPoints: Array<{ value: number }>;
  totalReturn: number;
  portfolioTimeframe: string;
  allocationSegments: Array<{ name: string; percentage: number; color: string }>;
  bestMover: { name: string; change: number } | null;
  worstMover: { name: string; change: number } | null;
  savingsRate?: number;
  debtToIncome?: number;
  budgetPacePct: number;
  monthElapsedPct: number;
  nearestGoal: { name: string; progress: number; color: string } | null;
  upcomingBills: Array<{ id: number; name: string; amount: number; daysUntil: number }>;
  netWorthDeltaDollars: number;
}
