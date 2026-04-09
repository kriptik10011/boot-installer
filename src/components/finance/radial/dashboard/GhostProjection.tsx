/**
 * GhostProjection — Dashed trend extrapolation line for sparkline charts.
 * Takes the last few data points and projects forward using linear regression.
 * Renders as a dashed line with fading opacity.
 */

interface GhostProjectionProps {
  /** Historical data points (y-values) */
  values: number[];
  /** Chart dimensions */
  width: number;
  height: number;
  /** How many points to project forward */
  projectionPoints?: number;
  /** Line color */
  color: string;
  /** Y-axis bounds */
  min: number;
  max: number;
}

export function GhostProjection({
  values,
  width,
  height,
  projectionPoints = 3,
  color,
  min,
  max,
}: GhostProjectionProps) {
  if (values.length < 3) return null;

  const range = max - min || 1;
  const n = values.length;

  // Simple linear regression on last 5 points (or fewer)
  const window = Math.min(5, n);
  const tail = values.slice(n - window);
  const sumX = tail.reduce((acc, _, i) => acc + i, 0);
  const sumY = tail.reduce((acc, v) => acc + v, 0);
  const sumXY = tail.reduce((acc, v, i) => acc + i * v, 0);
  const sumX2 = tail.reduce((acc, _, i) => acc + i * i, 0);

  const denom = window * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 0.001) return null;

  const slope = (window * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / window;

  // Generate projected points
  const lastX = (n - 1) / (n - 1 + projectionPoints) * width;
  const lastY = height - ((values[n - 1] - min) / range) * height;

  const projectedPath = Array.from({ length: projectionPoints + 1 }, (_, i) => {
    const dataIdx = n - 1 + i;
    const x = (dataIdx / (n - 1 + projectionPoints)) * width;
    const projectedValue = intercept + slope * (window - 1 + i);
    const clampedValue = Math.max(min, Math.min(max * 1.5, projectedValue));
    const y = height - ((clampedValue - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <g>
      {/* Ghost projection line */}
      <path
        d={projectedPath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray="4 3"
        strokeLinecap="round"
        opacity={0.4}
      />
      {/* Confidence cone (subtle area) */}
      <defs>
        <linearGradient id="ghost-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </g>
  );
}
