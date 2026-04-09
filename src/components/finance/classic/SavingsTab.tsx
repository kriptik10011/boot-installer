/**
 * SavingsTab — Savings goals with progress.
 *
 * Extracted verbatim from FinancePanel.tsx L356-392.
 */

import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { useSavingsGoals } from '@/hooks/useFinanceV2';
import { SectionTitle, EmptyState, fmt, fmtPct, ProgressBar } from './FinanceHelpers';

export function SavingsTab() {
  const { data: goals, isLoading } = useSavingsGoals();

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      <SectionTitle>Savings Goals</SectionTitle>
      {goals && goals.length > 0 ? (
        <div className="space-y-3">
          {goals.map((goal: any) => {
            const pct = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
            return (
              <div key={goal.id} className="bg-slate-700/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300 font-medium">{goal.name}</span>
                  <span className="text-cyan-400">{fmtPct(pct)}</span>
                </div>
                <ProgressBar pct={pct} color="emerald" />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{fmt(goal.current_amount)} saved</span>
                  <span>Goal: {fmt(goal.target_amount)}</span>
                </div>
                {goal.monthly_contribution > 0 && (
                  <div className="text-xs text-slate-500">
                    Contributing {fmt(goal.monthly_contribution)}/month
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState message="Start with a small goal — even $50/month adds up over time" />
      )}
    </div>
  );
}
