/**
 * SavingsSprintVital — Savings goal progress with time-to-goal projection.
 *
 * Compact: "Emergency Fund: 67%"
 * Standard: goal progress bars + projected completion date
 * Large/Expanded: + contribution sparkline + goal breakdown
 *
 * Uses useSavingsGoals, useSavingsProjections from useFinanceV2.
 */

import { useMemo } from 'react';
import { useSavingsGoals, useSavingsProjections } from '@/hooks/useFinanceV2';
import { fmt } from '@/components/finance/classic/FinanceHelpers';
import { VitalCard } from './VitalCard';
import type { VitalSize, VitalIntelligenceLayer } from '@/types/vitals';

interface SavingsSprintVitalProps {
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen?: () => void;
  onAction?: () => void;
}

export function SavingsSprintVital({
  size,
  isExpanded,
  onToggleExpand,
  onOpen,
  onAction,
}: SavingsSprintVitalProps) {
  const { data: goals } = useSavingsGoals();
  const { data: projectionsData } = useSavingsProjections();
  // projections is an array; first item may have estimated_completion
  const topProjection = Array.isArray(projectionsData) ? projectionsData[0] as any : projectionsData as any;

  const goalsList = goals ?? [];

  // Top goal for compact display
  const topGoal = goalsList[0] as any;

  // Overall progress
  const { totalSaved, totalTarget, overallPct } = useMemo(() => {
    const saved = goalsList.reduce((s: number, g: any) => s + (g.current_amount ?? 0), 0);
    const target = goalsList.reduce((s: number, g: any) => s + (g.target_amount ?? 0), 0);
    const pct = target > 0 ? Math.round((saved / target) * 100) : 0;
    return { totalSaved: saved, totalTarget: target, overallPct: pct };
  }, [goalsList]);

  // Intelligence layer
  const intelligence = useMemo((): VitalIntelligenceLayer => {
    if (goalsList.length === 0) {
      return { narrative: 'No savings goals set', action: null, reasoning: null };
    }
    const projectionText = topProjection?.estimated_completion
      ? ` \u2014 on track for ${topProjection.estimated_completion}`
      : '';
    return {
      narrative: `${overallPct}% toward ${goalsList.length} goal${goalsList.length !== 1 ? 's' : ''}${projectionText}`,
      action: null,
      reasoning: totalTarget > 0
        ? `${fmt(totalSaved)} of ${fmt(totalTarget)} saved across ${goalsList.length} goal${goalsList.length !== 1 ? 's' : ''}`
        : null,
    };
  }, [goalsList, overallPct, topProjection, totalSaved, totalTarget]);

  const topGoalPct = topGoal && topGoal.target_amount > 0
    ? Math.round((topGoal.current_amount / topGoal.target_amount) * 100)
    : 0;

  return (
    <VitalCard
      type="savings_sprint"
      size={size}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      onOpen={onOpen}
      onAction={onAction}
      confidence={0.9} // User-confirmed data
      intelligence={intelligence}
      compactContent={
        topGoal ? (
          <span>
            <span className="text-slate-200">{topGoal.name}: {topGoalPct}%</span>
          </span>
        ) : (
          <span className="text-slate-500">No goals</span>
        )
      }
      standardContent={
        <div className="space-y-2">
          {goalsList.slice(0, 3).map((goal: any) => {
            const pct = goal.target_amount > 0
              ? Math.round((goal.current_amount / goal.target_amount) * 100)
              : 0;
            const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-cyan-500' : 'bg-cyan-400';
            return (
              <div key={goal.id}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-300 truncate">{goal.name}</span>
                  <span className="text-slate-400 flex-shrink-0 ml-1">{pct}%</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-1">
                  <div
                    className={`${barColor} h-1 rounded-full transition-all`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}

          {goalsList.length === 0 && (
            <span className="text-xs text-slate-500">Set up savings goals to track progress</span>
          )}
        </div>
      }
      expandedContent={
        <div className="space-y-2">
          {goalsList.map((goal: any) => (
            <div key={goal.id} className="flex justify-between text-xs">
              <span className="text-slate-300">{goal.name}</span>
              <span className="text-slate-400">
                {fmt(goal.current_amount)} / {fmt(goal.target_amount)}
              </span>
            </div>
          ))}

          {topProjection && (
            <div className="text-xs text-slate-500 pt-1 border-t border-slate-700/30">
              {topProjection.estimated_completion
                ? `Projected completion: ${topProjection.estimated_completion}`
                : 'Not enough data for projection yet'}
            </div>
          )}
        </div>
      }
    />
  );
}
