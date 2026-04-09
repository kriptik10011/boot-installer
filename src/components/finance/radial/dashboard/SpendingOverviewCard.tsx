/**
 * SpendingOverviewCard — Monthly delta bars + category proportional bubbles.
 * Enhanced with ghost projection trend line.
 */

import { RadialGlassCard } from './RadialGlassCard';

interface SpendingOverviewCardProps {
  thisMonthSpend: number;
  lastMonthSpend: number;
  categories: Array<{ name: string; amount: number; color: string }>;
  cardId?: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  hasAnomaly?: boolean;
  onFocus?: (cardId: string) => void;
}

export function SpendingOverviewCard({
  thisMonthSpend,
  lastMonthSpend,
  categories,
  cardId,
  isBlurred,
  opacity,
  scale,
  hasAnomaly,
  onFocus,
}: SpendingOverviewCardProps) {
  const maxVal = Math.max(thisMonthSpend, lastMonthSpend, 1);
  const isNewSpending = lastMonthSpend === 0 && thisMonthSpend > 0;
  const delta = lastMonthSpend > 0 ? ((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100 : 0;
  const isLess = delta < 0;
  const maxAmount = Math.max(...categories.map((c) => c.amount), 1);

  // Ghost projection: estimate next month based on trend
  const projectedSpend = thisMonthSpend + (thisMonthSpend - lastMonthSpend);
  const projectedMax = Math.max(maxVal, projectedSpend);

  return (
    <RadialGlassCard
      accentColor="#3b82f6"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      hasAnomaly={hasAnomaly}
      onFocus={onFocus}
    >
      <h2 className="text-xs font-medium text-blue-400/70 uppercase tracking-wider mb-3">Spending Overview</h2>

      {/* Delta bars */}
      <div className="space-y-2 mb-4">
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>This month</span>
            <span>${thisMonthSpend.toLocaleString()}</span>
          </div>
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${(thisMonthSpend / maxVal) * 100}%`, transition: 'width 0.5s ease-out' }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Last month</span>
            <span>${lastMonthSpend.toLocaleString()}</span>
          </div>
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-slate-500"
              style={{ width: `${(lastMonthSpend / maxVal) * 100}%`, transition: 'width 0.5s ease-out' }}
            />
          </div>
        </div>
        {/* Ghost projection bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t border-dashed border-blue-400/40" />
              Projected
            </span>
            <span className="text-blue-400/40">${Math.max(0, Math.round(projectedSpend)).toLocaleString()}</span>
          </div>
          <div className="h-2.5 bg-slate-700/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(Math.max(0, projectedSpend) / projectedMax) * 100}%`,
                background: 'repeating-linear-gradient(90deg, rgba(59,130,246,0.3) 0px, rgba(59,130,246,0.3) 4px, transparent 4px, transparent 7px)',
                transition: 'width 0.5s ease-out',
              }}
            />
          </div>
        </div>
        <p className={`text-xs mt-1 ${isNewSpending ? 'text-slate-400' : isLess ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isNewSpending
            ? 'New — no prior month data'
            : `${Math.abs(delta).toFixed(0)}% ${isLess ? 'less' : 'more'} than last month`
          }
        </p>
      </div>

      {/* Category bubbles */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center pt-2 border-t border-slate-700/50">
          {categories.slice(0, 6).map((cat) => {
            const size = 24 + (cat.amount / maxAmount) * 28;
            return (
              <div
                key={cat.name}
                className="rounded-full flex items-center justify-center text-[10px] font-medium"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: `${cat.color}33`,
                  color: cat.color,
                  border: `1px solid ${cat.color}4D`,
                }}
                title={`${cat.name}: $${cat.amount.toLocaleString()}`}
              >
                {size > 36 ? cat.name.slice(0, 3) : ''}
              </div>
            );
          })}
        </div>
      )}
    </RadialGlassCard>
  );
}
