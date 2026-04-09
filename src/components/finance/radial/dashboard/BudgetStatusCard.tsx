/**
 * BudgetStatusCard — Budget progress bar + category breakdown.
 * Anomaly pulse when budget exceeds 90%.
 */

import { RadialGlassCard } from './RadialGlassCard';

interface BudgetStatusCardProps {
  spent: number;
  budget: number;
  categories: Array<{ name: string; amount: number; color: string }>;
  cardId?: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

export function BudgetStatusCard({
  spent,
  budget,
  categories,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: BudgetStatusCardProps) {
  const remaining = Math.max(0, budget - spent);
  const percentUsed = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const barColor = percentUsed > 90 ? '#d97706' : percentUsed > 70 ? '#f59e0b' : '#a78bfa';
  const hasAnomaly = percentUsed > 90;

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
      <h2 className="text-xs font-medium text-violet-400/70 uppercase tracking-wider mb-3">Budget Status</h2>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-slate-400">Spent</span>
        <span className="text-slate-300 font-medium">${spent.toLocaleString()} / ${budget.toLocaleString()}</span>
      </div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full"
          style={{ width: `${percentUsed}%`, backgroundColor: barColor, transition: 'width 0.5s ease-out' }}
        />
      </div>
      <p className="text-sm text-slate-400 mb-4">
        <span className="text-slate-200 font-medium">${remaining.toLocaleString()}</span> remaining
      </p>
      {categories.length > 0 && (
        <div className="space-y-1.5">
          {categories.slice(0, 4).map((cat) => (
            <div key={cat.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span style={{ color: cat.color }}>{'\u25CF'}</span>
                <span className="text-slate-300">{cat.name}</span>
              </div>
              <span className="text-slate-500">${cat.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </RadialGlassCard>
  );
}
