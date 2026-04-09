/**
 * HealthPulseCard — Hero card (2-col span) showing financial health score.
 * Large ring + narrative text. F-Pattern: top-left hero position.
 * Enhanced with anomaly pulse for critical health drops.
 */

import { RadialGlassCard } from './RadialGlassCard';

interface HealthPulseCardProps {
  healthScore: number;
  cardId?: string;
  isBlurred?: boolean;
  opacity?: number;
  scale?: number;
  onFocus?: (cardId: string) => void;
}

function getHealthNarrative(score: number): string {
  if (score > 85) return "Excellent financial health. All systems green — savings growing, spending on track, and goals progressing steadily.";
  if (score > 70) return "Good shape overall. A few areas to keep an eye on, but your finances are trending in the right direction.";
  if (score > 50) return "Some areas need attention. Review your spending categories and upcoming bills to stay on track.";
  if (score > 25) return "Budget is tight. Consider reducing discretionary spending and reviewing recurring subscriptions.";
  return "Immediate attention needed. Multiple financial metrics require review. Focus on essentials first.";
}

function getHealthLabel(score: number): string {
  if (score > 85) return 'Excellent';
  if (score > 70) return 'Good';
  if (score > 50) return 'Fair';
  if (score > 25) return 'Tight';
  return 'Critical';
}

export function HealthPulseCard({ healthScore, cardId, isBlurred, opacity, scale, onFocus }: HealthPulseCardProps) {
  const circumference = 2 * Math.PI * 64;
  const filled = (healthScore / 100) * circumference;
  const scoreColor = healthScore > 75 ? '#22d3ee' : healthScore > 50 ? '#3b82f6' : healthScore > 25 ? '#f59e0b' : '#d97706';
  const hasAnomaly = healthScore < 30;

  return (
    <RadialGlassCard
      accentColor="#22d3ee"
      colSpan={2}
      cardId={cardId}
      isBlurred={isBlurred}
      opacity={opacity}
      scale={scale}
      hasAnomaly={hasAnomaly}
      onFocus={onFocus}
    >
      <div className="flex items-center gap-8">
        <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
          <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
            <circle cx="80" cy="80" r="64" fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle
              cx="80" cy="80" r="64"
              fill="none"
              stroke={scoreColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - filled}
              style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
            {/* Pulse animation ring for low scores */}
            {hasAnomaly && (
              <circle
                cx="80" cy="80" r="72"
                fill="none"
                stroke={scoreColor}
                strokeWidth="1"
                opacity="0.4"
              >
                <animate attributeName="r" values="68;76;68" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-slate-100" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
              {healthScore}
            </span>
            <span className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">
              {getHealthLabel(healthScore)}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider mb-2">Financial Pulse</h2>
          <p className="text-sm text-slate-300 leading-relaxed">{getHealthNarrative(healthScore)}</p>
        </div>
      </div>
    </RadialGlassCard>
  );
}
