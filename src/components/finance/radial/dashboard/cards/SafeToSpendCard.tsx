/**
 * SafeToSpendCard — Shows remaining budget after bills + recurring expenses.
 */

import { RadialGlassCard } from '../RadialGlassCard';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface SafeToSpendCardProps {
  safeAmount: number;
  totalBudget: number;
  daysLeft: number;
  upcomingBills: number;
  alreadySpent: number;
  savingsContributions: number;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

export function SafeToSpendCard({
  safeAmount,
  totalBudget,
  daysLeft,
  upcomingBills,
  alreadySpent,
  savingsContributions,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: SafeToSpendCardProps) {
  const dailyBudget = daysLeft > 0 ? safeAmount / daysLeft : 0;
  const percentage = totalBudget > 0 ? Math.round((safeAmount / totalBudget) * 100) : 0;
  const color = percentage > 50 ? '#10b981' : percentage > 25 ? '#f59e0b' : '#d97706';

  const breakdownItems = [
    { label: 'Already spent', value: alreadySpent },
    { label: 'Upcoming bills', value: upcomingBills },
    { label: 'Savings', value: savingsContributions },
  ];

  return (
    <RadialGlassCard
      accentColor={color}
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Safe to Spend</h3>
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="text-3xl font-bold"
          style={{ color, fontFamily: "'Space Grotesk', system-ui" }}
        >
          {fmtDashboard(safeAmount)}
        </span>
        <span className="text-xs text-slate-500">left this month</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, percentage)}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 mb-3">
        <span>{fmtDashboard(dailyBudget)}/day</span>
        <span>{daysLeft} days left</span>
      </div>
      <div className="border-t border-slate-700/50 pt-2 space-y-1">
        {breakdownItems.map(({ label, value }) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-400">{fmtDashboard(value)}</span>
          </div>
        ))}
      </div>
    </RadialGlassCard>
  );
}
