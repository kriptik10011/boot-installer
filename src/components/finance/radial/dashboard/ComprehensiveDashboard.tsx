/**
 * ComprehensiveDashboard — Professional Bento-grid financial dashboard.
 *
 * F-Pattern reading-order layout:
 * - Row 0 (full-width): IntelligenceSpotlight — top priority insight
 * - Row 1 (hero): HealthPulse (2-col) + NetWorth (1-col)
 * - Row 2: BudgetStatus + SpendingOverview + UpcomingBills
 * - Row 2b (conditional): BudgetBreakdown (full-width)
 * - Row 3: SafeToSpend + CashFlow + RecentTransactions
 * - Row 4: Goals + InvestmentOverview + Subscriptions
 * - Row 4b (conditional): InvestmentHoldings (2-col) + EquityCurve
 * - Row 5: NetWorthTrend (2-col) + IncomeSources
 * - Row 6: DebtJourney (1-col) + AlertsFeed (2-col)
 * - Row 7: MonthlyReport (2-col) + ImportExport
 *
 * Advanced features:
 * - Privacy Blur: auto-blurs on alt-tab, manual toggle with eye icon
 * - Focus Mode: click a card to spotlight it, dimming others
 * - Time Slider: select time range (week/month/quarter/year)
 * - 3D Glass Layering: perspective tilt on card hover
 * - Anomaly Pulse: cards with critical values get a pulsing ring
 * - Intelligence Spotlight: Aurora + Finance intelligence wired
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { FinanceDashboardData } from '@/types/financeDashboard';
import { useFinanceWidgetData } from '@/hooks/useFinanceWidgetData';
import { usePrivacyBlur } from './hooks/usePrivacyBlur';
import { useFocusMode } from './hooks/useFocusMode';
import { HealthPulseCard } from './HealthPulseCard';
import { NetWorthCard } from './NetWorthCard';
import { BudgetStatusCard } from './BudgetStatusCard';
import { SpendingOverviewCard } from './SpendingOverviewCard';
import { GoalsCard } from './cards/GoalsCard';
import { InvestmentOverviewCard } from './InvestmentOverviewCard';
import { AlertsFeedCard } from './AlertsFeedCard';
import { TimeSlider } from './TimeSlider';
import { IntelligenceSpotlightCard } from './IntelligenceSpotlightCard';
import { SafeToSpendCard } from './cards/SafeToSpendCard';
import { CashFlowCard } from './cards/CashFlowCard';
import { RecentTransactionsCard } from './cards/RecentTransactionsCard';
import { SubscriptionCard } from './cards/SubscriptionCard';
import { DebtJourneyCard } from './cards/DebtJourneyCard';
import { BudgetBreakdownCard } from './cards/BudgetBreakdownCard';
import { InvestmentHoldingsCard } from './cards/InvestmentHoldingsCard';
import { EquityCurveCard } from './cards/EquityCurveCard';
import { BillsRadarCard } from './cards/BillsRadarCard';
import { NetWorthTrendCard } from './cards/NetWorthTrendCard';
import { IncomeSourcesCard } from './cards/IncomeSourcesCard';
import { MonthlyReportCard } from './cards/MonthlyReportCard';
import { ImportExportCard } from './cards/ImportExportCard';
import { PropertyDashboard } from '../../../property/PropertyDashboard';
import { useAuroraIntelligence } from '@/hooks/useAuroraIntelligence';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import {
  useSafeToSpend,
  useDebtAccounts,
  useDebtSummary,
  useIncomeVsExpenses,
  useInvestmentSummary,
  useBudgetStatus,
  usePortfolioPerformance,
  usePortfolioAllocation,
} from '@/hooks';
import { KpiRibbon } from '../cards/KpiRibbon';
import { getMonday } from '@/utils/dateUtils';

interface ComprehensiveDashboardProps {
  onBack: () => void;
}

type TimeRange = 'week' | 'month' | 'quarter' | 'year';
type DashboardView = 'finance' | 'property';
type ArcTab = 'all' | 'monitor' | 'analyze' | 'plan' | 'capital';

const ARC_TABS: readonly { id: ArcTab; label: string; color: string; desc: string }[] = [
  { id: 'all', label: 'All', color: '#94a3b8', desc: 'Full dashboard' },
  { id: 'monitor', label: 'Monitor', color: '#22d3ee', desc: 'Health & cash flow' },
  { id: 'analyze', label: 'Analyze', color: '#a78bfa', desc: 'Spending & budget' },
  { id: 'plan', label: 'Plan', color: '#34d399', desc: 'Goals & debt' },
  { id: 'capital', label: 'Capital', color: '#fbbf24', desc: 'Investments & growth' },
];

export function ComprehensiveDashboard({ onBack }: ComprehensiveDashboardProps) {
  const widgetData = useFinanceWidgetData();
  const privacy = usePrivacyBlur();
  const focus = useFocusMode();
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [view, setView] = useState<DashboardView>('finance');
  const [arcTab, setArcTab] = useState<ArcTab>('all');
  const gridRef = useRef<HTMLDivElement>(null);
  const showArc = useCallback((arc: ArcTab) => arcTab === 'all' || arcTab === arc, [arcTab]);

  // Time range configuration for card props
  const timeConfig = useMemo(() => {
    const map: Record<TimeRange, { days: number; months: number }> = {
      week: { days: 7, months: 1 },
      month: { days: 30, months: 3 },
      quarter: { days: 90, months: 6 },
      year: { days: 365, months: 12 },
    };
    return map[timeRange];
  }, [timeRange]);

  // C1-013: KPI drill-down — scroll to relevant card section
  const scrollToCard = useCallback((cardId: string) => {
    const el = gridRef.current?.querySelector(`[data-card-id="${cardId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focus.focusCard(cardId);
  }, [focus]);

  // Intelligence hooks
  const aurora = useAuroraIntelligence();
  const finance = useFinanceIntelligence();

  // Real data hooks (debt, investments, budget — no intelligence equivalent)
  const { data: safeToSpendData } = useSafeToSpend();
  const { data: debtAccountsData } = useDebtAccounts();
  const { data: debtSummaryData } = useDebtSummary();
  const { data: incomeExpensesData } = useIncomeVsExpenses();
  const { data: investmentSummaryData } = useInvestmentSummary();
  const { data: performanceData } = usePortfolioPerformance();
  const { data: allocationData } = usePortfolioAllocation();
  const periodStart = useMemo(() => getMonday(), []);
  const { data: budgetStatusData } = useBudgetStatus(periodStart);

  // Compute days left in month
  const daysLeftInMonth = useMemo(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDay.getDate() - now.getDate();
  }, []);

  // Subscription items from finance intelligence (routes through useUnifiedBills, no extra API call)
  const recurringItems = useMemo(() =>
    finance.all
      .filter(b => b.isSubscription)
      .map(b => ({ id: b.rawId, description: b.name, amount: b.amount, frequency: b.frequency ?? 'monthly', next_due: b.dueDate })),
    [finance.all]);

  // Debt accounts
  const debtAccounts = useMemo(() => {
    const items = Array.isArray(debtAccountsData) ? debtAccountsData : [];
    return items as Array<{ id: number; name: string; current_balance: number; original_balance: number; interest_rate: number; minimum_payment: number }>;
  }, [debtAccountsData]);

  const handleTimeChange = useCallback((range: TimeRange) => {
    setTimeRange(range);
  }, []);

  const safeAmount = safeToSpendData?.amount ?? 0;
  // API returns {months, data: [{total_income, total_expenses, ...}]} — extract current month
  const iveData = ((incomeExpensesData as { data?: Array<{ total_income: number; total_expenses: number }> })?.data ?? []);
  const currentMonthIve = iveData.length > 0 ? iveData[iveData.length - 1] : null;
  const income = currentMonthIve?.total_income ?? 0;
  const expenses = currentMonthIve?.total_expenses ?? 0;
  const totalDebt = (debtSummaryData as { total_balance?: number })?.total_balance ?? 0;
  // Monthly subscription total from finance intelligence (pre-computed in useUnifiedBills)
  const monthlySubTotal = finance.subscriptionSummary.monthly;
  const portfolioValue = (investmentSummaryData as { total_portfolio_value?: number })?.total_portfolio_value ?? 0;

  // Budget breakdown data
  const budgetCategories = useMemo(() => {
    const cats = (budgetStatusData as { categories?: Array<{
      category_id: number; name: string; budgeted: number; spent: number;
      remaining: number; pct_used: number; rollover: number; color: string | null;
    }> })?.categories ?? [];
    return cats;
  }, [budgetStatusData]);
  const totalAllocated = (budgetStatusData as { total_allocated?: number })?.total_allocated ?? widgetData.budget;
  const periodDays = useMemo(() => {
    const start = new Date(periodStart);
    const now = new Date();
    const daysPassed = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));
    return { passed: Math.min(daysPassed, 7), total: 7 };
  }, [periodStart]);

  // Investment performance data
  const perfHoldings = useMemo(() => {
    const h = (performanceData as { holdings?: Array<{
      holding_id: number; name: string; symbol: string | null; asset_class: string;
      quantity: number; cost_basis: number; current_value: number;
      gain_loss: number; gain_loss_pct: number; weight_pct: number;
    }> })?.holdings ?? [];
    return h;
  }, [performanceData]);
  const perfTotalValue = (performanceData as { total_current_value?: number })?.total_current_value ?? portfolioValue;
  const perfTotalGL = (performanceData as { total_gain_loss?: number })?.total_gain_loss ?? 0;
  const perfTotalGLPct = (performanceData as { total_gain_loss_pct?: number })?.total_gain_loss_pct ?? 0;

  // Allocation data
  const allocations = useMemo(() => {
    const a = (allocationData as { allocations?: Array<{
      asset_class: string; current_value: number; current_pct: number;
      target_pct?: number | null; drift_pct?: number | null;
    }> })?.allocations ?? [];
    return a;
  }, [allocationData]);
  const allocTotalValue = (allocationData as { total_value?: number })?.total_value ?? portfolioValue;

  // KPI ribbon metrics — 5 key financial indicators
  const monthlyPnL = income - expenses;
  const kpiMetrics = useMemo(() => {
    const fmt = (n: number) => `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const pnlSign = monthlyPnL >= 0 ? '+' : '-';
    // No-Shame: amber for negative, emerald for positive (never red for financial loss)
    const pnlColor = monthlyPnL >= 0 ? '#34d399' : '#f59e0b';
    return [
      {
        label: 'Net Worth',
        value: widgetData.netWorth < 0 ? `-${fmt(widgetData.netWorth)}` : fmt(widgetData.netWorth),
        delta: widgetData.netWorthDelta !== 0
          ? `${widgetData.netWorthDelta >= 0 ? '+' : ''}${widgetData.netWorthDelta.toFixed(1)}%`
          : undefined,
        onClick: () => scrollToCard('networth-trend'),
      },
      {
        label: 'Monthly P&L',
        value: `${pnlSign}${fmt(monthlyPnL)}`,
        color: pnlColor,
        onClick: () => scrollToCard('report'),
      },
      {
        label: 'Safe to Spend',
        value: fmt(safeAmount),
        delta: `${daysLeftInMonth}d left`,
        onClick: () => scrollToCard('safeToSpend'),
      },
      {
        label: 'Savings Rate',
        value: `${(widgetData.savingsRate ?? 0).toFixed(0)}%`,
        color: (widgetData.savingsRate ?? 0) >= 20 ? '#34d399' : '#f59e0b',
        onClick: () => scrollToCard('goals'),
      },
      {
        label: 'Portfolio',
        value: portfolioValue < 0 ? `-${fmt(portfolioValue)}` : fmt(portfolioValue),
        onClick: () => scrollToCard('holdings'),
      },
    ];
  }, [widgetData.netWorth, widgetData.netWorthDelta, widgetData.savingsRate, monthlyPnL, safeAmount, daysLeftInMonth, portfolioValue, scrollToCard]);

  return (
    <div
      className="w-full h-full overflow-y-auto"
      style={{ background: '#030b1a' }}
      role="region"
      aria-label="Comprehensive financial dashboard"
    >
      {/* Anomaly pulse keyframe animation */}
      <style>{`
        @keyframes anomalyPulse {
          0%, 100% { opacity: 0.3; box-shadow: 0 0 0 0 currentColor; }
          50% { opacity: 0.7; box-shadow: 0 0 12px 2px currentColor; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Close financial dashboard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1
                className="text-2xl font-bold text-slate-100 tracking-wide"
                style={{ fontFamily: "'Space Grotesk', system-ui" }}
              >
                {view === 'finance' ? 'Financial Overview' : 'Property Management'}
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {view === 'finance' ? 'Complete financial health at a glance' : 'Rental portfolio at a glance'}
              </p>
            </div>
            {/* View tabs */}
            <div className="flex gap-1 ml-4">
              <button
                onClick={() => setView('finance')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  view === 'finance'
                    ? 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Finance
              </button>
              <button
                onClick={() => setView('property')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  view === 'property'
                    ? 'text-amber-400 bg-amber-400/10 border border-amber-400/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Property
              </button>
            </div>
          </div>

          {/* Toolbar: Time slider + Privacy toggle + Focus indicator */}
          <div className="flex items-center gap-3">
            <TimeSlider onRangeChange={handleTimeChange} />

            {/* Privacy blur toggle */}
            <button
              onClick={privacy.toggleManualBlur}
              className="p-2 rounded-lg transition-colors"
              style={{
                background: privacy.isBlurred ? 'rgba(251, 113, 133, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                color: privacy.isBlurred ? '#d97706' : '#64748b',
              }}
              aria-label={privacy.isBlurred ? 'Show financial data' : 'Hide financial data'}
              title={privacy.isBlurred ? 'Privacy mode ON' : 'Privacy mode OFF'}
            >
              {privacy.isBlurred ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>

            {/* Focus mode indicator */}
            {focus.isFocusMode && (
              <button
                onClick={focus.unfocus}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 hover:bg-cyan-400/20 transition-colors"
                aria-label="Exit focus mode"
              >
                Exit Focus
              </button>
            )}
          </div>
        </div>

        {view === 'property' ? (
          <PropertyDashboard />
        ) : (
        <>
        {/* KPI ribbon — 5 key financial indicators */}
        <div
          className="mb-6 rounded-xl px-4 py-3"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            filter: privacy.isBlurred ? 'blur(8px)' : undefined,
          }}
        >
          <KpiRibbon metrics={kpiMetrics} />
        </div>

        {/* Arc domain tabs — V5 progressive disclosure navigation */}
        <div className="flex gap-1.5 mb-6">
          {ARC_TABS.map((tab) => {
            const isActive = arcTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setArcTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  isActive ? 'border' : 'text-slate-500 hover:text-slate-300'
                }`}
                style={isActive ? {
                  color: tab.color,
                  backgroundColor: `${tab.color}10`,
                  borderColor: `${tab.color}33`,
                } : undefined}
                title={tab.desc}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Bento grid */}
        <div ref={gridRef} className="grid grid-cols-3 gap-4">
          {/* Row 0: Intelligence Spotlight (full-width) */}
          <IntelligenceSpotlightCard
            aurora={aurora}
            finance={finance}
            cardId="spotlight"
            isBlurred={privacy.isBlurred}
            opacity={focus.getCardOpacity('spotlight')}
            scale={focus.getCardScale('spotlight')}
            onFocus={focus.focusCard}
          />

          {/* Row 1: Hero — Monitor */}
          {showArc('monitor') && (
            <HealthPulseCard
              healthScore={widgetData.healthScore}
              cardId="health"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('health')}
              scale={focus.getCardScale('health')}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('monitor') && (
            <NetWorthCard
              amount={widgetData.netWorth}
              deltaPercent={widgetData.netWorthDelta}
              cardId="netWorth"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('netWorth')}
              scale={focus.getCardScale('netWorth')}
              onFocus={focus.focusCard}
            />
          )}

          {/* Row 2: Analysis (analyze) + Bills (monitor) */}
          {showArc('analyze') && (
            <BudgetStatusCard
              spent={widgetData.spent}
              budget={widgetData.budget}
              categories={widgetData.categories}
              cardId="budget"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('budget')}
              scale={focus.getCardScale('budget')}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('analyze') && (
            <SpendingOverviewCard
              thisMonthSpend={widgetData.thisMonthSpend}
              lastMonthSpend={widgetData.lastMonthSpend}
              categories={widgetData.categories}
              cardId="spending"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('spending')}
              scale={focus.getCardScale('spending')}
              hasAnomaly={widgetData.lastMonthSpend > 0 && widgetData.thisMonthSpend > widgetData.lastMonthSpend * 1.2}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('monitor') && (
            <BillsRadarCard
              cardId="bills"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('bills')}
              scale={focus.getCardScale('bills')}
              onFocus={focus.focusCard}
              timeRangeDays={timeConfig.days}
            />
          )}

          {/* Row 2b: Budget Breakdown (full-width) — Analyze */}
          {showArc('analyze') && budgetCategories.length > 0 && (
            <div className="col-span-3">
              <BudgetBreakdownCard
                categories={budgetCategories}
                totalSpent={widgetData.spent}
                totalAllocated={totalAllocated}
                periodDaysPassed={periodDays.passed}
                periodTotalDays={periodDays.total}
                cardId="budgetBreakdown"
                isBlurred={privacy.isBlurred}
                opacity={focus.getCardOpacity('budgetBreakdown')}
                scale={focus.getCardScale('budgetBreakdown')}
                onFocus={focus.focusCard}
              />
            </div>
          )}

          {/* Row 3: SafeToSpend (analyze) + CashFlow (monitor) + RecentTransactions (monitor) */}
          {showArc('analyze') && (
            <SafeToSpendCard
              safeAmount={safeAmount}
              totalBudget={widgetData.budget}
              daysLeft={daysLeftInMonth}
              upcomingBills={safeToSpendData?.upcoming_bills ?? 0}
              alreadySpent={safeToSpendData?.already_spent ?? 0}
              savingsContributions={safeToSpendData?.savings_contributions ?? 0}
              cardId="safeToSpend"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('safeToSpend')}
              scale={focus.getCardScale('safeToSpend')}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('monitor') && (
            <CashFlowCard
              income={income}
              expenses={expenses}
              cardId="cashFlow"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('cashFlow')}
              scale={focus.getCardScale('cashFlow')}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('monitor') && (
            <RecentTransactionsCard
              cardId="recentTx"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('recentTx')}
              scale={focus.getCardScale('recentTx')}
              onFocus={focus.focusCard}
              timeRangeDays={timeConfig.days}
            />
          )}

          {/* Row 4: Goals (plan) + Investments (capital) + Subscriptions (monitor) */}
          {showArc('plan') && (
            <GoalsCard
              cardId="goals"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('goals')}
              scale={focus.getCardScale('goals')}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('capital') && (
            <InvestmentOverviewCard
              portfolioPoints={widgetData.portfolioPoints}
              totalReturn={widgetData.totalReturn}
              timeframe={widgetData.portfolioTimeframe}
              allocationSegments={widgetData.allocationSegments}
              bestMover={widgetData.bestMover}
              worstMover={widgetData.worstMover}
              cardId="investments"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('investments')}
              scale={focus.getCardScale('investments')}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('monitor') && (
            <SubscriptionCard
              subscriptions={recurringItems}
              monthlyTotal={monthlySubTotal}
              cardId="subscriptions"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('subscriptions')}
              scale={focus.getCardScale('subscriptions')}
              onFocus={focus.focusCard}
            />
          )}

          {/* Row 4b: Investment Detail — Holdings + Allocation (capital) */}
          {showArc('capital') && (perfHoldings.length > 0 || allocations.length > 0) && (
            <>
              <div className="col-span-2">
                <InvestmentHoldingsCard
                  holdings={perfHoldings}
                  totalValue={perfTotalValue}
                  totalGainLoss={perfTotalGL}
                  totalGainLossPct={perfTotalGLPct}
                  cardId="investHoldings"
                  isBlurred={privacy.isBlurred}
                  opacity={focus.getCardOpacity('investHoldings')}
                  scale={focus.getCardScale('investHoldings')}
                  onFocus={focus.focusCard}
                />
              </div>
              <EquityCurveCard
                allocations={allocations}
                totalValue={allocTotalValue}
                totalGainLossPct={perfTotalGLPct}
                cardId="allocation"
                isBlurred={privacy.isBlurred}
                opacity={focus.getCardOpacity('allocation')}
                scale={focus.getCardScale('allocation')}
                onFocus={focus.focusCard}
              />
            </>
          )}

          {/* Row 5: Net Worth Trend (2-col) + Income Sources — Capital */}
          {showArc('capital') && (
            <div className="col-span-2">
              <NetWorthTrendCard
                cardId="networth-trend"
                isBlurred={privacy.isBlurred}
                opacity={focus.getCardOpacity('networth-trend')}
                scale={focus.getCardScale('networth-trend')}
                onFocus={focus.focusCard}
                timeRangeMonths={timeConfig.months}
              />
            </div>
          )}
          {showArc('capital') && (
            <IncomeSourcesCard
              cardId="income"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('income')}
              scale={focus.getCardScale('income')}
              onFocus={focus.focusCard}
            />
          )}

          {/* Row 6: Debt (plan) + Alerts (monitor) */}
          {showArc('plan') && (
            <DebtJourneyCard
              accounts={debtAccounts}
              totalDebt={totalDebt}
              cardId="debt"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('debt')}
              scale={focus.getCardScale('debt')}
              onFocus={focus.focusCard}
            />
          )}
          {showArc('monitor') && (
            <AlertsFeedCard
              alerts={widgetData.alerts}
              runwayMonths={widgetData.runwayMonths}
              runwayTrend={widgetData.runwayTrend}
              cardId="alerts"
              isBlurred={privacy.isBlurred}
              opacity={focus.getCardOpacity('alerts')}
              scale={focus.getCardScale('alerts')}
              onFocus={focus.focusCard}
            />
          )}

          {/* Row 7: Monthly Report (monitor) + Import/Export (always) */}
          {showArc('monitor') && (
            <div className="col-span-2">
              <MonthlyReportCard
                cardId="report"
                isBlurred={privacy.isBlurred}
                opacity={focus.getCardOpacity('report')}
                scale={focus.getCardScale('report')}
                onFocus={focus.focusCard}
                timeRangeMonths={timeConfig.months}
              />
            </div>
          )}
          <ImportExportCard
            cardId="import-export"
            isBlurred={privacy.isBlurred}
            opacity={focus.getCardOpacity('import-export')}
            scale={focus.getCardScale('import-export')}
            onFocus={focus.focusCard}
          />
        </div>
        </>
        )}
      </div>
    </div>
  );
}
