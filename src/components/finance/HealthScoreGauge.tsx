/**
 * HealthScoreGauge — SVG ring gauge for financial health.
 *
 * Research basis: Diegetic UI — gauge as environment, not widget.
 * Score drives color: emerald (70+), amber (40-69), dark amber (<40). Never red.
 */

interface HealthScoreGaugeProps {
  score: number;
  size?: number;
}

function scoreToColor(score: number): string {
  if (score >= 70) return '#10b981'; // emerald-500
  if (score >= 40) return '#f59e0b'; // amber-500
  return '#d97706'; // amber-600 (never red, even at risk)
}

function scoreToLabel(score: number): string {
  if (score >= 70) return 'Healthy';
  if (score >= 40) return 'Caution';
  return 'At Risk';
}

export function HealthScoreGauge({ score, size = 80 }: HealthScoreGaugeProps) {
  const normalizedScore = Math.max(0, Math.min(100, score));
  const color = scoreToColor(normalizedScore);
  const label = scoreToLabel(normalizedScore);

  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - normalizedScore / 100);

  const center = size / 2;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-slate-700"
          strokeWidth={6}
        />
        {/* Score ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute" style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-lg font-bold" style={{ color }}>{Math.round(normalizedScore)}</span>
      </div>
      <div>
        <div className="text-xs text-slate-400">Health Score</div>
        <div className="text-xs font-medium" style={{ color }}>{label}</div>
      </div>
    </div>
  );
}

export { scoreToColor, scoreToLabel };
