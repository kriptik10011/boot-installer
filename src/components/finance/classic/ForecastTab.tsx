/**
 * ForecastTab — 30-day cash flow forecast with chart.
 *
 * Extracted verbatim from FinancePanel.tsx L567-610.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { CashFlowChart } from '@/components/finance/CashFlowChart';
import { useCashFlowForecast } from '@/hooks/useFinanceV2';
import { useCrossFeatureIntelligence } from '@/hooks/useCrossFeatureIntelligence';
import { getTrustBorderClasses } from '@/utils/trustVisualization';
import { StatCard, SectionTitle, EmptyState, fmt } from './FinanceHelpers';

export function ForecastTab() {
  const { data: forecast, isLoading } = useCashFlowForecast(30);
  const crossFeature = useCrossFeatureIntelligence();
  const spendingAnomalyInsight = crossFeature.insights.find(
    (i) => i.type === 'spending_anomaly' || i.type === 'end_of_month_budget'
  );

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      <SectionTitle>30-Day Cash Flow Forecast</SectionTitle>
      {forecast ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Starting Balance" value={fmt(forecast.start_balance)} />
            <StatCard
              label="Min Balance"
              value={fmt(forecast.min_projected_balance)}
              sublabel={forecast.min_balance_date}
              color={forecast.min_projected_balance < 500 ? 'red' : 'slate'}
            />
          </div>

          {/* Warnings */}
          {forecast.low_balance_warnings?.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
              <div className="text-xs font-medium text-amber-400 mb-1">Low Balance Alerts</div>
              {forecast.low_balance_warnings.slice(0, 3).map((w: any, i: number) => (
                <div key={i} className="text-xs text-amber-300">{w.message}</div>
              ))}
            </div>
          )}

          {/* Cash Flow Chart (River of Time) */}
          {forecast.daily_projections?.length > 0 && (
            <CashFlowChart
              projections={forecast.daily_projections}
              lowBalanceThreshold={500}
            />
          )}
        </>
      ) : (
        <EmptyState message="Add your income and bills to see where your money's headed" />
      )}

      {/* Cross-feature spending anomaly insight */}
      {spendingAnomalyInsight && (
        <div className={`p-3 rounded-lg bg-slate-700/30 ${getTrustBorderClasses(spendingAnomalyInsight.confidence, 'border-amber-500/30')}`}>
          <p className="text-sm text-amber-300">{spendingAnomalyInsight.message}</p>
          <p className="text-xs text-slate-500 mt-0.5">{spendingAnomalyInsight.reasoning}</p>
        </div>
      )}
    </div>
  );
}
