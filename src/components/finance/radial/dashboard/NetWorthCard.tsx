/**
 * NetWorthCard — Big number + trend delta.
 * Top-right position in F-Pattern layout.
 */

import { RadialGlassCard } from './RadialGlassCard';

interface NetWorthCardProps {
  amount: number;
  deltaPercent: number;
  cardId?: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

export function NetWorthCard({ amount, deltaPercent, cardId, isBlurred, opacity, scale, onFocus }: NetWorthCardProps) {
  const isPositive = deltaPercent >= 0;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

  return (
    <RadialGlassCard
      accentColor="#22d3ee"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      <h2 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider mb-3">Net Worth</h2>
      <p className="text-3xl font-bold text-slate-100 mb-2" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
        {formatted}
      </p>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPositive ? '\u25B2' : '\u25BC'} {Math.abs(deltaPercent).toFixed(1)}%
        </span>
        <span className="text-xs text-slate-500">vs last month</span>
      </div>
    </RadialGlassCard>
  );
}
