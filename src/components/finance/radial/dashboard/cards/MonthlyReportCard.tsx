/**
 * MonthlyReportCard — Income vs expenses bars + health score breakdown.
 *
 * Backend IncomeVsExpensesResponse: { data: [{ period_label, total_income, total_expenses, surplus }] }
 * Backend HealthScoreResponse: { total_score, savings_rate_score, bills_on_time_score,
 *   budget_adherence_score, emergency_fund_score, debt_to_income_score }
 */

import { useMemo, useState } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { useIncomeVsExpenses, useHealthScore } from '@/hooks';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface IvEEntry {
  period_label: string;
  total_income: number;
  total_expenses: number;
  surplus: number;
}

interface MonthlyReportCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
  timeRangeMonths?: number;
}

type ViewMode = 'bars' | 'health';

export function MonthlyReportCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
  timeRangeMonths = 6,
}: MonthlyReportCardProps) {
  const [view, setView] = useState<ViewMode>('bars');
  const { data: iveData } = useIncomeVsExpenses(timeRangeMonths);
  const { data: healthData } = useHealthScore();

  const entries = useMemo(() => {
    const raw = iveData as { data?: IvEEntry[] } | null;
    return (raw?.data ?? []).slice(-6);
  }, [iveData]);

  const health = healthData as {
    total_score?: number;
    savings_rate_score?: number;
    bills_on_time_score?: number;
    budget_adherence_score?: number;
    emergency_fund_score?: number;
    debt_to_income_score?: number;
  } | null;

  // Find max for bar scaling
  const maxAmount = useMemo(
    () => Math.max(...entries.flatMap((e) => [e.total_income, e.total_expenses]), 1),
    [entries],
  );

  const healthScore = health?.total_score ?? 0;
  const healthColor = healthScore >= 70 ? '#34d399' : healthScore >= 40 ? '#f59e0b' : '#d97706';

  const healthBreakdown = useMemo(() => {
    if (!health) return [];
    return [
      { label: 'Savings Rate', score: health.savings_rate_score ?? 0 },
      { label: 'Bills On Time', score: health.bills_on_time_score ?? 0 },
      { label: 'Budget Adherence', score: health.budget_adherence_score ?? 0 },
      { label: 'Emergency Fund', score: health.emergency_fund_score ?? 0 },
      { label: 'Debt-to-Income', score: health.debt_to_income_score ?? 0 },
    ];
  }, [health]);

  return (
    <RadialGlassCard
      accentColor="#6366f1"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-indigo-400/70 uppercase tracking-wider">
          Monthly Report
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setView('bars')}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              view === 'bars' ? 'text-indigo-400 bg-indigo-400/10' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            I vs E
          </button>
          <button
            onClick={() => setView('health')}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              view === 'health' ? 'text-indigo-400 bg-indigo-400/10' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            Health
          </button>
        </div>
      </div>

      {view === 'bars' ? (
        /* Income vs Expenses bar chart */
        entries.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No report data</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const incomePct = (entry.total_income / maxAmount) * 100;
              const expensePct = (entry.total_expenses / maxAmount) * 100;
              const isPositive = entry.surplus >= 0;

              return (
                <div key={entry.period_label} className="space-y-1">
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="text-slate-400">{entry.period_label}</span>
                    <span
                      className="text-[10px] font-medium tabular-nums"
                      style={{ color: isPositive ? '#34d399' : '#f59e0b' }}
                    >
                      {isPositive ? '+' : '-'}{fmtDashboard(entry.surplus)}
                    </span>
                  </div>
                  {/* Stacked bars */}
                  <div className="space-y-0.5">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${incomePct}%`, backgroundColor: '#34d399' }}
                      />
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${expensePct}%`, backgroundColor: '#f59e0b' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Legend */}
            <div className="flex gap-4 text-[10px] pt-1">
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-1.5 rounded bg-emerald-400" />
                <span className="text-slate-500">Income</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-1.5 rounded bg-amber-400" />
                <span className="text-slate-500">Expenses</span>
              </div>
            </div>
          </div>
        )
      ) : (
        /* Health score breakdown */
        <div className="space-y-3">
          {/* Overall score */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: healthColor, fontFamily: "'Space Grotesk', system-ui" }}
            >
              {Math.round(healthScore)}
            </div>
            <div className="text-xs text-slate-500">
              <span style={{ color: healthColor }}>
                {healthScore >= 70 ? 'Healthy' : healthScore >= 40 ? 'Fair' : 'Needs Work'}
              </span>
              <span className="ml-1">/ 100</span>
            </div>
          </div>

          {/* Sub-scores */}
          {healthBreakdown.map(({ label, score }) => {
            const barColor = score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#d97706';
            return (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-300 tabular-nums">{Math.round(score)}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, score)}%`, backgroundColor: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </RadialGlassCard>
  );
}
