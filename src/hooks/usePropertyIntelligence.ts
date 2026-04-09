/**
 * Property Intelligence Hook
 *
 * Surfaces property management intelligence:
 * - Vacancy trend analysis (EWMA)
 * - Maintenance cost forecasting
 * - Rent collection health
 * - Portfolio scoring (weighted composite)
 * - Lease expiry warnings
 *
 * Per UX Decisions:
 * - Glass Box: All insights include reasoning
 * - No-Shame: Neutral framing for underperformance
 * - Confidence Threshold: 0.5 minimum to surface
 */

import { useQuery } from '@tanstack/react-query';
import {
  propertyApi,
  type PropertyIntelligenceResponse,
  type PortfolioScoreResponse,
  type VacancyTrendResponse,
  type MaintenanceForecastResponse,
  type PropertyInsightItem,
} from '@/api/property';

// =============================================================================
// QUERY KEYS
// =============================================================================

export const propertyIntelligenceKeys = {
  all: ['propertyIntelligence'] as const,
  intelligence: (id: number) => [...propertyIntelligenceKeys.all, 'intelligence', id] as const,
  vacancyTrend: (id: number) => [...propertyIntelligenceKeys.all, 'vacancy', id] as const,
  maintenanceForecast: (id: number) => [...propertyIntelligenceKeys.all, 'maintenance', id] as const,
  portfolioScore: () => [...propertyIntelligenceKeys.all, 'portfolio'] as const,
};

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Full intelligence for a single property.
 * Returns vacancy, maintenance, collection, and insight array.
 */
export function usePropertyIntelligence(propertyId: number | null) {
  return useQuery({
    queryKey: propertyIntelligenceKeys.intelligence(propertyId ?? 0),
    queryFn: () => propertyApi.getPropertyIntelligence(propertyId!),
    enabled: propertyId !== null && propertyId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Vacancy trend for a single property (EWMA on vacancy durations).
 */
export function useVacancyTrend(propertyId: number | null) {
  return useQuery({
    queryKey: propertyIntelligenceKeys.vacancyTrend(propertyId ?? 0),
    queryFn: () => propertyApi.getVacancyTrend(propertyId!),
    enabled: propertyId !== null && propertyId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Maintenance cost forecast for a single property (EWMA on monthly spend).
 */
export function useMaintenanceForecast(propertyId: number | null) {
  return useQuery({
    queryKey: propertyIntelligenceKeys.maintenanceForecast(propertyId ?? 0),
    queryFn: () => propertyApi.getMaintenanceForecast(propertyId!),
    enabled: propertyId !== null && propertyId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Portfolio-wide intelligence score (0-100).
 * Weighted composite: vacancy, collection, maintenance, NOI.
 */
export function usePortfolioScore() {
  return useQuery({
    queryKey: propertyIntelligenceKeys.portfolioScore(),
    queryFn: () => propertyApi.getPortfolioScore(),
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// DERIVED
// =============================================================================

/**
 * Filter insights by minimum confidence level.
 * Per Intelligence Principles: 0.5 minimum for surfacing.
 */
export function filterInsightsByConfidence(
  intelligence: PropertyIntelligenceResponse | undefined,
  minConfidence: number = 0.5
): PropertyInsightItem[] {
  if (!intelligence) return [];

  // Only surface insights if we have sufficient data confidence
  const avgConfidence =
    (intelligence.vacancy.confidence +
      intelligence.maintenance.confidence +
      intelligence.collection.confidence) / 3;

  if (avgConfidence < minConfidence) return [];

  return intelligence.insights;
}

// Re-export types for convenience
export type {
  PropertyIntelligenceResponse,
  PortfolioScoreResponse,
  VacancyTrendResponse,
  MaintenanceForecastResponse,
  PropertyInsightItem,
};
