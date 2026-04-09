/**
 * HeroVital — Giant Safe-to-Spend vital with gradient text, pace narrative,
 * and health indicator pill.
 *
 * Always visible, never compact, never removable.
 * Wraps S2SHero with health-driven gradient and velocity narrative.
 *
 * Design: "One Number Dashboard" — answer "Am I safe?" in <3 seconds.
 */

import { useMemo } from 'react';
import { useSafeToSpend, useSpendingVelocity, useHealthScore } from '@/hooks/useFinanceV2';
import { useAuroraIntelligence } from '@/hooks/useAuroraIntelligence';
import { getNarrativeSentence } from '@/utils/auroraTheme';
import { fmt } from '@/components/finance/classic/FinanceHelpers';

export function HeroVital() {
  const { data: safe } = useSafeToSpend();
  const { data: velocity } = useSpendingVelocity();
  const { data: health } = useHealthScore();
  const { palette } = useAuroraIntelligence();

  const healthScore = health?.total_score ?? 75;

  // Velocity narrative
  const { narrative, paceRatio } = useMemo(() => {
    const overall = velocity?.[0];
    const pr = overall?.pace_ratio ?? 0.8;
    const days = overall?.days_remaining ?? 15;
    return { narrative: getNarrativeSentence(pr, days), paceRatio: pr };
  }, [velocity]);

  // Health pill styling
  const healthPill = useMemo(() => {
    if (healthScore >= 70) return { label: 'Healthy', cls: 'bg-emerald-500/20 text-emerald-400' };
    if (healthScore >= 50) return { label: 'Watchful', cls: 'bg-amber-500/20 text-amber-400' };
    return { label: 'Needs Attention', cls: 'bg-rose-500/20 text-rose-400' };
  }, [healthScore]);

  const amount = safe?.amount ?? null;

  return (
    <div className="text-center py-5 px-4" role="banner" aria-label="Safe to spend summary">
      {/* Giant S2S number with gradient text */}
      <div
        className="text-5xl font-bold leading-tight"
        style={{
          backgroundImage: palette.heroGradient,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
        aria-label={`Safe to spend: ${amount != null ? fmt(amount) : 'unknown'}`}
      >
        {amount != null ? fmt(amount) : '$--'}
      </div>

      {/* Label */}
      <div className="text-sm text-slate-400 mt-1">safe to spend</div>

      {/* Pace narrative */}
      <div className="text-base text-slate-300 mt-1">{narrative}</div>

      {/* Health indicator pill */}
      <div className="flex justify-center mt-2">
        <span className={`text-xs px-2.5 py-0.5 rounded-full ${healthPill.cls}`}>
          {healthPill.label}
        </span>
      </div>
    </div>
  );
}

/**
 * Get pace ratio for external consumers (e.g., FinanceLivingView story logic).
 */
export { getNarrativeSentence };
