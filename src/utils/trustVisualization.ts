/**
 * Trust Visualization Utilities
 *
 * Glass Box principle: solid borders = high confidence (user-confirmed or >=0.7),
 * dashed borders = low confidence (<0.7, AI suggestion).
 *
 * Extracted from InsightCard.tsx:137-138 for consistency across all AI surfaces.
 */

/** Confidence threshold for "high confidence" treatment */
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Returns Tailwind border classes based on confidence level.
 * High confidence (>=0.7): solid border with full opacity.
 * Low confidence (<0.7): dashed border with reduced opacity.
 */
export function getTrustBorderClasses(confidence: number, baseColor: string): string {
  const isHighConfidence = confidence >= HIGH_CONFIDENCE_THRESHOLD;
  if (isHighConfidence) {
    return `border ${baseColor}`;
  }
  return `border border-dashed ${baseColor} opacity-90`;
}

/**
 * Returns opacity class based on confidence level.
 */
export function getTrustOpacity(confidence: number): string {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return '';
  if (confidence >= 0.5) return 'opacity-90';
  return 'opacity-80';
}

/**
 * Maps a pace ratio (spending velocity) to a 0-1 confidence value.
 * A pace_ratio of 1.0 = perfectly on track = highest confidence.
 * Further from 1.0 = less certain about the projection.
 */
export function paceRatioToConfidence(paceRatio: number): number {
  return Math.min(1, Math.max(0, 1 - Math.abs(1 - paceRatio) * 0.5));
}
