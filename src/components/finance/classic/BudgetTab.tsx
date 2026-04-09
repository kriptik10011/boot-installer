/**
 * BudgetTab — Budget categories with spending velocity.
 *
 * Extracted verbatim from FinancePanel.tsx L240-286.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useBudgetStatus, useSpendingVelocity } from '@/hooks/useFinanceV2';
import { useSpendingVelocity as usePredictionVelocity } from '@/hooks/usePredictions';
import { SpendingVelocityAlert } from '@/components/finance/SpendingVelocityAlert';
import { paceRatioToConfidence, getTrustBorderClasses } from '@/utils/trustVisualization';
import { StatCard, SectionTitle, EmptyState, fmt, ProgressBar } from './FinanceHelpers';

export function BudgetTab() {
  const today = new Date().toISOString().split('T')[0];
  const { data: status, isLoading } = useBudgetStatus(today);
  const { data: velocity } = useSpendingVelocity();
  const { data: predVelocity } = usePredictionVelocity();

  // Categories with elevated spending pace for alerts
  const hotCategories = predVelocity?.insights?.filter(
    (v: any) => v.pace_ratio > 1.3
  ) ?? [];

  if (isLoading) return <PanelSkeleton />;
  if (!status) return <EmptyState message="Set up categories to see where your money goes. Every dollar gets a job." />;

  return (
    <div className="space-y-4">
      {/* Budget totals */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Income" value={fmt(status.total_income)} color="emerald" />
        <StatCard label="Spent" value={fmt(status.total_spent)} color="amber" />
        <StatCard label="Available" value={fmt(status.available_to_budget)} color="cyan" />
      </div>

      {/* Category breakdown */}
      <SectionTitle>Categories</SectionTitle>
      <div className="space-y-3">
        {status.categories?.map((cat: any) => {
          const vel = velocity?.find((v: any) => v.category_id === cat.category_id);
          const confidence = vel ? paceRatioToConfidence(vel.pace_ratio) : 0.8;
          const borderClasses = vel ? getTrustBorderClasses(confidence, 'border-slate-700/30') : '';
          return (
            <div key={cat.category_id} className={`space-y-1 p-2 rounded-lg ${borderClasses}`}>
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">{cat.name}</span>
                <span className="text-slate-400">
                  {fmt(cat.spent)} / {fmt(cat.budgeted)}
                </span>
              </div>
              <ProgressBar pct={cat.pct_used} color={cat.pct_used > 100 ? 'red' : cat.pct_used > 80 ? 'amber' : 'cyan'} />
              {vel && (
                <div className="text-xs text-slate-500">
                  {vel.status === 'behind'
                    ? `Spending ${Math.round((vel.pace_ratio - 1) * 100)}% faster than your 4-week average`
                    : vel.status === 'ahead'
                      ? `${Math.round((1 - vel.pace_ratio) * 100)}% below your 4-week average`
                      : 'On track with your usual spending'}
                  {' — '}{vel.days_remaining}d left
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spending velocity alerts for hot categories */}
      {hotCategories.length > 0 && (
        <>
          <SectionTitle>Spending Alerts</SectionTitle>
          <div className="space-y-2">
            {hotCategories.slice(0, 3).map((insight: any) => (
              <SpendingVelocityAlert key={insight.category_id} insight={insight} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
