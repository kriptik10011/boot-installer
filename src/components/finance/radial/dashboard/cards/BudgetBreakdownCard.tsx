/**
 * BudgetBreakdownCard — Category-level budget vs actual with spending velocity.
 *
 * Backend returns per-category: name, budgeted, spent, remaining, pct_used, color, rollover.
 * No-Shame palette: amber for over-budget, emerald for healthy.
 */

import { useMemo } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { fmtDashboard, CATEGORY_COLORS, budgetBarColor } from '../../cards/shared/formatUtils';

interface BudgetCategory {
  category_id: number;
  name: string;
  budgeted: number;
  spent: number;
  remaining: number;
  pct_used: number;
  rollover: number;
  color: string | null;
}

interface BudgetBreakdownCardProps {
  categories: BudgetCategory[];
  totalSpent: number;
  totalAllocated: number;
  periodDaysPassed: number;
  periodTotalDays: number;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const fmt = fmtDashboard;
const barColor = budgetBarColor;
const DEFAULT_COLORS = CATEGORY_COLORS;

export function BudgetBreakdownCard({
  categories,
  totalSpent,
  totalAllocated,
  periodDaysPassed,
  periodTotalDays,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: BudgetBreakdownCardProps) {
  // Spending velocity: compare actual pace to expected pace
  const velocity = useMemo(() => {
    if (totalAllocated <= 0 || periodTotalDays <= 0) return 'neutral' as const;
    const expectedPct = (periodDaysPassed / periodTotalDays) * 100;
    const actualPct = (totalSpent / totalAllocated) * 100;
    const diff = actualPct - expectedPct;
    if (diff > 10) return 'ahead' as const;
    if (diff < -10) return 'behind' as const;
    return 'on-pace' as const;
  }, [totalSpent, totalAllocated, periodDaysPassed, periodTotalDays]);

  const velocityLabel = velocity === 'ahead' ? 'Ahead' : velocity === 'behind' ? 'Under' : 'On Pace';
  const velocityColor = velocity === 'ahead' ? '#f59e0b' : velocity === 'behind' ? '#34d399' : '#94a3b8';

  // Sort categories by spent descending
  const sorted = useMemo(
    () => [...categories].sort((a, b) => b.spent - a.spent),
    [categories],
  );

  const hasAnomaly = sorted.some((c) => c.pct_used > 100);

  return (
    <RadialGlassCard
      accentColor="#a78bfa"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      hasAnomaly={hasAnomaly}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-violet-400/70 uppercase tracking-wider">
          Budget Breakdown
        </h2>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            color: velocityColor,
            background: `${velocityColor}1A`,
          }}
        >
          {velocityLabel}
        </span>
      </div>

      {/* Summary line */}
      <div className="flex justify-between text-sm mb-4 text-slate-400">
        <span>
          <span className="text-slate-200 font-medium">{fmt(totalSpent)}</span> / {fmt(totalAllocated)}
        </span>
        <span className="text-xs">
          Day {periodDaysPassed}/{periodTotalDays}
        </span>
      </div>

      {/* Category rows */}
      <div className="space-y-3">
        {sorted.slice(0, 8).map((cat, i) => {
          const pct = Math.min(cat.pct_used, 150); // cap visual at 150%
          const catColor = cat.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];

          return (
            <div key={cat.category_id} className="space-y-1">
              <div className="flex justify-between items-baseline text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: catColor }}
                  />
                  <span className="text-slate-300 truncate max-w-[120px]">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-slate-400">{fmt(cat.spent)}</span>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-500">{fmt(cat.budgeted)}</span>
                </div>
              </div>

              {/* Bullet progress bar */}
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: barColor(cat.pct_used),
                  }}
                />
              </div>

              {/* Rollover indicator */}
              {cat.rollover > 0 && (
                <span className="text-[10px] text-slate-600">
                  +{fmt(cat.rollover)} rollover
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Overflow indicator */}
      {categories.length > 8 && (
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          +{categories.length - 8} more categories
        </p>
      )}
    </RadialGlassCard>
  );
}
