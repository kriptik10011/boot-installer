/**
 * ProgressRing — Single circular progress arc (0-360°).
 *
 * Used for individual goal tracking, health scores, and countdown timers.
 * Renders a ring that fills clockwise from 12 o'clock by default.
 *
 * For savings goals, health scores — simple 0-100% representation.
 * For countdown timers — value depletes from 1 to 0 over time.
 */

import { type ReactNode } from 'react';
import { RING_TRACK_COLOR } from '../cardTemplate';

interface ProgressRingProps {
  /** Fill amount 0-1 */
  value: number;
  /** Ring color */
  color: string;
  /** Track (unfilled) color */
  trackColor?: string;
  /** SVG viewBox size (square). Default: 100 */
  size?: number;
  /** Ring stroke width. Default: 6 */
  strokeWidth?: number;
  /** Radius as fraction of half-size. Default: 0.8 */
  radiusFraction?: number;
  /** Start angle in degrees (0 = 3 o'clock). Default: -90 (12 o'clock) */
  startAngle?: number;
  /** Content in the center (HTML via foreignObject) */
  centerContent?: ReactNode;
  /** Label text below the ring (rendered inside SVG) */
  label?: string;
  /** Label color. Default: #94a3b8 (slate-400) */
  labelColor?: string;
  /** Optional className */
  className?: string;
}

export function ProgressRing({
  value,
  color,
  trackColor = RING_TRACK_COLOR,
  size = 100,
  strokeWidth = 4,
  radiusFraction = 0.8,
  startAngle = -90,
  centerContent,
  label,
  labelColor = '#94a3b8',
  className,
}: ProgressRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * radiusFraction - strokeWidth / 2;
  const circumference = 2 * Math.PI * r;
  const clampedValue = Math.max(0, Math.min(1, value));
  const offset = circumference - clampedValue * circumference;

  // Center content zone
  const innerR = r - strokeWidth / 2;
  const centerSize = innerR * Math.SQRT2 * 0.95; // inscribed square with minimal padding
  const centerOffset = (size - centerSize) / 2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={label ? `${label}: ${Math.round(clampedValue * 100)}%` : `${Math.round(clampedValue * 100)}%`}
    >
      {/* Track circle */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />

      {/* Progress arc */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(${startAngle} ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />

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

      {/* Optional label */}
      {label && (
        <text
          x={cx}
          y={size - strokeWidth}
          textAnchor="middle"
          fill={labelColor}
          fontSize={size * 0.09}
          fontFamily="system-ui"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
