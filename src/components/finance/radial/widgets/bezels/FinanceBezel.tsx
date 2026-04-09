/**
 * FinanceBezelSvg — Net worth delta direction arc.
 * Extracted from FinanceWidgets.tsx for bezel/widget separation.
 */

import { type ReactNode } from 'react';
import { arcPath } from '../../cards/shared/arcHelpers';
import { useNetWorthCurrent, useNetWorthTrend } from '@/hooks';

export function FinanceBezelSvg({
  size,
  maxDelta = 500,
}: {
  size: number;
  maxDelta?: number;
}): ReactNode {
  const { data: netWorthData } = useNetWorthCurrent();
  const { data: netWorthTrend } = useNetWorthTrend(2);
  const netWorth = (netWorthData as { net_worth?: number })?.net_worth ?? 0;
  const trendPoints = netWorthTrend ?? [];
  const prevNetWorth = trendPoints.length >= 2 ? trendPoints[trendPoints.length - 2]?.net_worth ?? 0 : netWorth;
  const deltaDollars = netWorth - prevNetWorth;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.92;
  const strokeW = size * 0.003;
  const fillGlowId = 'finance-fill-glow';
  const ghostGlowId = 'finance-ghost-glow';

  const magnitude = Math.min(1, Math.abs(deltaDollars) / Math.max(maxDelta, 1));
  const hasData = magnitude > 0.01;
  const isPositive = deltaDollars >= 0;

  const topColor = '#22c55e';
  const bottomColor = '#f59e0b';

  const topTrackStart = 190;
  const topTrackSweep = 160;
  const bottomTrackStart = 170;
  const bottomTrackSweep = -160;

  const fillColor = isPositive ? topColor : bottomColor;
  const fillSweep = isPositive ? magnitude * 160 : -(magnitude * 160);
  const dashArray = `${size * 0.004} ${size * 0.012}`;

  return (
    <g>
      <defs>
        <filter id={fillGlowId} x="0" y="0" width={size} height={size} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
        <filter id={ghostGlowId} x="0" y="0" width={size} height={size} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>
      <path d={arcPath(cx, cy, r, topTrackStart, topTrackSweep)} fill="none" stroke={topColor} strokeWidth={strokeW * 1.5} strokeOpacity={0.06} strokeLinecap="round" strokeDasharray={dashArray} filter={`url(#${ghostGlowId})`} />
      <path d={arcPath(cx, cy, r, bottomTrackStart, bottomTrackSweep)} fill="none" stroke={bottomColor} strokeWidth={strokeW * 1.5} strokeOpacity={0.06} strokeLinecap="round" strokeDasharray={dashArray} filter={`url(#${ghostGlowId})`} />
      <path d={arcPath(cx, cy, r, topTrackStart, topTrackSweep)} fill="none" stroke={topColor} strokeWidth={strokeW} strokeOpacity={0.18} strokeLinecap="round" strokeDasharray={dashArray} />
      <path d={arcPath(cx, cy, r, bottomTrackStart, bottomTrackSweep)} fill="none" stroke={bottomColor} strokeWidth={strokeW} strokeOpacity={0.18} strokeLinecap="round" strokeDasharray={dashArray} />
      {hasData && (
        <path d={arcPath(cx, cy, r, isPositive ? topTrackStart : bottomTrackStart, fillSweep)} fill="none" stroke={fillColor} strokeWidth={strokeW * 2} strokeOpacity={0.25} strokeLinecap="round" filter={`url(#${fillGlowId})`} />
      )}
      {hasData && (
        <path d={arcPath(cx, cy, r, isPositive ? topTrackStart : bottomTrackStart, fillSweep)} fill="none" stroke={fillColor} strokeWidth={strokeW} strokeOpacity={0.85} strokeLinecap="round" />
      )}
    </g>
  );
}
