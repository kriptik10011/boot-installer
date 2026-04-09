/**
 * CookingConfidenceBadge — Shows estimated cooking time with trust border.
 *
 * Research basis: Reference Class Forecasting — use actual cooking history
 * to counter planning fallacy. Neurodivergent-first — time externalization
 * combats time blindness.
 *
 * "~35 min (4x)" = estimated 35 min, cooked 4 times before
 * "New recipe" = never cooked, dotted border (low confidence)
 */

import { getTrustBorderClasses } from '@/utils/trustVisualization';

interface CookingConfidenceBadgeProps {
  cookTimeMinutes: number | null;
  cookCount: number;
}

function cookCountToConfidence(count: number): number {
  if (count === 0) return 0.3;
  if (count === 1) return 0.5;
  if (count === 2) return 0.65;
  return Math.min(1, 0.7 + count * 0.05);
}

export function CookingConfidenceBadge({ cookTimeMinutes, cookCount }: CookingConfidenceBadgeProps) {
  const confidence = cookCountToConfidence(cookCount);
  const borderClasses = getTrustBorderClasses(confidence, 'border-slate-600/50');

  if (cookCount === 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${borderClasses} text-slate-500`}>
        New recipe
      </span>
    );
  }

  const timeLabel = cookTimeMinutes ? `~${cookTimeMinutes}min` : '';
  const countLabel = cookCount >= 3 ? `${cookCount}x` : '';
  const display = [timeLabel, countLabel].filter(Boolean).join(' ');

  if (!display) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${borderClasses} text-slate-400`}>
      {display}
    </span>
  );
}

export { cookCountToConfidence };
