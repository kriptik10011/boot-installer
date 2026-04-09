/**
 * GoalsCard — Savings goals with Apple Watch rings + projection timeline.
 *
 * Self-contained: fetches useSavingsGoals internally.
 * +Add goal, −Delete goal.
 */

import { useMemo, useState, useCallback } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { useSavingsGoals, useCreateSavingsGoal } from '@/hooks';
import { useToastStore } from '@/stores/toastStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { savingsApi } from '@/api/finance';
import { financeV2Keys } from '@/hooks/useFinanceV2';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  monthly_contribution: number;
  progress_pct: number;
  remaining: number;
  color: string | null;
  is_achieved: boolean;
}

interface GoalsCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const GOAL_COLORS = ['#a78bfa', '#34d399', '#3b82f6', '#f59e0b', '#d97706'];

/** Estimate months to reach target at current monthly contribution rate */
function monthsToTarget(remaining: number, monthly: number): number | null {
  if (remaining <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.min(Math.ceil(remaining / monthly), 600);
}

function formatProjection(months: number | null, targetDate: string | null): string {
  if (months === 0) return 'Achieved';
  if (targetDate) {
    const d = new Date(targetDate);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  if (months == null) return 'No contributions';
  if (months >= 600) return '50+ years';
  if (months <= 1) return '< 1 month';
  if (months < 12) return `~${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `~${years}y ${rem}m` : `~${years}y`;
}

export function GoalsCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: GoalsCardProps) {
  const { data: goalsData } = useSavingsGoals();
  const createGoal = useCreateSavingsGoal();
  const addToast = useToastStore((s) => s.addToast);

  const { requestDelete } = useUndoDelete<SavingsGoal>({
    entityLabel: 'goal',
    getItemName: (item) => item.name,
    getItemId: (item) => item.id,
    listQueryKeys: [financeV2Keys.savingsGoals],
    deleteFn: (id) => savingsApi.deleteGoal(id),
    invalidateKeys: [financeV2Keys.savings, financeV2Keys.netWorth],
  });

  const [showAdd, setShowAdd] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalMonthly, setGoalMonthly] = useState('');

  const handleAdd = useCallback(() => {
    const target = Math.min(100_000_000, Math.max(0.01, parseFloat(goalTarget) || 0));
    const monthly = Math.min(target, Math.max(0, parseFloat(goalMonthly) || 0));
    if (!goalName.trim() || target <= 0) return;
    createGoal.mutate(
      {
        name: goalName.trim(),
        target_amount: target,
        monthly_contribution: monthly,
      },
      {
        onSuccess: () => {
          addToast({ message: 'Goal added', type: 'success', durationMs: 4000 });
          setGoalName('');
          setGoalTarget('');
          setGoalMonthly('');
          setShowAdd(false);
        },
        onError: () => {
          addToast({ message: 'Failed to add goal', type: 'error', durationMs: 4000 });
        },
      },
    );
  }, [goalName, goalTarget, goalMonthly, createGoal, addToast]);

  const goals = useMemo(() => {
    const items = (goalsData ?? []) as SavingsGoal[];
    // Active goals first, then by progress descending
    return [...items].sort((a, b) => {
      if (a.is_achieved && !b.is_achieved) return 1;
      if (!a.is_achieved && b.is_achieved) return -1;
      return b.progress_pct - a.progress_pct;
    });
  }, [goalsData]);

  const displayGoals = goals.slice(0, 4);
  const ringGoals = displayGoals.slice(0, 3); // max 3 rings
  const radii = [52, 40, 28];

  const totalSaved = goals.reduce((sum, g) => sum + g.current_amount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.target_amount, 0);

  return (
    <RadialGlassCard
      accentColor="#a78bfa"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-1">
        <h2 className="text-xs font-medium text-violet-400/70 uppercase tracking-wider">
          Savings Goals
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {goals.filter((g) => g.is_achieved).length}/{goals.length} achieved
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-slate-600 hover:text-violet-400 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Goal'}
          </button>
        </div>
      </div>

      {/* Add goal form */}
      {showAdd && (
        <div className="space-y-2 mb-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <input
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
            placeholder="Goal name..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-2">
            <input
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="Target $"
              type="number"
              min={0.01}
              max={100000000}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
            <input
              value={goalMonthly}
              onChange={(e) => setGoalMonthly(e.target.value)}
              placeholder="Monthly $"
              type="number"
              min={0}
              max={100000000}
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!goalName.trim() || !goalTarget || createGoal.isPending}
            className="w-full px-2 py-1 text-xs font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 rounded transition-colors disabled:opacity-50"
          >
            {createGoal.isPending ? 'Adding...' : 'Add Goal'}
          </button>
        </div>
      )}

      {displayGoals.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-sm text-slate-500">
          No goals set yet
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex items-baseline gap-2 mb-4">
            <span
              className="text-lg font-semibold text-slate-100"
              style={{ fontFamily: "'Space Grotesk', system-ui" }}
            >
              {fmtDashboard(totalSaved)}
            </span>
            <span className="text-xs text-slate-500">
              / {fmtDashboard(totalTarget)}
            </span>
          </div>

          {/* Rings + Details */}
          <div className="flex items-center gap-4">
            {/* Apple Watch rings */}
            <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                {ringGoals.map((goal, i) => {
                  const r = radii[i];
                  const circumference = 2 * Math.PI * r;
                  const progress = Math.min(goal.progress_pct / 100, 1);
                  const filled = progress * circumference;
                  const color = goal.color ?? GOAL_COLORS[i % GOAL_COLORS.length];
                  return (
                    <g key={goal.id}>
                      <circle
                        cx="60" cy="60" r={r}
                        fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round"
                      />
                      <circle
                        cx="60" cy="60" r={r}
                        fill="none"
                        stroke={color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference - filled}
                        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Goal details with projection */}
            <div className="flex-1 min-w-0 space-y-2.5">
              {displayGoals.map((goal, i) => {
                const color = goal.color ?? GOAL_COLORS[i % GOAL_COLORS.length];
                const months = monthsToTarget(goal.remaining, goal.monthly_contribution);
                const projection = formatProjection(months, goal.target_date);

                return (
                  <div key={goal.id} className="group">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-slate-300 truncate flex-1">{goal.name}</span>
                      <span className="text-slate-400 font-medium tabular-nums">
                        {Math.round(goal.progress_pct)}%
                      </span>
                      <button
                        onClick={() => requestDelete(goal)}
                        className="p-0.5 rounded text-slate-700 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-all"
                        title="Remove goal"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3.5 text-[10px]">
                      <span className="text-slate-600">{fmtDashboard(goal.current_amount)}/{fmtDashboard(goal.target_amount)}</span>
                      <span className="text-slate-700">·</span>
                      <span className={goal.is_achieved ? 'text-emerald-400' : 'text-slate-500'}>
                        {projection}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overflow */}
          {goals.length > 4 && (
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              +{goals.length - 4} more goals
            </p>
          )}
        </>
      )}
    </RadialGlassCard>
  );
}
