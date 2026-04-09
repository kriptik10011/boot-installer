/**
 * BudgetPulseVital — Per-category budget velocity and status.
 *
 * Compact: "Budget: 72% -- On track"
 * Standard: per-category velocity bars (top 3-4 categories)
 * Large/Expanded: + daily rate per category + sparklines
 *
 * Uses useBudgetStatus, useSpendingVelocity from useFinanceV2.
 * No-Shame: amber not red for over-pace. Velocity label from auroraTheme.
 */

import { useMemo } from 'react';
import { useBudgetStatus, useSpendingVelocity } from '@/hooks/useFinanceV2';
import { getVelocityLabel } from '@/utils/auroraTheme';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface BudgetPulseVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function BudgetPulseVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: BudgetPulseVitalProps) {
  const today = new Date().toISOString().split('T')[0];
  const { data: budgetStatus } = useBudgetStatus(today);
  const { data: velocity } = useSpendingVelocity();

  const totalSpent = budgetStatus?.total_spent ?? 0;
  const totalBudget = budgetStatus?.total_income ?? 1;
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  // Overall pace
  const overallVelocity = velocity?.[0];
  const paceRatio = overallVelocity?.pace_ratio ?? 0.8;
  const velocityLabel = getVelocityLabel(paceRatio);

  // Top categories by spend
  const categories = useMemo(() => {
    const cats = budgetStatus?.categories ?? [];
    return [...cats]
      .sort((a: any, b: any) => (b.spent ?? 0) - (a.spent ?? 0))
      .slice(0, 4);
  }, [budgetStatus]);

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => ({
    narrative: `${pctUsed}% used \u2014 ${velocityLabel}`,
    action: null,
    reasoning: overallVelocity
      ? `Daily rate: $${overallVelocity.daily_rate?.toFixed(0) ?? '--'}/day with ${overallVelocity.days_remaining ?? '--'} days remaining`
      : null,
  }), [pctUsed, velocityLabel, overallVelocity]);

  const paceColor = paceRatio > 1.1 ? 'text-amber-400' : paceRatio <= 0.9 ? 'text-emerald-400' : 'text-slate-300';

  return (
    <VitalCard
      type="budget_pulse"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.9} // Budget data is user-confirmed
      intelligence={intelligence}
      compactContent={
        <span>
          <span className="text-slate-200">{pctUsed}%</span>
          <span className="text-slate-500 mx-1">\u2014</span>
          <span className={paceColor}>{velocityLabel}</span>
        </span>
      }
      standardContent={
        <div className="space-y-1.5">
          {categories.length > 0 ? (
            categories.map((cat: any) => {
              const catPct = cat.budgeted > 0 ? Math.round((cat.spent / cat.budgeted) * 100) : 0;
              const barColor = catPct > 100 ? 'bg-amber-500' : catPct > 85 ? 'bg-amber-400' : 'bg-cyan-500';
              return (
                <div key={cat.category_id ?? cat.name}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-slate-300 truncate">{cat.name}</span>
                    <span className="text-slate-400 flex-shrink-0 ml-1">
                      {fmt(cat.spent)}/{fmt(cat.budgeted)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1">
                    <div
                      className={`${barColor} h-1 rounded-full transition-all`}
                      style={{ width: `${Math.min(100, catPct)}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <span className="text-xs text-slate-500">No budget categories yet</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          {velocity && velocity.length > 0 && (
            <div className="space-y-1">
              {velocity.slice(0, 5).map((v: any) => (
                <div key={v.category_id} className="flex justify-between text-xs">
                  <span className="text-slate-400">{v.category_name}</span>
                  <span className={v.pace_ratio > 1.1 ? 'text-amber-400' : 'text-slate-300'}>
                    ${v.daily_rate?.toFixed(0)}/day \u00B7 {v.pace_ratio?.toFixed(1)}x
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
