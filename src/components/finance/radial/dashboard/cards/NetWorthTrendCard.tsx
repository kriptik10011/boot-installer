/**
 * NetWorthTrendCard — 12-month net worth line chart with assets/liabilities.
 *
 * Backend NetWorthTrendEntry: date, total_assets, total_liabilities, net_worth.
 */

import { useMemo } from 'react';
import { RadialGlassCard } from '../RadialGlassCard';
import { useNetWorthTrend } from '@/hooks';
import { fmtDashboard } from '../../cards/shared/formatUtils';

interface TrendPoint {
  date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}

interface NetWorthTrendCardProps {
  cardId: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
  timeRangeMonths?: number;
}

/** Build SVG polyline points from data */
function buildPath(
  data: TrendPoint[],
  accessor: (d: TrendPoint) => number,
  width: number,
  height: number,
  minVal: number,
  maxVal: number,
): string {
  if (data.length === 0) return '';
  const range = maxVal - minVal || 1;
  return data
    .map((d, i) => {
      const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
      const y = height - ((accessor(d) - minVal) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

export function NetWorthTrendCard({
  cardId,
  isBlurred,
  opacity,
  scale,
  onFocus,
  timeRangeMonths = 12,
}: NetWorthTrendCardProps) {
  const { data: trendData } = useNetWorthTrend(timeRangeMonths);

  const points = useMemo(() => {
    const items = (trendData ?? []) as TrendPoint[];
    return [...items].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }, [trendData]);

  const latest = points[points.length - 1];
  const first = points[0];

  // Change over period
  const changePct = useMemo(() => {
    if (!first || !latest || first.net_worth === 0) return 0;
    return ((latest.net_worth - first.net_worth) / Math.abs(first.net_worth)) * 100;
  }, [first, latest]);

  // Chart dimensions
  const chartW = 280;
  const chartH = 80;

  const { minVal, maxVal, netWorthPath, assetsPath, liabilitiesPath } = useMemo(() => {
    if (points.length === 0) {
      return { minVal: 0, maxVal: 1, netWorthPath: '', assetsPath: '', liabilitiesPath: '' };
    }
    const allValues = points.flatMap((p) => [p.net_worth, p.total_assets, p.total_liabilities]);
    const mn = Math.min(...allValues);
    const mx = Math.max(...allValues);
    const pad = (mx - mn) * 0.1;
    const lo = mn - pad;
    const hi = mx + pad;
    return {
      minVal: lo,
      maxVal: hi,
      netWorthPath: buildPath(points, (d) => d.net_worth, chartW, chartH, lo, hi),
      assetsPath: buildPath(points, (d) => d.total_assets, chartW, chartH, lo, hi),
      liabilitiesPath: buildPath(points, (d) => d.total_liabilities, chartW, chartH, lo, hi),
    };
  }, [points]);

  const isPositive = changePct >= 0;

  return (
    <RadialGlassCard
      accentColor="#22d3ee"
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      onFocus={onFocus}
    >
      {/* Header */}
      <div className="flex justify-between items-baseline mb-1">
        <h2 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider">
          Net Worth Trend
        </h2>
        <span className="text-xs text-slate-500">{timeRangeMonths} months</span>
      </div>

      {/* Current value + change */}
      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="text-lg font-semibold text-slate-100"
          style={{ fontFamily: "'Space Grotesk', system-ui" }}
        >
          {latest ? `${latest.net_worth < 0 ? '-' : ''}${fmtDashboard(latest.net_worth)}` : '—'}
        </span>
        {changePct !== 0 && (
          <span
            className="text-xs font-medium"
            style={{ color: isPositive ? '#34d399' : '#f59e0b' }}
          >
            {isPositive ? '+' : ''}{changePct.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Chart */}
      {points.length >= 2 ? (
        <div className="mb-3">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full"
            style={{ height: 80 }}
            preserveAspectRatio="none"
          >
            {/* Assets (faint) */}
            <polyline
              points={assetsPath}
              fill="none"
              stroke="#34d399"
              strokeWidth="1"
              strokeOpacity="0.3"
            />
            {/* Liabilities (faint) */}
            <polyline
              points={liabilitiesPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1"
              strokeOpacity="0.3"
            />
            {/* Net worth (main line) */}
            <polyline
              points={netWorthPath}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : (
        <div className="flex items-center justify-center h-20 text-sm text-slate-500">
          Not enough data for chart
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded bg-cyan-400" />
          <span className="text-slate-500">Net Worth</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded bg-emerald-400/30" />
          <span className="text-slate-500">Assets</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded bg-amber-400/30" />
          <span className="text-slate-500">Liabilities</span>
        </div>
      </div>

      {/* Breakdown */}
      {latest && (
        <div className="flex gap-4 mt-2 text-xs">
          <div>
            <span className="text-slate-500">Assets</span>
            <span className="ml-1 text-emerald-400/70">{fmtDashboard(latest.total_assets)}</span>
          </div>
          <div>
            <span className="text-slate-500">Debts</span>
            <span className="ml-1 text-amber-400/70">{fmtDashboard(latest.total_liabilities)}</span>
          </div>
        </div>
      )}
    </RadialGlassCard>
  );
}
