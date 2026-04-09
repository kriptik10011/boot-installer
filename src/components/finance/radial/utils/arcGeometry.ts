/**
 * Arc geometry utilities for SVG path computation.
 *
 * V3: Hairline arcs (stroke-only), labels OUTSIDE ring, decorative gap dots.
 * Keeps backward-compat functions for GestureLayer.
 */

import { useAppStore } from '@/stores/appStore';

export type ArcPosition = 'north' | 'east' | 'south' | 'west';

export interface ArcConfig {
  position: ArcPosition;
  label: string;
  color: string;
  startAngle: number; // degrees, SVG convention (0=right, clockwise)
  endAngle: number;
}

// Layout constants
export const ARC_RING_RADIUS = 310; // single hairline radius
export const LABEL_RADIUS = 355; // text labels OUTSIDE the ring
export const CENTER = 340; // center point in 680x680 viewBox
export const VIEWBOX_SIZE = 680;
export const GAP_DEGREES = 4; // gap between arcs for visual separation

// Backward compat (used by SectionDashboard, etc.)
export const OUTER_RADIUS = 340;
export const INNER_RADIUS = 320;

// Arc boundaries (at diagonal corners)
// SVG: 0=right, 90=bottom, 180=left, 270=top
const BOUNDARY_NE = 315;
const BOUNDARY_SE = 45;
const BOUNDARY_SW = 135;
const BOUNDARY_NW = 225;

// Decorative gap dot positions (diagonal corners between arcs)
export const GAP_NODE_ANGLES = [BOUNDARY_NE, BOUNDARY_SE, BOUNDARY_SW, BOUNDARY_NW];

export const ARC_CONFIGS: ArcConfig[] = [
  {
    position: 'north',
    label: 'WEEKVIEW',
    color: '#22d3ee', // cyan-400
    startAngle: BOUNDARY_NW + GAP_DEGREES,
    endAngle: BOUNDARY_NE - GAP_DEGREES,
  },
  {
    position: 'east',
    label: 'MEALS & RECIPES',
    color: '#10b981', // emerald-500
    startAngle: BOUNDARY_NE + GAP_DEGREES,
    endAngle: BOUNDARY_SE + 360 - GAP_DEGREES,
  },
  {
    position: 'south',
    label: 'FINANCIAL',
    color: '#a78bfa', // violet-400
    startAngle: BOUNDARY_SE + GAP_DEGREES,
    endAngle: BOUNDARY_SW - GAP_DEGREES,
  },
  {
    position: 'west',
    label: 'INVENTORY',
    color: '#f59e0b', // amber-500
    startAngle: BOUNDARY_SW + GAP_DEGREES,
    endAngle: BOUNDARY_NW - GAP_DEGREES,
  },
];

/** Finance sub-arc configs — same geometry, different labels/colors */
export const FINANCE_SUB_ARC_CONFIGS: ArcConfig[] = [
  {
    position: 'north',
    label: 'MONITOR',
    color: '#22d3ee', // cyan
    startAngle: BOUNDARY_NW + GAP_DEGREES,
    endAngle: BOUNDARY_NE - GAP_DEGREES,
  },
  {
    position: 'east',
    label: 'BUDGET',
    color: '#8b5cf6', // violet
    startAngle: BOUNDARY_NE + GAP_DEGREES,
    endAngle: BOUNDARY_SE + 360 - GAP_DEGREES,
  },
  {
    position: 'south',
    label: 'GOALS',
    color: '#10b981', // emerald
    startAngle: BOUNDARY_SE + GAP_DEGREES,
    endAngle: BOUNDARY_SW - GAP_DEGREES,
  },
  {
    position: 'west',
    label: 'CAPITAL',
    color: '#f59e0b', // amber
    startAngle: BOUNDARY_SW + GAP_DEGREES,
    endAngle: BOUNDARY_NW - GAP_DEGREES,
  },
];

