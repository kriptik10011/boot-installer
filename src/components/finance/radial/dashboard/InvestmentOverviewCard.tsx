/**
 * InvestmentOverviewCard — Portfolio sparkline + allocation donut + top movers.
 * Enhanced with ghost projection trend line on sparkline.
 */

import { RadialGlassCard } from './RadialGlassCard';
import { GhostProjection } from './GhostProjection';

interface InvestmentOverviewCardProps {
  portfolioPoints: Array<{ value: number }>;
  totalReturn: number;
  timeframe: string;
  allocationSegments: Array<{ name: string; percentage: number; color: string }>;
  bestMover: { name: string; change: number } | null;
  worstMover: { name: string; change: number } | null;
  cardId?: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  hasAnomaly?: boolean;
  onFocus?: (cardId: string) => void;
}

export function InvestmentOverviewCard({
  portfolioPoints,
  totalReturn,
  timeframe,
  allocationSegments,
  bestMover,
  worstMover,
  cardId,
  isBlurred,
  opacity,
  scale,
  hasAnomaly,
  onFocus,
}: InvestmentOverviewCardProps) {
  const isPositive = totalReturn >= 0;
  const values = portfolioPoints.map((p) => p.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const range = max - min || 1;
  const chartWidth = 200;
  const chartHeight = 48;
  const lineColor = isPositive ? '#34d399' : '#d97706';

  const pathData = values.length > 1
    ? values.map((v, i) => {
        const x = (i / (values.length - 1)) * chartWidth;
        const y = chartHeight - ((v - min) / range) * chartHeight;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ')
    : '';

  // Allocation donut
  const donutR = 32;
  const donutC = 2 * Math.PI * donutR;
  let accum = 0;

  return (
    <RadialGlassCard
      accentColor="#f59e0b"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      hasAnomaly={hasAnomaly}
      onFocus={onFocus}
    >
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-amber-400/70 uppercase tracking-wider">Investments</h2>
        <span className="text-xs text-slate-500">{timeframe}</span>
      </div>

      {/* Sparkline with ghost projection */}
      {values.length > 1 ? (
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full mb-3" style={{ height: 48 }}>
          {/* Actual data line */}
          <path d={pathData} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
          {/* Ghost projection */}
          <GhostProjection
            values={values}
            width={chartWidth}
            height={chartHeight}
            min={min}
            max={max}
            color={lineColor}
            projectionPoints={3}
          />
        </svg>
      ) : (
        <div className="h-12 flex items-center justify-center text-sm text-slate-500 mb-3">No data yet</div>
      )}

      <div className="flex items-center gap-1.5 mb-4">
        <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPositive ? '+' : ''}{totalReturn.toFixed(1)}%
        </span>
        <span className="text-xs text-slate-500">total return</span>
      </div>

      {/* Allocation + Movers side by side */}
      <div className="flex items-start gap-4 pt-3 border-t border-slate-700/50">
        {/* Mini donut */}
        {allocationSegments.length > 0 && (
          <div className="flex-shrink-0" style={{ width: 72, height: 72 }}>
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              {allocationSegments.map((seg) => {
                const dashLen = (seg.percentage / 100) * donutC;
                const offset = accum;
                accum += dashLen;
                return (
                  <circle
                    key={seg.name}
                    cx="40" cy="40" r={donutR}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="10"
                    strokeDasharray={`${dashLen} ${donutC - dashLen}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* Top movers */}
        <div className="flex-1 space-y-2">
          {bestMover && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-emerald-400">{'\u25B2'}</span>
              <span className="text-slate-300 truncate flex-1">{bestMover.name}</span>
              <span className="text-emerald-400 font-medium">+{bestMover.change.toFixed(1)}%</span>
            </div>
          )}
          {worstMover && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-rose-400">{'\u25BC'}</span>
              <span className="text-slate-300 truncate flex-1">{worstMover.name}</span>
              <span className="text-rose-400 font-medium">{worstMover.change.toFixed(1)}%</span>
            </div>
          )}
          {!bestMover && !worstMover && (
            <span className="text-xs text-slate-500">No movers data</span>
          )}
        </div>
      </div>
    </RadialGlassCard>
  );
}
