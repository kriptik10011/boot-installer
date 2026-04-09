/**
 * SegmentRing — N-segment arc ring SVG component.
 *
 * Renders equal arc segments around a ring with per-segment fill values.
 * Used for week day rings (7 segments), cooking history, etc.
 *
 * Each segment's fill is represented by opacity/color intensity.
 * Active segment gets highlighted with full color + thicker stroke.
 */

import { type ReactNode } from 'react';
import { RING_TRACK_COLOR } from '../cardTemplate';

export interface SegmentData {
  /** Fill value 0-1 (controls opacity/color intensity) */
  fill: number;
  /** Optional per-segment color override */
  color?: string;
  /** Accessible label */
  label?: string;
}

interface SegmentRingProps {
  /** Segment data (fill values, optional colors) */
  segments: SegmentData[];
  /** Index of the currently active/highlighted segment (-1 = none) */
  activeIndex?: number;
  /** Default color for filled segments */
  color?: string;
  /** Active segment highlight color */
  activeColor?: string;
  /** Track (unfilled) color */
  trackColor?: string;
  /** SVG viewBox size (square). Default: 100 */
  size?: number;
  /** Ring stroke width. Default: 8 */
  strokeWidth?: number;
  /** Radius as fraction of half-size. Default: 0.82 */
  radiusFraction?: number;
  /** Gap between segments in degrees. Default: 4 */
  gapDeg?: number;
  /** Content in the center (HTML via foreignObject) */
  centerContent?: ReactNode;
  /** Optional className */
  className?: string;
  /** Start angle in degrees (0 = 3 o'clock). Default: -90 (12 o'clock) */
  startAngle?: number;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function arcPathD(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  sweepDeg: number,
): string {
  if (sweepDeg < 0.1) return '';
  const clampedSweep = Math.min(sweepDeg, 359.99);
  const startRad = degToRad(startDeg);
  const endRad = degToRad(startDeg + clampedSweep);

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const largeArc = clampedSweep > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export function SegmentRing({
  segments,
  activeIndex = -1,
  color = '#38bdf8',
  activeColor = '#38bdf8',
  trackColor = RING_TRACK_COLOR,
  size = 100,
  strokeWidth = 4,
  radiusFraction = 0.82,
  gapDeg = 4,
  centerContent,
  className,
  startAngle = -90,
}: SegmentRingProps) {
  const n = segments.length;
  if (n === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * radiusFraction;
  const totalGap = gapDeg * n;
  const segmentSweep = (360 - totalGap) / n;

  // Center content zone
  const innerR = r - strokeWidth / 2;
  const centerSize = innerR * Math.SQRT2 * 0.95;
  const centerOffset = (size - centerSize) / 2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={segments.map((s, i) => `${s.label ?? `Segment ${i + 1}`}: ${Math.round(s.fill * 100)}%`).join(', ')}
    >
      {segments.map((seg, i) => {
        const segStart = startAngle + i * (segmentSweep + gapDeg);
        const isActive = i === activeIndex;
        const segColor = seg.color ?? color;
        const fillOpacity = Math.max(0.15, Math.min(1, seg.fill));

        return (
          <g key={i}>
            {/* Track arc */}
            <path
              d={arcPathD(cx, cy, r, segStart, segmentSweep)}
              fill="none"
              stroke={trackColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Filled arc */}
            {seg.fill > 0 && (
              <path
                d={arcPathD(cx, cy, r, segStart, segmentSweep)}
                fill="none"
                stroke={isActive ? activeColor : segColor}
                strokeWidth={isActive ? strokeWidth + 2 : strokeWidth}
                strokeLinecap="round"
                strokeOpacity={isActive ? 1 : fillOpacity}
              >
                {seg.label && <title>{seg.label}: {Math.round(seg.fill * 100)}%</title>}
              </path>
            )}
          </g>
        );
      })}

      {/* Center content via foreignObject */}
      {centerContent && (
        <foreignObject
          x={centerOffset}
          y={centerOffset}
          width={centerSize}
          height={centerSize}
        >
          <div className="flex items-center justify-center w-full h-full">
            {centerContent}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