/** Week sub-arc configs — same geometry, week-domain labels/colors */
export const WEEK_SUB_ARC_CONFIGS: ArcConfig[] = [
  {
    position: 'north',
    label: 'SUMMARY',
    color: '#38bdf8', // sky-400
    startAngle: BOUNDARY_NW + GAP_DEGREES,
    endAngle: BOUNDARY_NE - GAP_DEGREES,
  },
  {
    position: 'east',
    label: 'BILLS',
    color: '#a78bfa', // violet-400
    startAngle: BOUNDARY_NE + GAP_DEGREES,
    endAngle: BOUNDARY_SE + 360 - GAP_DEGREES,
  },
  {
    position: 'south',
    label: 'RHYTHM',
    color: '#34d399', // emerald-400
    startAngle: BOUNDARY_SE + GAP_DEGREES,
    endAngle: BOUNDARY_SW - GAP_DEGREES,
  },
  {
    position: 'west',
    label: 'EVENTS',
    color: '#fb923c', // orange-400
    startAngle: BOUNDARY_SW + GAP_DEGREES,
    endAngle: BOUNDARY_NW - GAP_DEGREES,
  },
];

/** Inventory sub-arc configs — same geometry, inventory-domain labels/colors */
export const INVENTORY_SUB_ARC_CONFIGS: ArcConfig[] = [
  {
    position: 'north',
    label: 'INVENTORY',
    color: '#f59e0b', // amber
    startAngle: BOUNDARY_NW + GAP_DEGREES,
    endAngle: BOUNDARY_NE - GAP_DEGREES,
  },
  {
    position: 'east',
    label: 'EXPIRING',
    color: '#d97706', // amber
    startAngle: BOUNDARY_NE + GAP_DEGREES,
    endAngle: BOUNDARY_SE + 360 - GAP_DEGREES,
  },
  {
    position: 'south',
    label: 'STATS',
    color: '#34d399', // emerald
    startAngle: BOUNDARY_SE + GAP_DEGREES,
    endAngle: BOUNDARY_SW - GAP_DEGREES,
  },
  {
    position: 'west',
    label: 'CUSTOM',
    color: '#94a3b8', // slate
    startAngle: BOUNDARY_SW + GAP_DEGREES,
    endAngle: BOUNDARY_NW - GAP_DEGREES,
  },
];

/** Meals sub-arc configs — same geometry, meals-domain labels/colors */
export const MEALS_SUB_ARC_CONFIGS: ArcConfig[] = [
  {
    position: 'north',
    label: 'MEALS',
    color: '#10b981', // emerald
    startAngle: BOUNDARY_NW + GAP_DEGREES,
    endAngle: BOUNDARY_NE - GAP_DEGREES,
  },
  {
    position: 'east',
    label: 'RECIPES',
    color: '#34d399', // emerald-light
    startAngle: BOUNDARY_NE + GAP_DEGREES,
    endAngle: BOUNDARY_SE + 360 - GAP_DEGREES,
  },
  {
    position: 'south',
    label: 'COOKING',
    color: '#6ee7b7', // emerald-lighter
    startAngle: BOUNDARY_SE + GAP_DEGREES,
    endAngle: BOUNDARY_SW - GAP_DEGREES,
  },
  {
    position: 'west',
    label: 'IMPORT',
    color: '#a7f3d0', // emerald-lightest
    startAngle: BOUNDARY_SW + GAP_DEGREES,
    endAngle: BOUNDARY_NW - GAP_DEGREES,
  },
];

