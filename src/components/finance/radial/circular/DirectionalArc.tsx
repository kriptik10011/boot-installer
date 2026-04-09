/**
 * DirectionalArc — Reusable SVG component for directional progress arcs.
 *
 * Convention:
 *   CW  = depletion / loss  (sweeps through bottom 180°)
 *   CCW = gain / growth      (sweeps through top 180°)
 *
 * Default start: 3 o'clock (0°, east).
 * Finance losses: CW from 0° through 90° (6 o'clock) to 180° (9 o'clock).
 * Inventory expiry: starts at 180° (9 o'clock), CW through 270° to 360° (3 o'clock).
 */

import { RING_TRACK_COLOR } from '../cardTemplate';

interface DirectionalArcProps {
  /** Fill amount 0-1 (0 = empty, 1 = full 180°) */
  value: number;
  /** Start angle in degrees. 0 = 3 o'clock (east). Default: 0 */
  startAngle?: number;
  /** Direction of fill. 'cw' = clockwise, 'ccw' = counter-clockwise */
  direction?: 'cw' | 'ccw';
  /** Arc color */
  color: string;
  /** Track (unfilled) color */
  trackColor?: string;
  /** SVG viewBox size (square). Default: 100 */
  size?: number;
  /** Stroke width. Default: 6 */
  strokeWidth?: number;
  /** Radius as fraction of half-size. Default: 0.88 */
  radiusFraction?: number;
  /** Optional className for the SVG element */
  className?: string;
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

export function DirectionalArc({
  value,
  startAngle = 0,
  direction = 'cw',
  color,
  trackColor = RING_TRACK_COLOR,
  size = 100,
  strokeWidth = 6,
  radiusFraction = 0.88,
  className,
}: DirectionalArcProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * radiusFraction - strokeWidth / 2;
  const clampedValue = Math.max(0, Math.min(1, value));

  // Full sweep is 180° in the specified direction
  const trackSweep = direction === 'cw' ? 180 : -180;
  const fillSweep = trackSweep * clampedValue;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
    >
      {/* Track (background arc) */}
      <path
        d={arcPathD(cx, cy, r, startAngle, trackSweep)}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Filled arc */}
      {Math.abs(fillSweep) > 0.01 && (
        <path
          d={arcPathD(cx, cy, r, startAngle, fillSweep)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
