/**
 * ReportsTab — Financial health score breakdown.
 *
 * Extracted verbatim from FinancePanel.tsx L529-564.
 */

import { useHealthScore } from '@/hooks/useFinanceV2';
import { SectionTitle, EmptyState, ProgressBar } from './FinanceHelpers';

export function ReportsTab() {
  const { data: health } = useHealthScore();

  return (
    <div className="space-y-4">
      <SectionTitle>Financial Health Score</SectionTitle>
      {health ? (
        <div className="space-y-3">
          <div className="text-center">
            <div className={`text-4xl font-bold ${health.total_score >= 70 ? 'text-emerald-400' : health.total_score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {Math.round(health.total_score)}/100
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Savings Rate (25%)', score: health.savings_rate_score },
              { label: 'Bills On Time (20%)', score: health.bills_on_time_score },
              { label: 'Budget Adherence (20%)', score: health.budget_adherence_score },
              { label: 'Emergency Fund (20%)', score: health.emergency_fund_score },
              { label: 'Debt-to-Income (15%)', score: health.debt_to_income_score },
            ].map(({ label, score }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-300">{Math.round(score)}</span>
                </div>
                <ProgressBar pct={score} color={score >= 70 ? 'emerald' : score >= 40 ? 'amber' : 'red'} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState message="Add financial data to see your health score" />
      )}
    </div>
  );
}
