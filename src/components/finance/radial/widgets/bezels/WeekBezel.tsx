/**
 * WeekBezelSvg — Top 180°: 3 thin arcs (Events/Meals/Bills) with 2 junction dots.
 * Extracted from WeekWidgets.tsx for bezel/widget separation.
 */

import { useMemo, type ReactNode } from 'react';
import { arcPath, circlePoint } from '../../cards/shared/arcHelpers';
import { useEventIntelligence } from '@/hooks/useEventIntelligence';
import { useMealIntelligence } from '@/hooks/useMealIntelligence';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { getMonday } from '@/utils/dateUtils';

type WeekDimKey = 'events' | 'meals' | 'bills';
const WEEK_DIM_KEYS: WeekDimKey[] = ['events', 'meals', 'bills'];

export const WEEK_DIM_COLORS: Record<WeekDimKey, string> = {
  events: '#22d3ee',
  meals: '#10b981',
  bills: '#a78bfa',
};

export const WEEK_DIM_LABELS: Record<WeekDimKey, string> = {
  events: 'Events',
  meals: 'Meals',
  bills: 'Bills',
};

export function WeekBezelSvg({ size }: { size: number }): ReactNode {
  const periodStart = useMemo(() => getMonday(), []);
  const eventIntel = useEventIntelligence(periodStart);
  const mealIntel = useMealIntelligence(periodStart);
  const financeIntel = useFinanceIntelligence();
  const eventCount = eventIntel.weekEventCount;
  const mealCount = Math.round(mealIntel.coveragePct * 21);
  const billCount = financeIntel.upcoming7d.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.92;
  const strokeW = size * 0.004;
  const segmentDeg = 52;
  const gapDeg = 5;
  const baseStart = -180 + 7;
  const filterId = 'week-arc-glow';

  const fills: Record<WeekDimKey, number> = {
    events: Math.min(1, eventCount / 10),
    meals: Math.min(1, mealCount / 21),
    bills: billCount > 0 ? Math.min(1, 0.3 + billCount * 0.15) : 0,
  };

  const arcs = WEEK_DIM_KEYS.map((key, i) => ({
    key,
    start: baseStart + i * (segmentDeg + gapDeg),
    fill: fills[key],
    color: WEEK_DIM_COLORS[key],
  }));

  const junctions = [0, 1].map((i) => {
    const gapMid = arcs[i].start + segmentDeg + gapDeg / 2;
    return circlePoint(cx, cy, r, gapMid);
  });

  return (
    <g>
      <defs>
        <filter id={filterId} x="0" y="0" width={size} height={size} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>
      {arcs.map((a) => (
        <path
          key={`track-${a.key}`}
          d={arcPath(cx, cy, r, a.start, segmentDeg)}
          fill="none"
          stroke={a.color}
          strokeWidth={strokeW}
          strokeOpacity={0.15}
          strokeLinecap="round"
        />
      ))}
      {arcs.map((a) =>
        a.fill > 0 ? (
          <path
            key={`glow-${a.key}`}
            d={arcPath(cx, cy, r, a.start, segmentDeg * a.fill)}
            fill="none"
            stroke={a.color}
            strokeWidth={strokeW * 2.5}
            strokeOpacity={0.3}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        ) : null,
      )}
      {arcs.map((a) =>
        a.fill > 0 ? (
          <path
            key={`fill-${a.key}`}
            d={arcPath(cx, cy, r, a.start, segmentDeg * a.fill)}
            fill="none"
            stroke={a.color}
            strokeWidth={strokeW}
            strokeOpacity={0.7}
            strokeLinecap="round"
          />
        ) : null,
      )}
      {junctions.map((p, i) => (
        <circle key={`junc-${i}`} cx={p.x} cy={p.y} r={size * 0.004} fill="#475569" />
      ))}
    </g>
  );
}