/** Get sub-arc configs for a drilled-into main arc */
export function getSubArcConfigs(mainArc: ArcPosition): ArcConfig[] | null {
  switch (mainArc) {
    case 'south': return FINANCE_SUB_ARC_CONFIGS;
    case 'north': return WEEK_SUB_ARC_CONFIGS;
    case 'west':  return INVENTORY_SUB_ARC_CONFIGS;
    case 'east':  return MEALS_SUB_ARC_CONFIGS;
    default: return null;
  }
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = degToRad(angleDeg);
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/** Stroke-only circular arc path (no fill, no donut) */
export function hairlineArcPath(startAngle: number, endAngle: number): string {
  const normEnd = endAngle > 360 ? endAngle - 360 : endAngle;
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  const start = polarToCartesian(CENTER, CENTER, ARC_RING_RADIUS, startAngle);
  const end = polarToCartesian(CENTER, CENTER, ARC_RING_RADIUS, normEnd);
  return `M ${start.x} ${start.y} A ${ARC_RING_RADIUS} ${ARC_RING_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

type TextAnchor = 'start' | 'middle' | 'end';

/** Position for label text OUTSIDE the ring */
export function outerLabelPosition(position: ArcPosition): { x: number; y: number; textAnchor: TextAnchor } {
  switch (position) {
    case 'north':
      return { x: CENTER, y: CENTER - LABEL_RADIUS, textAnchor: 'middle' };
    case 'south':
      return { x: CENTER, y: CENTER + LABEL_RADIUS + 6, textAnchor: 'middle' };
    case 'east':
      return { x: CENTER + LABEL_RADIUS, y: CENTER + 4, textAnchor: 'start' };
    case 'west':
      return { x: CENTER - LABEL_RADIUS, y: CENTER + 4, textAnchor: 'end' };
  }
}

/** Position for contextual stat text below the label */
export function outerStatPosition(position: ArcPosition): { x: number; y: number; textAnchor: TextAnchor } {
  const labelPos = outerLabelPosition(position);
  const offset = position === 'north' ? -16 : 16;
  return { x: labelPos.x, y: labelPos.y + offset, textAnchor: labelPos.textAnchor };
}

/** Lattice beam position and geometry (decorative line under label on hover) */
export function latticeBeamGeometry(position: ArcPosition): { x1: number; y1: number; x2: number; y2: number; dotPositions: Array<{ x: number; y: number }> } {
  const label = outerLabelPosition(position);
  const beamLength = 60;
  const dotCount = 5;
  const isVertical = position === 'east' || position === 'west';

  let x1: number, y1: number, x2: number, y2: number;

  if (isVertical) {
    // Vertical beam for east/west labels
    const beamOffset = position === 'east' ? 8 : -8;
    x1 = label.x + beamOffset;
    y1 = label.y - beamLength / 2 + 8;
    x2 = label.x + beamOffset;
    y2 = label.y + beamLength / 2 + 8;
  } else {
    // Horizontal beam for north/south labels
    const beamOffset = position === 'north' ? -10 : 10;
    x1 = label.x - beamLength / 2;
    y1 = label.y + beamOffset;
    x2 = label.x + beamLength / 2;
    y2 = label.y + beamOffset;
  }

  const dotPositions = Array.from({ length: dotCount }, (_, i) => ({
    x: x1 + ((x2 - x1) * i) / (dotCount - 1),
    y: y1 + ((y2 - y1) * i) / (dotCount - 1),
  }));

  return { x1, y1, x2, y2, dotPositions };
}

/** Curved text path for textPath morph — handles text direction for all 4 arcs.
 *  North/East: clockwise path (text reads naturally)
 *  South/West: counter-clockwise path (characters face outward, text reads L→R)
 */
export function curvedTextPath(position: ArcPosition, startAngle: number, endAngle: number): string {
  const textR = ARC_RING_RADIUS - 18; // Inside the hairline ring
  const normEnd = endAngle > 360 ? endAngle - 360 : endAngle;
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;

  // South and west: reverse path direction so characters face outward
  if (position === 'south' || position === 'west') {
    const s = polarToCartesian(CENTER, CENTER, textR, normEnd);
    const e = polarToCartesian(CENTER, CENTER, textR, startAngle);
    return `M ${s.x} ${s.y} A ${textR} ${textR} 0 ${largeArc} 0 ${e.x} ${e.y}`;
  }

  const s = polarToCartesian(CENTER, CENTER, textR, startAngle);
  const e = polarToCartesian(CENTER, CENTER, textR, normEnd);
  return `M ${s.x} ${s.y} A ${textR} ${textR} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

/** Gap node positions (decorative dots at diagonal corners between arcs) */
export function gapNodePositions(): Array<{ x: number; y: number }> {
  return GAP_NODE_ANGLES.map((angle) => polarToCartesian(CENTER, CENTER, ARC_RING_RADIUS, angle));
}

// ---- Backward-compat functions (used by GestureLayer) ----

export function arcSegmentPath(startAngle: number, endAngle: number): string {
  const normEnd = endAngle > 360 ? endAngle - 360 : endAngle;
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;

  const outerStart = polarToCartesian(CENTER, CENTER, OUTER_RADIUS, startAngle);
  const outerEnd = polarToCartesian(CENTER, CENTER, OUTER_RADIUS, normEnd);
  const innerEnd = polarToCartesian(CENTER, CENTER, INNER_RADIUS, normEnd);
  const innerStart = polarToCartesian(CENTER, CENTER, INNER_RADIUS, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function arcTextPath(startAngle: number, endAngle: number): string {
  const textRadius = INNER_RADIUS + 10;
  const normEnd = endAngle > 360 ? endAngle - 360 : endAngle;
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  const start = polarToCartesian(CENTER, CENTER, textRadius, startAngle);
  const end = polarToCartesian(CENTER, CENTER, textRadius, normEnd);
  return `M ${start.x} ${start.y} A ${textRadius} ${textRadius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function straightTextPath(position: ArcPosition): string {
  const offset = INNER_RADIUS + 10;
  switch (position) {
    case 'north':
      return `M ${CENTER - 50} ${CENTER - offset} L ${CENTER + 50} ${CENTER - offset}`;
    case 'south':
      return `M ${CENTER - 50} ${CENTER + offset} L ${CENTER + 50} ${CENTER + offset}`;
    case 'east':
      return `M ${CENTER + offset - 30} ${CENTER} L ${CENTER + offset + 30} ${CENTER}`;
    case 'west':
      return `M ${CENTER - offset - 30} ${CENTER} L ${CENTER - offset + 30} ${CENTER}`;
  }
}

export function angleFromCenter(x: number, y: number, cx: number, cy: number): number {
  const dx = x - cx;
  const dy = y - cy;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

export function arcAtAngle(angle: number): ArcPosition | null {
  if (angle >= BOUNDARY_NW + GAP_DEGREES && angle <= BOUNDARY_NE - GAP_DEGREES) return 'north';
  if (angle >= BOUNDARY_SW + GAP_DEGREES && angle <= BOUNDARY_NW - GAP_DEGREES) return 'west';
  if (angle >= BOUNDARY_SE + GAP_DEGREES && angle <= BOUNDARY_SW - GAP_DEGREES) return 'south';
  if (angle >= BOUNDARY_NE + GAP_DEGREES || angle <= BOUNDARY_SE - GAP_DEGREES) return 'east';
  return null;
}

export function distanceFromCenter(x: number, y: number, cx: number, cy: number): number {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

// ---- Junction Points (interactive nodes between arcs) ----

export type JunctionId = 'nw' | 'ne' | 'se' | 'sw';

export type JunctionIcon = 'bag' | 'grid' | 'check' | 'gear' | 'plus';

export interface JunctionConfig {
  id: JunctionId;
  label: string;
  color: string;
  angleDeg: number;   // position on ring (SVG degrees)
  hitRadius: number;   // SVG-space proximity radius
  icon?: JunctionIcon; // custom icon override (defaults to id-based mapping)
}

// hitRadius = enter zone, exitRadius = leave zone (hysteresis prevents jitter)
export const JUNCTION_HIT_RADIUS = 34;
export const JUNCTION_EXIT_RADIUS = 90;

export const JUNCTION_CONFIGS: JunctionConfig[] = [
  { id: 'nw', label: 'SHOP',     color: '#fb923c', angleDeg: BOUNDARY_NW, hitRadius: JUNCTION_HIT_RADIUS },
  { id: 'ne', label: 'DASH',     color: '#38bdf8', angleDeg: BOUNDARY_NE, hitRadius: JUNCTION_HIT_RADIUS },
  { id: 'se', label: 'HABITS',   color: '#4ade80', angleDeg: BOUNDARY_SE, hitRadius: JUNCTION_HIT_RADIUS },
  { id: 'sw', label: 'SETTINGS', color: '#e879f9', angleDeg: BOUNDARY_SW, hitRadius: JUNCTION_HIT_RADIUS },
];

/** Get junction configs active during sub-arc mode for a given main arc */
export function getSubArcJunctionConfigs(mainArc: ArcPosition): JunctionConfig[] {
  switch (mainArc) {
    case 'west':
      return [
        { id: 'sw', label: 'ADD', color: '#f59e0b', angleDeg: BOUNDARY_SW, hitRadius: JUNCTION_HIT_RADIUS, icon: 'plus' },
      ];
    default:
      return [];
  }
}

/** Get the SVG position of a junction on the arc ring */
export function junctionPosition(config: JunctionConfig): { x: number; y: number } {
  return polarToCartesian(CENTER, CENTER, ARC_RING_RADIUS, config.angleDeg);
}

/** Find the nearest junction to an SVG coordinate, or null if none within hitRadius */
export function nearestJunction(svgX: number, svgY: number): JunctionId | null {
  let closest: JunctionId | null = null;
  let closestDist = Infinity;

  for (const config of JUNCTION_CONFIGS) {
    const pos = junctionPosition(config);
    const dist = Math.sqrt((svgX - pos.x) ** 2 + (svgY - pos.y) ** 2);
    if (dist < config.hitRadius && dist < closestDist) {
      closest = config.id;
      closestDist = dist;
    }
  }

  return closest;
}

// ---- Store-driven accessors (call inside component render, NEVER at module scope) ----

/** Get arc color — store override if set, otherwise ARC_CONFIGS default */
export function getArcColor(position: ArcPosition): string {
  const override = useAppStore.getState().latticePrefs.arcColors?.[position];
  return override ?? ARC_CONFIGS.find((c) => c.position === position)!.color;
}

/** Get arc label — store override if set, otherwise ARC_CONFIGS default */
export function getArcLabel(position: ArcPosition): string {
  const override = useAppStore.getState().latticePrefs.arcLabels?.[position];
  return override ?? ARC_CONFIGS.find((c) => c.position === position)!.label;
}

/** Get junction color — store override if set, otherwise JUNCTION_CONFIGS default */
export function getJunctionColor(id: JunctionId): string {
  const override = useAppStore.getState().latticePrefs.junctionColors?.[id];
  return override ?? JUNCTION_CONFIGS.find((c) => c.id === id)!.color;
}

/** Get junction label — store override if set, otherwise JUNCTION_CONFIGS default */
export function getJunctionLabel(id: JunctionId): string {
  const override = useAppStore.getState().latticePrefs.junctionLabels?.[id];
  return override ?? JUNCTION_CONFIGS.find((c) => c.id === id)!.label;
}

/** Check if SVG coordinate is still within the EXIT radius of a specific junction (hysteresis) */
export function isWithinJunctionExit(svgX: number, svgY: number, junctionId: JunctionId): boolean {
  const config = JUNCTION_CONFIGS.find((c) => c.id === junctionId);
  if (!config) return false;
  const pos = junctionPosition(config);
  const dist = Math.sqrt((svgX - pos.x) ** 2 + (svgY - pos.y) ** 2);
  return dist < JUNCTION_EXIT_RADIUS;
}
