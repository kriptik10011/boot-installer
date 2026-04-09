/**
 * DonutRing — SVG donut chart with labeled segments.
 *
 * Renders proportional arc segments around a ring with optional center content.
 * Research: donut arcs are <220ms per visual comparison — fastest circular viz.
 *
 * Usage:
 *   <DonutRing segments={[{ value: 40, color: '#4ade80', label: 'Food' }, ...]} />
 */

import { type ReactNode } from 'react';
import { RING_TRACK_COLOR } from '../cardTemplate';

export interface DonutSegment {
  /** Segment value (proportional — will be normalized to sum) */
  value: number;
  /** Segment color */
  color: string;
  /** Accessible label */
  label?: string;
}

interface DonutRingProps {
  /** Segments with proportional values */
  segments: DonutSegment[];
  /** Content rendered in the center of the donut (HTML via foreignObject) */
  centerContent?: ReactNode;
  /** SVG viewBox size (square). Default: 100 */
  size?: number;
  /** Ring stroke width. Default: 8 */
  strokeWidth?: number;
  /** Radius as fraction of half-size. Default: 0.72 */
  radiusFraction?: number;
  /** Gap between segments in degrees. Default: 2 */
  gapDeg?: number;
  /** Track color for empty ring. Default: slate-700/30 */
  trackColor?: string;
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
  if (sweepDeg < 0.01) return '';

  // Clamp to avoid full-circle rendering issues
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

export function DonutRing({
  segments,
  centerContent,
  size = 100,
  strokeWidth = 5,
  radiusFraction = 0.72,
  gapDeg = 2,
  trackColor = RING_TRACK_COLOR,
  className,
  startAngle = -90,
}: DonutRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * radiusFraction;

  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const totalGap = segments.length > 1 ? gapDeg * segments.length : 0;
  const availableDeg = 360 - totalGap;

  // Center content zone: inscribed square inside the donut hole
  const innerR = r - strokeWidth / 2;
  const centerSize = innerR * Math.SQRT2; // inscribed square in inner circle
  const centerOffset = (size - centerSize) / 2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={segments.map((s) => `${s.label ?? ''}: ${s.value}`).join(', ')}
    >
      {/* Track ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />

      {/* Segments */}
      {total > 0 &&
        (() => {
          let currentAngle = startAngle;
          return segments.map((segment, i) => {
            if (segment.value <= 0) return null;
            const sweepDeg = (segment.value / total) * availableDeg;
            const path = arcPathD(cx, cy, r, currentAngle, sweepDeg);
            currentAngle += sweepDeg + gapDeg;
            return (
              <path
                key={i}
                d={path}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              >
                {segment.label && <title>{segment.label}: {segment.value}</title>}
              </path>
            );
          });
        })()}

      {/* Center content via foreignObject */}
      {centerContent && (
        <foreignObject
          x={centerOffset}
          y={centerOffset}
          width={centerSize}
          height={centerSize}
        >
          <div
            className="flex items-center justify-center w-full h-full"
            style={{ fontSize: size * 0.12 }}
          >
            {centerContent}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
