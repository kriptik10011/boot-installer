/**
 * Cross-Feature Intelligence Hook (Simplified — Phase A5)
 *
 * Fetches fully computed cross-feature intelligence from backend.
 * All pattern detection (busy week, spending anomaly, etc.) happens server-side.
 * Welford's spending model persists to IntelligenceModel DB table.
 */

import { useQuery } from '@tanstack/react-query';
import { getCurrentWeekStart } from './usePatterns';
import { useBackendReady } from './useBackendReady';
import { intelligenceApi, intelligenceKeys } from '@/api/intelligence';

// =============================================================================
// TYPES (preserved for consumer compatibility)
// =============================================================================

export interface CrossFeatureInsight {
  type:
    | 'busy_week_meals'
    | 'end_of_month_budget'
    | 'light_week_opportunity'
    | 'routine_disruption'
    | 'weekend_prep'
    | 'spending_anomaly'
    | 'rent_cash_flow'
    | 'lease_expiry_planning';
  message: string;
  reasoning: string;
  confidence: number;
  affectedFeatures: ('events' | 'meals' | 'finances' | 'property')[];
  suggestion: string | null;
  priority: 1 | 2 | 3 | 4 | 5;
}

export interface CrossFeatureIntelligence {
  insights: CrossFeatureInsight[];
  weekCharacter: 'light' | 'balanced' | 'busy' | 'overloaded';
  isLearning: boolean;
  isLoading: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

export function useCrossFeatureIntelligence(): CrossFeatureIntelligence {
  const weekStart = getCurrentWeekStart();
  const backendReady = useBackendReady();

  const { data: intel, isLoading } = useQuery({
    queryKey: intelligenceKeys.crossFeature(weekStart),
    queryFn: () => intelligenceApi.getCrossFeature(weekStart),
    staleTime: 60_000,
    enabled: backendReady && !!weekStart,
  });

  return {
    insights: (intel?.insights as CrossFeatureInsight[]) ?? [],
    weekCharacter: (intel?.weekCharacter as CrossFeatureIntelligence['weekCharacter']) ?? 'balanced',
    isLearning: (intel?.isLearning as boolean) ?? true,
    isLoading,
  };
}
