/**
 * CountdownRing — Concentric depleting countdown rings.
 *
 * Up to N concentric rings that deplete as time runs out.
 * Color shifts from green -> amber as time decreases (no red text per convention).
 * Used by ExpiringCard (inventory expiry) and MealsOverviewCard (meal countdown).
 */

import { type ReactNode } from 'react';
import { RING_TRACK_COLOR } from '../cardTemplate';

export interface CountdownItem {
  /** Display label */
  label: string;
  /** Time remaining (units don't matter — ratio is what counts) */
  timeLeft: number;
  /** Maximum time (for computing fill ratio) */
  maxTime: number;
  /** Optional color override (defaults to urgency-based auto-color) */
  color?: string;
}

interface CountdownRingProps {
  /** Items to display as concentric rings (outermost first) */
  items: CountdownItem[];
  /** Maximum rings to show. Default: 3 */
  maxRings?: number;
  /** SVG viewBox size (square). Default: 100 */
  size?: number;
  /** Outermost ring stroke width. Default: 6 */
  strokeWidth?: number;
  /** Radius of outermost ring as fraction of half-size. Default: 0.85 */
  radiusFraction?: number;
  /** Gap between concentric rings. Default: 3 */
  ringGap?: number;
  /** Track color. Default: rgba(51, 65, 85, 0.3) */
  trackColor?: string;
  /** Content in the center (HTML via foreignObject) */
  centerContent?: ReactNode;
  /** Optional className */
  className?: string;
  /** Start angle in degrees (0 = 3 o'clock). Default: -90 (12 o'clock) */
  startAngle?: number;
}

/** Returns urgency color based on fill ratio (1 = full, 0 = empty). No red text per convention. */
function urgencyColor(ratio: number): string {
  if (ratio > 0.6) return '#4ade80';  // green — plenty of time
  if (ratio > 0.3) return '#fbbf24';  // amber — getting close
  return '#d97706';                    // dark amber — urgent (NOT red)
}

export function CountdownRing({
  items,
  maxRings = 3,
  size = 100,
  strokeWidth = 6,
  radiusFraction = 0.85,
  ringGap = 3,
  trackColor = RING_TRACK_COLOR,
  centerContent,
  className,
  startAngle = -90,
}: CountdownRingProps) {
  const visibleItems = items.slice(0, maxRings);
  if (visibleItems.length === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size / 2) * radiusFraction;

  // Compute innermost ring radius for center content sizing
  const innerMostR = outerR - (visibleItems.length - 1) * (strokeWidth + ringGap) - strokeWidth / 2;
  const centerSize = Math.max(0, innerMostR * Math.SQRT2 * 0.8);
  const centerOffset = (size - centerSize) / 2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={visibleItems.map((item) => {
        const ratio = item.maxTime > 0 ? item.timeLeft / item.maxTime : 0;
        return `${item.label}: ${Math.round(ratio * 100)}% remaining`;
      }).join(', ')}
    >
      {visibleItems.map((item, i) => {
        const r = outerR - i * (strokeWidth + ringGap);
        const circumference = 2 * Math.PI * r;
        const ratio = item.maxTime > 0 ? Math.max(0, Math.min(1, item.timeLeft / item.maxTime)) : 0;
        const offset = circumference - ratio * circumference;
        const ringColor = item.color ?? urgencyColor(ratio);

        return (
          <g key={i}>
            {/* Track circle */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={trackColor}
              strokeWidth={strokeWidth}
            />
            {/* Filled arc */}
            {ratio > 0 && (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={ringColor}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(${startAngle} ${cx} ${cy})`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              >
                <title>{item.label}: {Math.round(ratio * 100)}% remaining</title>
              </circle>
            )}
          </g>
        );
      })}

      {/* Center content via foreignObject */}
      {centerContent && centerSize > 10 && (
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
