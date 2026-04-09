/**
 * Surfacing Layer — Barrel re-exports.
 *
 * All public API preserved for backward compatibility.
 * Import from '@/utils/surfacing' or '@/utils/surfacing.ts' (old path redirects here).
 */

// Types
export type {
  SurfacingDecision,
  DismissalRecord,
  SurfacingContext,
  EscalationLevel,
  DeferredInsight,
  AcceptanceRecord,
  InsufficientDataInfo,
} from './types';

// Interruption Calculus + Escalation
export { shouldSurfaceInsight, getEscalationLevel, getEscalationDescription } from './calculus';

// Storage (dismissals, acceptances, deferral queue)
export {
  loadDismissals,
  saveDismissals,
  recordDismissal,
  clearDismissal,
  clearAllDismissals,
  loadAcceptances,
  recordAcceptance,
  getTrustScoreData,
  clearAllAcceptances,
  loadDeferredInsights,
  saveDeferredInsights,
  deferInsight,
  checkOpportuneMoment,
  clearDeferredInsight,
  clearAllDeferredInsights,
} from './storage';

// Helpers (icons, colors, insufficient data)
export { getInsufficientDataInfo, getInsightIcon, getInsightColor } from './helpers';
