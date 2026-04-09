/**
 * OverviewTab — Finance overview with S2S hero, health gauge, quick stats, upcoming bills.
 *
 * Extracted verbatim from FinancePanel.tsx L182-237.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { HealthScoreGauge } from '@/components/finance/HealthScoreGauge';
import {
  useSafeToSpend,
  useHealthScore,
  useDebtSummary,
  useNetWorthCurrent,
} from '@/hooks/useFinanceV2';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { useCrossFeatureIntelligence } from '@/hooks/useCrossFeatureIntelligence';
import { useBillPredictions } from '@/hooks/usePredictions';
import { BillPredictionCard } from '@/components/finance/BillPredictionCard';
import { getTrustBorderClasses } from '@/utils/trustVisualization';
import { StatCard, SectionTitle, fmt, fmtPct } from './FinanceHelpers';

export function OverviewTab() {
  const { data: safe, isLoading: safeLoading } = useSafeToSpend();
  const { data: health } = useHealthScore();
  const financeIntel = useFinanceIntelligence();
  const upcoming = financeIntel.upcoming7d;
  const { data: debtSum } = useDebtSummary();
  const { data: nw } = useNetWorthCurrent();
  const crossFeature = useCrossFeatureIntelligence();
  const { data: billPredictions } = useBillPredictions(7);

  if (safeLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      {/* Hero: Safe to Spend */}
      <div className="bg-gradient-to-br from-cyan-900/40 to-slate-800 rounded-xl p-4 text-center">
        <div className="text-xs text-slate-400 mb-1">Safe to Spend</div>
        <div className="text-3xl font-bold text-cyan-400">{safe ? fmt(safe.amount) : '$--'}</div>
        {safe && (
          <div className="text-xs text-slate-500 mt-1">
            Income {fmt(safe.total_income)} - Spent {fmt(safe.already_spent)} - Bills {fmt(safe.upcoming_bills)}
          </div>
        )}
      </div>

      {/* Health Score Gauge */}
      {health && (
        <div className="relative bg-slate-700/50 rounded-lg p-3">
          <HealthScoreGauge score={health.total_score} />
          <div className="text-xs text-slate-500 mt-1">
            Savings {fmtPct(health.details?.savings_rate_pct)} | DTI {fmtPct(health.details?.dti_ratio_pct)}
          </div>
        </div>
      )}

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Net Worth" value={nw ? fmt(nw.net_worth) : '$--'} color={nw?.net_worth >= 0 ? 'emerald' : 'red'} />
        <StatCard label="Total Debt" value={debtSum ? fmt(debtSum.total_debt) : '$0'} color={debtSum?.total_debt > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* Upcoming bills */}
      <div>
        <SectionTitle>Bills Due This Week</SectionTitle>
        {upcoming.length > 0 ? (
          <div className="mt-2 space-y-1">
            {upcoming.slice(0, 5).map((bill) => (
              <div key={bill.uid} className="flex justify-between text-sm py-1">
                <span className="text-slate-300">{bill.name}</span>
                <span className={bill.isOverdue ? 'text-amber-400' : 'text-slate-400'}>{fmt(bill.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 mt-1">No bills due this week</div>
        )}
      </div>

      {/* Predicted bills (AI) */}
      {billPredictions?.predictions && billPredictions.predictions.length > 0 && (
        <div>
          <SectionTitle>Predicted Bills</SectionTitle>
          <div className="mt-2 space-y-2">
            {billPredictions.predictions.slice(0, 3).map((pred) => (
              <BillPredictionCard key={pred.recurrence_id} prediction={pred} />
            ))}
          </div>
        </div>
      )}

      {/* Cross-feature insights */}
      {crossFeature.insights.length > 0 && (
        <div>
          <SectionTitle>Insights</SectionTitle>
          <div className="mt-2 space-y-2">
            {crossFeature.insights.slice(0, 3).map((insight) => (
              <div
                key={insight.type}
                className={`p-2.5 rounded-lg bg-slate-700/30 ${getTrustBorderClasses(insight.confidence, 'border-slate-700/50')}`}
              >
                <p className="text-sm text-slate-300">{insight.message}</p>
                <p className="text-xs text-slate-500 mt-0.5">{insight.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
