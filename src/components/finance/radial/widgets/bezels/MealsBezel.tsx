/**
 * MealsBezelSvg — Top 180°: 3 thin arcs (B/L/D) with 2 junction dots.
 * Extracted from MealWidgets.tsx for bezel/widget separation.
 */

import { useMemo, type ReactNode } from 'react';
import { arcPath, circlePoint } from '../../cards/shared/arcHelpers';
import { useMealIntelligence } from '@/hooks/useMealIntelligence';
import { getMonday, getTodayLocal } from '@/utils/dateUtils';

export type MealSlotKey = 'breakfast' | 'lunch' | 'dinner';
const MEAL_SLOT_KEYS: MealSlotKey[] = ['breakfast', 'lunch', 'dinner'];

export function MealsBezelSvg({
  size,
  color = '#10b981',
  onSlotClick,
}: {
  size: number;
  color?: string;
  onSlotClick?: (slot: MealSlotKey) => void;
}): ReactNode {
  const periodStart = useMemo(() => getMonday(), []);
  const mealIntel = useMealIntelligence(periodStart);
  const todayDate = getTodayLocal();
  const todayFill = mealIntel.dayFills.find((d) => d.date === todayDate);
  const todaySlots: Record<MealSlotKey, boolean> = {
    breakfast: todayFill?.breakfast ?? false,
    lunch: todayFill?.lunch ?? false,
    dinner: todayFill?.dinner ?? false,
  };
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.92;
  const strokeW = size * 0.004;
  const segmentDeg = 52;
  const gapDeg = 5;
  const baseStart = -180 + 7;
  const filterId = 'meal-arc-glow';

  const arcs = MEAL_SLOT_KEYS.map((type, i) => ({
    type,
    start: baseStart + i * (segmentDeg + gapDeg),
    filled: todaySlots[type],
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
          key={`track-${a.type}`}
          d={arcPath(cx, cy, r, a.start, segmentDeg)}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeOpacity={0.15}
          strokeLinecap="round"
          style={{ cursor: onSlotClick ? 'pointer' : undefined }}
          onClick={onSlotClick ? () => onSlotClick(a.type) : undefined}
        />
      ))}
      {arcs.map((a) =>
        a.filled ? (
          <path
            key={`glow-${a.type}`}
            d={arcPath(cx, cy, r, a.start, segmentDeg)}
            fill="none"
            stroke={color}
            strokeWidth={strokeW * 2.5}
            strokeOpacity={0.3}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        ) : null,
      )}
      {arcs.map((a) =>
        a.filled ? (
          <path
            key={`fill-${a.type}`}
            d={arcPath(cx, cy, r, a.start, segmentDeg)}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeOpacity={0.7}
            strokeLinecap="round"
            style={{ cursor: onSlotClick ? 'pointer' : undefined }}
            onClick={onSlotClick ? () => onSlotClick(a.type) : undefined}
          />
        ) : null,
      )}
      {junctions.map((p, i) => (
        <circle key={`junc-${i}`} cx={p.x} cy={p.y} r={size * 0.004} fill="#475569" />
      ))}
    </g>
  );
}
