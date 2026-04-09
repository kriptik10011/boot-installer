/**
 * EquityCurveCard — Portfolio equity curve using recharts.
 *
 * Shows allocation donut + performance line chart.
 * Backend AllocationResponse: { allocations: [{ asset_class, current_pct, current_value }] }
 */

import { useMemo, useState } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';

interface AllocationEntry {
  asset_class: string;
  current_value: number;
  current_pct: number;
  target_pct?: number | null;
  drift_pct?: number | null;
}

interface EquityCurveCardProps {
  allocations: AllocationEntry[];
  totalValue: number;
  totalGainLossPct: number;
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

const ASSET_COLORS: Record<string, string> = {
  us_stocks: '#3b82f6',
  intl_stocks: '#22d3ee',
  bonds: '#a78bfa',
  real_estate: '#f59e0b',
  cash: '#94a3b8',
  crypto: '#fb923c',
  commodities: '#84cc16',
  alternatives: '#e879f9',
};

function getColor(assetClass: string, index: number): string {
  return ASSET_COLORS[assetClass] ?? ['#3b82f6', '#a78bfa', '#f59e0b', '#22d3ee', '#10b981', '#d97706'][index % 6];
}

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

type ViewMode = 'donut' | 'table';

export function EquityCurveCard({
  allocations,
  totalValue,
  totalGainLossPct,
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
}: EquityCurveCardProps) {
  const [view, setView] = useState<ViewMode>('donut');

  const sorted = useMemo(
    () => [...allocations].sort((a, b) => b.current_pct - a.current_pct),
    [allocations],
  );

  const isPositive = totalGainLossPct >= 0;

  // SVG donut params
  const donutR = 36;
  const donutC = 2 * Math.PI * donutR;

  return (
    <RadialGlassCard
      accentColor="#f59e0b"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-xs font-medium text-amber-400/70 uppercase tracking-wider">
          Allocation
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setView('donut')}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              view === 'donut' ? 'text-amber-400 bg-amber-400/10' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            Chart
          </button>
          <button
            onClick={() => setView('table')}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              view === 'table' ? 'text-amber-400 bg-amber-400/10' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="text-lg font-semibold text-slate-100"
          style={{ fontFamily: "'Space Grotesk', system-ui" }}
        >
          {fmt(totalValue)}
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: isPositive ? '#34d399' : '#f59e0b' }}
        >
          {isPositive ? '+' : ''}{totalGainLossPct.toFixed(1)}%
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No allocation data</p>
      ) : view === 'donut' ? (
        /* Donut chart + legend */
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0" style={{ width: 84, height: 84 }}>
            <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
              {(() => {
                let accum = 0;
                return sorted.map((entry, i) => {
                  const dashLen = (entry.current_pct / 100) * donutC;
                  const offset = accum;
                  accum += dashLen;
                  return (
                    <circle
                      key={entry.asset_class}
                      cx="42" cy="42" r={donutR}
                      fill="none"
                      stroke={getColor(entry.asset_class, i)}
                      strokeWidth="10"
                      strokeDasharray={`${dashLen} ${donutC - dashLen}`}
                      strokeDashoffset={-offset}
                      strokeLinecap="butt"
                    />
                  );
                });
              })()}
            </svg>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-1.5">
            {sorted.slice(0, 6).map((entry, i) => (
              <div key={entry.asset_class} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getColor(entry.asset_class, i) }}
                  />
                  <span className="text-slate-400 capitalize truncate max-w-[80px]">
                    {entry.asset_class.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-slate-300 tabular-nums">{entry.current_pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Table view with drift */
        <div className="space-y-1.5">
          <div className="flex text-[10px] text-slate-600 uppercase tracking-wider pb-1 border-b border-slate-800">
            <span className="flex-1">Asset Class</span>
            <span className="w-14 text-right">Value</span>
            <span className="w-10 text-right">Curr</span>
            <span className="w-10 text-right">Tgt</span>
            <span className="w-10 text-right">Drift</span>
          </div>
          {sorted.map((entry, i) => {
            const hasDrift = entry.drift_pct != null && entry.drift_pct !== 0;
            const driftColor = hasDrift
              ? (Math.abs(entry.drift_pct!) > 5 ? '#f59e0b' : '#94a3b8')
              : '#94a3b8';

            return (
              <div key={entry.asset_class} className="flex items-center text-xs">
                <div className="flex-1 flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getColor(entry.asset_class, i) }}
                  />
                  <span className="text-slate-300 capitalize truncate max-w-[80px]">
                    {entry.asset_class.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="w-14 text-right text-slate-400 tabular-nums">{fmt(entry.current_value)}</span>
                <span className="w-10 text-right text-slate-300 tabular-nums">{entry.current_pct.toFixed(0)}%</span>
                <span className="w-10 text-right text-slate-500 tabular-nums">
                  {entry.target_pct != null ? `${entry.target_pct.toFixed(0)}%` : '—'}
                </span>
                <span className="w-10 text-right tabular-nums" style={{ color: driftColor }}>
                  {entry.drift_pct != null ? `${entry.drift_pct >= 0 ? '+' : ''}${entry.drift_pct.toFixed(0)}%` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </RadialGlassCard>
  );
}
