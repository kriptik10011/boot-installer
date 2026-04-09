/**
 * useAuroraIntelligence — Composite hook for Aurora Glass dashboard intelligence.
 *
 * Combines all 7 intelligence modules into a single interface:
 * - Health score -> aurora palette selection
 * - Spending velocity -> category narratives
 * - Bill predictions -> predicted bills with trust borders
 * - Cross-feature intelligence -> insight strip
 * - Observation learning -> suppression filtering
 */

import { useMemo } from 'react';
import { useHealthScore } from '@/hooks/useFinanceV2';
import { useBillPredictions, useSpendingVelocity as usePredictionVelocity } from '@/hooks/usePredictions';
import { useCrossFeatureIntelligence, type CrossFeatureInsight } from '@/hooks/useCrossFeatureIntelligence';
import { useSuppressedPatterns } from '@/hooks/useObservations';
import { getAuroraPaletteFromHealth, type AuroraPalette, type AuroraPaletteId } from '@/utils/auroraTheme';

export interface AuroraIntelligence {
  /** Current palette derived from health score */
  palette: AuroraPalette;
  paletteId: AuroraPaletteId;
  /** Health score (0-100) */
  healthScore: number;
  /** Health label for display */
  healthLabel: string;
  /** Cross-feature insights (filtered by suppression) */
  insights: CrossFeatureInsight[];
  /** Predicted bills with confidence */
  predictedBills: Array<{
    id: number;
    description: string;
    predicted_amount: number;
    predicted_date: string;
    confidence: number;
  }>;
  /** Whether data is still loading */
  isLoading: boolean;
}

export function useAuroraIntelligence(): AuroraIntelligence {
  const { data: health, isLoading: healthLoading } = useHealthScore();
  const { data: predictions } = useBillPredictions(14);
  const crossFeature = useCrossFeatureIntelligence();
  const { data: suppressed } = useSuppressedPatterns();

  const healthScore = health?.total_score ?? 75;
  const palette = getAuroraPaletteFromHealth(healthScore);

  // Filter insights by suppression patterns
  const insights = useMemo(() => {
    if (!crossFeature.insights?.length) return [];
    const suppressedList = suppressed?.suppressed ?? [];
    if (!suppressedList.length) return crossFeature.insights;

    const suppressedTypes = new Set(
      suppressedList.map((s) => s.insight_type)
    );

    return crossFeature.insights.filter(
      (insight) => !suppressedTypes.has(insight.type)
    );
  }, [crossFeature.insights, suppressed]);

  // Map bill predictions to a clean format
  const predictedBills = useMemo(() => {
    const preds = predictions?.predictions ?? [];
    if (!preds.length) return [];
    return preds.map((p) => ({
      id: p.recurrence_id,
      description: p.description,
      predicted_amount: p.predicted_amount,
      predicted_date: p.predicted_date,
      confidence: p.confidence,
    }));
  }, [predictions]);

  // Derive health label
  const healthLabel = palette.id === 'healthy' ? 'Healthy'
    : palette.id === 'watchful' ? 'Watchful'
    : palette.id === 'tight' ? 'Tight'
    : 'Over Budget';

  return {
    palette,
    paletteId: palette.id,
    healthScore,
    healthLabel,
    insights,
    predictedBills,
    isLoading: healthLoading || crossFeature.isLoading,
  };
}
