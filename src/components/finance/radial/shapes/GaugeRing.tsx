/**
 * GaugeRing — Circular progress indicator rendered as an SVG ring.
 * Pure props, cqi-responsive. Used for shopping progress, goal completion.
 */

import { RING_TRACK_COLOR } from '../cardTemplate';

interface GaugeRingProps {
  progress: number;
  color?: string;
  trackColor?: string;
  /** SVG viewBox coordinate space — not rendered pixel size (width="100%" makes it fluid) */
  size?: number;
  strokeWidth?: number;
  /** Compact mode for inline/row rendering — smaller maxWidth */
  compact?: boolean;
  /** Optional label rendered below the ring */
  label?: string;
  className?: string;
}

export function GaugeRing({
  progress,
  color = '#94a3b8',
  trackColor = RING_TRACK_COLOR,
  size = 80,
  strokeWidth = 6,
  compact = false,
  label,
  className,
}: GaugeRingProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  const maxDim = compact ? '10cqi' : '20cqi';

  return (
    <div className={`flex flex-col items-center ${className ?? ''}`} style={{ gap: '0.3cqi' }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        style={{ maxWidth: maxDim, maxHeight: maxDim }}
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      {label != null && (
        <span className="text-slate-400 text-center truncate" style={{ fontSize: compact ? '1.5cqi' : '2cqi', maxWidth: maxDim }}>
          {label}
        </span>
      )}
    </div>
  );
}
