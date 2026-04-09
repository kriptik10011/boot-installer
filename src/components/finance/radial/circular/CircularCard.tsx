/**
 * CircularCard — 3-zone layout wrapper for circular card mode.
 *
 * Zones (concentric, center-out):
 *   Core   — inner 70.7% inscribed square (text, metrics, grids)
 *   Middle — between inscribed square and bezel (satellite nodes, FABs)
 *   Bezel  — outer ~15% ring (progress arcs, ring indicators, curved labels)
 *
 * The component renders an SVG layer for bezel content (arcs, rings)
 * overlaid on top of an HTML layer for core content. Both are absolutely
 * positioned within the circular boundary.
 *
 * Research ref: 70.7% = 1/√2 inscribed square. 63.7% area efficiency.
 * Safety margin: 5.2% minimum (Wear OS). We use ~14.6% inset = safe.
 */

import { type ReactNode } from 'react';
import { RING_TRACK_COLOR } from '../cardTemplate';
import { ArcNavigation } from './ArcNavigation';

export interface ArcNavConfig {
  activeIndex: number;
  cardCount: number;
}

export interface BezelArc {
  /** 0-1 fill amount */
  value: number;
  /** Start angle in degrees (0 = 3 o'clock / east) */
  startAngle: number;
  /** Sweep angle in degrees (positive = clockwise) */
  sweepAngle: number;
  /** Arc color */
  color: string;
  /** Optional label for accessibility */
  label?: string;
}

interface CircularCardProps {
  /** SVG content rendered in the bezel zone (arcs, rings, curved labels) */
  bezelArcs?: BezelArc[];
  /** Custom SVG content for the bezel (full control) */
  bezelSvg?: ReactNode;
  /** ReactNode rendered in the core inscribed zone */
  children: ReactNode;
  /** Diameter of the circular card in px (used for SVG viewBox) */
  size?: number;
  /** Bezel ring track color (background for unfilled arcs) */
  trackColor?: string;
  /** Bezel ring stroke width as % of radius */
  strokeWidthPct?: number;
  /** Arc navigation config — when provided, renders left/right click arcs */
  arcNavConfig?: ArcNavConfig;
  /** Callback when arc navigation is clicked */
  onArcNavigate?: (direction: 'prev' | 'next') => void;
  /** Color for arc navigation arcs */
  arcNavColor?: string;
}

/** Convert degrees to radians */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Compute SVG arc path for a circular arc segment */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  sweepDeg: number,
): string {
  if (Math.abs(sweepDeg) < 0.01) return '';

  const startRad = degToRad(startDeg);
  const endRad = degToRad(startDeg + sweepDeg);

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweepFlag = sweepDeg > 0 ? 1 : 0;

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
}

export function CircularCard({
  bezelArcs,
  bezelSvg,
  children,
  size = 400,
  trackColor = RING_TRACK_COLOR,
  strokeWidthPct = 4,
  arcNavConfig,
  onArcNavigate,
  arcNavColor,
}: CircularCardProps) {
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = (strokeWidthPct / 100) * (size / 2);
  // Bezel arc radius: centered in the bezel ring zone
  // Bezel starts at ~85% of radius (just inside the card edge)
  const bezelR = (size / 2) * 0.88 - strokeWidth / 2;

  const hasBezel = (bezelArcs && bezelArcs.length > 0) || bezelSvg || arcNavConfig;

  return (
    <div className="relative w-full h-full">
      {/* Bezel SVG layer — absolute, full circle, pointer-events on arcs only */}
      {hasBezel && (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {/* Glow filters — standard + intense (85%+) */}
          <defs>
            <filter
              id="bezel-glow"
              x="0" y="0"
              width={size} height={size}
              filterUnits="userSpaceOnUse"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
            </filter>
            <filter
              id="bezel-glow-intense"
              x="0" y="0"
              width={size} height={size}
              filterUnits="userSpaceOnUse"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
            </filter>
          </defs>
          {/* Track rings — dim, always visible (hairline style) */}
          {bezelArcs?.map((arc, i) => (
            <path
              key={`track-${i}`}
              d={arcPath(cx, cy, bezelR, arc.startAngle, arc.sweepAngle)}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeOpacity={0.15}
              strokeLinecap="round"
            />
          ))}
          {/* Glow layer behind filled arcs — intensifies at 85%+ */}
          {bezelArcs?.map((arc, i) => {
            const fillSweep = arc.sweepAngle * Math.max(0, Math.min(1, arc.value));
            if (Math.abs(fillSweep) < 0.01) return null;
            const intense = arc.value >= 0.85;
            return (
              <path
                key={`glow-${i}`}
                d={arcPath(cx, cy, bezelR, arc.startAngle, fillSweep)}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth * (intense ? 4 : 2.5)}
                strokeOpacity={intense ? 0.5 : 0.3}
                strokeLinecap="round"
                filter={intense ? 'url(#bezel-glow-intense)' : 'url(#bezel-glow)'}
              />
            );
          })}
          {/* Filled arcs — brighter, on top of glow (hairline) */}
          {bezelArcs?.map((arc, i) => {
            const fillSweep = arc.sweepAngle * Math.max(0, Math.min(1, arc.value));
            if (Math.abs(fillSweep) < 0.01) return null;
            return (
              <path
                key={`fill-${i}`}
                d={arcPath(cx, cy, bezelR, arc.startAngle, fillSweep)}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeOpacity={arc.value >= 0.85 ? 1 : 0.7}
                strokeLinecap="round"
              >
                {arc.label && <title>{arc.label}</title>}
              </path>
            );
          })}
          {/* Custom bezel SVG content */}
          {bezelSvg}
          {/* Arc navigation (left/right page click targets) */}
          {arcNavConfig && onArcNavigate && (
            <ArcNavigation
              size={size}
              activeIndex={arcNavConfig.activeIndex}
              cardCount={arcNavConfig.cardCount}
              onNavigate={onArcNavigate}
              color={arcNavColor}
            />
          )}
        </svg>
      )}

      {/* Core content — circular content zone with container queries.
          4% inset = 92% content zone. Parent circle clips naturally —
          no inscribed rectangle needed. Content flows within the circle. */}
      <div
        className="@container absolute flex flex-col overflow-hidden"
        style={{
          top: '4%',
          left: '4%',
          width: '92%',
          height: '92%',
        }}
      >
        {children}
      </div>
    </div>
  );
}
