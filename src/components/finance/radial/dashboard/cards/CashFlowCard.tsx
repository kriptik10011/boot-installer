/**
 * CashFlowCard — Income vs expenses mini visualization.
 */

import { RadialGlassCard } from '../RadialGlassCard';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface CashFlowCardProps {
  income: number;
  expenses: number;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

export function CashFlowCard({
  income,
  expenses,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: CashFlowCardProps) {
  const net = income - expenses;
  const isPositive = net >= 0;
  const maxVal = Math.max(income, expenses, 1);
  const incomeWidth = Math.round((income / maxVal) * 100);
  const expenseWidth = Math.round((expenses / maxVal) * 100);

  return (
    <RadialGlassCard
      accentColor={isPositive ? '#10b981' : '#d97706'}
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Cash Flow</h3>

      {/* Net amount */}
      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="text-2xl font-bold"
          style={{ color: isPositive ? '#10b981' : '#d97706', fontFamily: "'Space Grotesk', system-ui" }}
        >
          {isPositive ? '+' : '-'}{fmtDashboard(net)}
        </span>
        <span className="text-xs text-slate-500">net</span>
      </div>

      {/* Bars */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-emerald-400/70">Income</span>
            <span className="text-slate-400">{fmtDashboard(income)}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${incomeWidth}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-rose-400/70">Expenses</span>
            <span className="text-slate-400">{fmtDashboard(expenses)}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-rose-500 transition-all duration-500"
              style={{ width: `${expenseWidth}%` }}
            />
          </div>
        </div>
      </div>
    </RadialGlassCard>
  );
}
