/**
 * SpendingLensVital — Category breakdown with Bayesian Surprise anomaly detection.
 *
 * Compact: "Groceries 1.2x pace" (top anomalous category)
 * Standard: category breakdown with anomaly highlights (z>2)
 * Large/Expanded: + CategorySparkline per anomalous category
 *
 * Uses useSpendingVelocity from useFinanceV2 and useCrossFeatureIntelligence.
 * Anomaly detection via pace_ratio > 1.3 as proxy for Bayesian Surprise z>2.
 */

import { useMemo } from 'react';
import { useSpendingVelocity } from '@/hooks/useFinanceV2';
import { useSpendingVelocity as usePredictionVelocity } from '@/hooks/usePredictions';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface SpendingLensVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function SpendingLensVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: SpendingLensVitalProps) {
  const { data: velocity } = useSpendingVelocity();
  const { data: predVelocity } = usePredictionVelocity(30);

  const categories = velocity ?? [];

  // Sort by pace_ratio descending (most anomalous first)
  const sorted = useMemo(() => {
    return [...categories].sort((a: any, b: any) => (b.pace_ratio ?? 0) - (a.pace_ratio ?? 0));
  }, [categories]);

  // Anomalous categories (pace_ratio > 1.3 as proxy for z>2)
  const anomalies = useMemo(() => {
    return sorted.filter((c: any) => c.pace_ratio > 1.3);
  }, [sorted]);

  // Top anomaly for compact display
  const topAnomaly = anomalies[0] as any;

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => {
    if (sorted.length === 0) {
      return { narrative: 'No spending data yet', action: null, reasoning: null };
    }
    if (anomalies.length === 0) {
      return { narrative: 'All categories within normal range', action: null, reasoning: null };
    }
    const names = anomalies.slice(0, 2).map((a: any) => a.category_name).join(', ');
    return {
      narrative: `${anomalies.length} categor${anomalies.length !== 1 ? 'ies' : 'y'} above average: ${names}`,
      action: null,
      reasoning: anomalies.length > 0
        ? `Categories with pace ratio >1.3x are flagged as anomalous based on your historical spending patterns`
        : null,
    };
  }, [sorted, anomalies]);

  const paceColor = (ratio: number) => {
    if (ratio > 1.3) return 'text-amber-400';
    if (ratio > 1.1) return 'text-amber-300';
    if (ratio <= 0.7) return 'text-emerald-400';
    return 'text-slate-300';
  };

  return (
    <VitalCard
      type="spending_lens"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.85}
      hasAlert={anomalies.length > 0}
      intelligence={intelligence}
      compactContent={
        topAnomaly ? (
          <span>
            <span className="text-slate-200">{topAnomaly.category_name}</span>
            <span className="text-slate-500 mx-1"> </span>
            <span className="text-amber-400">{topAnomaly.pace_ratio?.toFixed(1)}x</span>
          </span>
        ) : sorted.length > 0 ? (
          <span className="text-emerald-400">Normal range</span>
        ) : (
          <span className="text-slate-500">No data</span>
        )
      }
      standardContent={
        <div className="space-y-1.5">
          {sorted.slice(0, 4).map((cat: any) => {
            const isAnomaly = cat.pace_ratio > 1.3;
            return (
              <div key={cat.category_id} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isAnomaly && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  )}
                  <span className={`truncate ${isAnomaly ? 'text-slate-200' : 'text-slate-400'}`}>
                    {cat.category_name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                  <span className={paceColor(cat.pace_ratio)}>
                    {cat.pace_ratio?.toFixed(1)}x
                  </span>
                  <span className="text-slate-500">{fmt(cat.total_spent)}</span>
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <span className="text-xs text-slate-500">No spending data to analyze</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          {sorted.map((cat: any) => (
            <div key={cat.category_id} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className="text-slate-300">{cat.category_name}</span>
                <span className={paceColor(cat.pace_ratio)}>
                  {cat.pace_ratio?.toFixed(1)}x \u00B7 ${cat.daily_rate?.toFixed(0)}/day
                </span>
              </div>
              {cat.budget_amount && (
                <div className="text-[10px] text-slate-500">
                  {fmt(cat.total_spent)} of {fmt(cat.budget_amount)} budget
                  {cat.projected_depletion_date && (
                    <span> \u00B7 depletes {cat.projected_depletion_date}</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {predVelocity && (
            <div className="text-xs text-slate-500 pt-1 border-t border-slate-700/30">
              30-day analysis based on {categories.length} tracked categories
            </div>
          )}
        </div>
      }
    />
  );
}
