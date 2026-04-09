/**
 * SpendingVelocityAlert — Shows spending pace for budget categories.
 *
 * InsightCard variant: category, daily rate, depletion projection.
 */

import { paceRatioToConfidence, getTrustBorderClasses } from '@/utils/trustVisualization';
import type { SpendingVelocityInsight } from '@/api/client';

interface SpendingVelocityAlertProps {
  insight: SpendingVelocityInsight;
}

export function SpendingVelocityAlert({ insight }: SpendingVelocityAlertProps) {
  const isOverPace = insight.pace_ratio > 1.3;
  const isWarning = insight.pace_ratio > 1.0 && insight.pace_ratio <= 1.3;

  const confidence = paceRatioToConfidence(insight.pace_ratio);
  const baseBorderColor = isOverPace
    ? 'border-amber-500/30'
    : isWarning
      ? 'border-amber-500/20'
      : 'border-emerald-500/20';
  const borderColor = getTrustBorderClasses(confidence, baseBorderColor);

  const bgColor = isOverPace
    ? 'bg-amber-500/10'
    : isWarning
      ? 'bg-amber-500/5'
      : 'bg-emerald-500/5';

  const paceColor = isOverPace
    ? 'text-amber-400'
    : isWarning
      ? 'text-amber-300'
      : 'text-emerald-400';

  return (
    <div className={`p-3 rounded-lg ${borderColor} ${bgColor}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-slate-200">{insight.category_name}</p>
        <span className={`text-sm font-mono font-semibold ${paceColor}`}>
          {insight.pace_ratio}x
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>${insight.daily_rate.toFixed(2)}/day</span>
        <span>${insight.total_spent.toFixed(2)} spent</span>
        {insight.budget_amount && (
          <span>of ${insight.budget_amount.toFixed(2)} budget</span>
        )}
      </div>

      {insight.recommendation && (
        <p className="text-xs text-slate-400 mt-2">{insight.recommendation}</p>
      )}

      {insight.projected_depletion_date && (
        <p className="text-[10px] text-slate-600 mt-1">
          Projected depletion: {insight.projected_depletion_date}
        </p>
      )}
    </div>
  );
}
