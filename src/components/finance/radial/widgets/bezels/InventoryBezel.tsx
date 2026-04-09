/**
 * Inventory bezel SVGs — top 180° food groups + bottom 180° waste.
 * Extracted from PantryWidgets.tsx for bezel/widget separation.
 */

import { type ReactNode } from 'react';
import { arcPath, circlePoint } from '../../cards/shared/arcHelpers';
import { useInventoryIntelligence } from '@/hooks/useInventoryIntelligence';

type FoodGroup = 'protein' | 'dairy' | 'grains' | 'vegetables' | 'fruits';
const FOOD_GROUPS: FoodGroup[] = ['protein', 'dairy', 'grains', 'vegetables', 'fruits'];

export const FOOD_GROUP_COLORS: Record<FoodGroup, string> = {
  protein: '#f97316',
  dairy: '#3b82f6',
  grains: '#a16207',
  vegetables: '#22c55e',
  fruits: '#eab308',
};

const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  protein: 'Protein',
  dairy: 'Dairy',
  grains: 'Grains',
  vegetables: 'Vegetables',
  fruits: 'Fruits',
};

export function InventoryBezelSvg({ size }: { size: number }): ReactNode {
  const inventoryIntelligence = useInventoryIntelligence();
  const groupFills = inventoryIntelligence.foodGroupFills;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.92;
  const strokeW = size * 0.004;
  const segmentDeg = 28;
  const gapDeg = 5;
  const totalSpan = 5 * segmentDeg + 4 * gapDeg;
  const baseStart = -180 + (180 - totalSpan) / 2;
  const filterId = 'inv-group-glow';

  const arcs = FOOD_GROUPS.map((group, i) => ({
    group,
    start: baseStart + i * (segmentDeg + gapDeg),
    fill: groupFills[group] ?? 0,
    color: FOOD_GROUP_COLORS[group],
  }));

  const junctions = [0, 1, 2, 3].map((i) => {
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
        <path key={`track-${a.group}`} d={arcPath(cx, cy, r, a.start, segmentDeg)} fill="none" stroke={a.color} strokeWidth={strokeW} strokeOpacity={0.15} strokeLinecap="round" />
      ))}
      {arcs.map((a) =>
        a.fill > 0 ? (
          <path key={`glow-${a.group}`} d={arcPath(cx, cy, r, a.start, segmentDeg * a.fill)} fill="none" stroke={a.color} strokeWidth={strokeW * 2.5} strokeOpacity={0.3} strokeLinecap="round" filter={`url(#${filterId})`} />
        ) : null,
      )}
      {arcs.map((a) =>
        a.fill > 0 ? (
          <path key={`fill-${a.group}`} d={arcPath(cx, cy, r, a.start, segmentDeg * a.fill)} fill="none" stroke={a.color} strokeWidth={strokeW} strokeOpacity={0.7} strokeLinecap="round" />
        ) : null,
      )}
      {junctions.map((p, i) => (
        <circle key={`junc-top-${i}`} cx={p.x} cy={p.y} r={size * 0.004} fill="#475569" />
      ))}
      {arcs.map((a) => {
        const textR = r + strokeW * 3;
        const pathId = `inv-label-${a.group}`;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const sx = cx + textR * Math.cos(toRad(a.start));
        const sy = cy + textR * Math.sin(toRad(a.start));
        const ex = cx + textR * Math.cos(toRad(a.start + segmentDeg));
        const ey = cy + textR * Math.sin(toRad(a.start + segmentDeg));
        const pathD = `M ${sx} ${sy} A ${textR} ${textR} 0 0 1 ${ex} ${ey}`;
        return (
          <g key={`label-${a.group}`}>
            <defs><path id={pathId} d={pathD} fill="none" /></defs>
            <text fill={a.color} fontSize={size * 0.018} fontWeight={600} fontFamily="'Space Grotesk', system-ui" letterSpacing="1px" opacity={0.7}>
              <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                {FOOD_GROUP_LABELS[a.group]}
              </textPath>
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function InventoryWasteBezelSvg({
  size,
  color = '#f59e0b',
}: {
  size: number;
  color?: string;
}): ReactNode {
  const groupFills: Partial<Record<FoodGroup, number>> = {};
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.92;
  const strokeW = size * 0.004;
  const segmentDeg = 28;
  const gapDeg = 5;
  const totalSpan = 5 * segmentDeg + 4 * gapDeg;
  const baseStart = 0 + (180 - totalSpan) / 2;
  const filterId = 'inv-waste-glow';

  const arcs = FOOD_GROUPS.map((group, i) => ({
    group,
    start: baseStart + i * (segmentDeg + gapDeg),
    fill: groupFills[group] ?? 0,
  }));

  const junctions = [0, 1, 2, 3].map((i) => {
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
        <path key={`waste-track-${a.group}`} d={arcPath(cx, cy, r, a.start, segmentDeg)} fill="none" stroke={color} strokeWidth={strokeW} strokeOpacity={0.15} strokeLinecap="round" />
      ))}
      {arcs.map((a) =>
        a.fill > 0 ? (
          <path key={`waste-glow-${a.group}`} d={arcPath(cx, cy, r, a.start, segmentDeg * a.fill)} fill="none" stroke={color} strokeWidth={strokeW * 2.5} strokeOpacity={0.3} strokeLinecap="round" filter={`url(#${filterId})`} />
        ) : null,
      )}
      {arcs.map((a) =>
        a.fill > 0 ? (
          <path key={`waste-fill-${a.group}`} d={arcPath(cx, cy, r, a.start, segmentDeg * a.fill)} fill="none" stroke={color} strokeWidth={strokeW} strokeOpacity={0.7} strokeLinecap="round" />
        ) : null,
      )}
      {junctions.map((p, i) => (
        <circle key={`junc-bot-${i}`} cx={p.x} cy={p.y} r={size * 0.004} fill="#475569" />
      ))}
    </g>
  );
}
