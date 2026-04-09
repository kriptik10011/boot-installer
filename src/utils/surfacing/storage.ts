/**
 * Surfacing Storage — localStorage persistence for dismissals, acceptances, and deferral queue.
 *
 * All surfacing state is persisted to localStorage for cross-session memory.
 */

import type { DismissalRecord, DeferredInsight, AcceptanceRecord, EscalationLevel } from './types';
import type { Insight } from '@/api/client';
import { config } from '@/config';
import { getAuthHeaders } from '@/api/core';

// =============================================================================
// STORAGE KEYS
// =============================================================================

const DISMISSALS_STORAGE_KEY = 'weekly-review-dismissals';
const ACCEPTANCES_STORAGE_KEY = 'weekly-review-acceptances';
const DEFERRAL_STORAGE_KEY = 'weekly-review-deferred-insights';
const DEFAULT_DEFERRAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes max deferral

// =============================================================================
// DISMISSAL MANAGEMENT
// =============================================================================

/**
 * Load dismissal records from localStorage.
 */
export function loadDismissals(): DismissalRecord[] {
  try {
    const stored = localStorage.getItem(DISMISSALS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as DismissalRecord[];
  } catch {
    return [];
  }
}

/**
 * Save dismissal records to localStorage.
 */
export function saveDismissals(dismissals: DismissalRecord[]): void {
  try {
    localStorage.setItem(DISMISSALS_STORAGE_KEY, JSON.stringify(dismissals));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Record a dismissal for an insight type.
 *
 * @param insightType - The type of insight being dismissed
 * @param permanent - If true, dismissal lasts 30 days; if false, lasts 1 day
 * @returns Updated list of dismissal records
 */
export function recordDismissal(insightType: string, permanent: boolean = false): DismissalRecord[] {
  const dismissals = loadDismissals();
  const existing = dismissals.find((d) => d.insightType === insightType);

  if (existing) {
    existing.count += 1;
    existing.lastDismissed = new Date().toISOString();
    // Upgrade to permanent if requested (never downgrade)
    if (permanent) {
      existing.permanent = true;
    }
  } else {
    dismissals.push({
      insightType,
      count: 1,
      lastDismissed: new Date().toISOString(),
      permanent,
    });
  }

  saveDismissals(dismissals);

  // Fire-and-forget POST to backend for learning/suppression
  fetch(`${config.api.baseUrl}/observation/insight-dismissed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      insight_type: insightType,
      context: permanent ? 'permanent' : 'global',
    }),
  }).catch(() => {
    // Best-effort — localStorage is the primary store
  });

  return dismissals;
}

/**
 * Clear dismissal for an insight type (user re-enables).
 */
export function clearDismissal(insightType: string): DismissalRecord[] {
  const dismissals = loadDismissals().filter((d) => d.insightType !== insightType);
  saveDismissals(dismissals);
  return dismissals;
}

/**
 * Clear ALL dismissals (reset everything).
 * Used in debug mode to reset the surfacing layer state.
 */
export function clearAllDismissals(): void {
  try {
    localStorage.removeItem(DISMISSALS_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// =============================================================================
// ACCEPTANCE TRACKING (for trust score calculation)
// =============================================================================

/**
 * Load acceptance records from localStorage.
 */
export function loadAcceptances(): AcceptanceRecord[] {
  try {
    const stored = localStorage.getItem(ACCEPTANCES_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as AcceptanceRecord[];
  } catch {
    return [];
  }
}

/**
 * Record an acceptance for an insight type.
 * Called when user clicks the primary action (View Bill, Resolve, etc.)
 */
export function recordAcceptance(insightType: string): AcceptanceRecord[] {
  const acceptances = loadAcceptances();
  const existing = acceptances.find((a) => a.insightType === insightType);

  if (existing) {
    existing.count += 1;
    existing.lastAccepted = new Date().toISOString();
  } else {
    acceptances.push({
      insightType,
      count: 1,
      lastAccepted: new Date().toISOString(),
    });
  }

  try {
    localStorage.setItem(ACCEPTANCES_STORAGE_KEY, JSON.stringify(acceptances));
  } catch {
    // Ignore storage errors
  }

  return acceptances;
}

/**
 * Get total acceptance and dismissal counts for trust score calculation.
 */
export function getTrustScoreData(): {
  acceptedCount: number;
  dismissedCount: number;
  totalInteractions: number;
  acceptanceRate: number;
} {
  const acceptances = loadAcceptances();
  const dismissals = loadDismissals();

  const acceptedCount = acceptances.reduce((sum, a) => sum + a.count, 0);
  const dismissedCount = dismissals.reduce((sum, d) => sum + d.count, 0);
  const totalInteractions = acceptedCount + dismissedCount;

  return {
    acceptedCount,
    dismissedCount,
    totalInteractions,
    acceptanceRate: totalInteractions > 0 ? acceptedCount / totalInteractions : 0.5,
  };
}

/**
 * Clear all acceptance records.
 */
export function clearAllAcceptances(): void {
  try {
    localStorage.removeItem(ACCEPTANCES_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// =============================================================================
// BOUNDED DEFERRAL QUEUE
// =============================================================================

/**
 * Load deferred insights from storage.
 */
export function loadDeferredInsights(): DeferredInsight[] {
  try {
    const stored = localStorage.getItem(DEFERRAL_STORAGE_KEY);
    if (!stored) return [];
    const insights = JSON.parse(stored) as DeferredInsight[];
    // Filter out expired insights
    const now = Date.now();
    return insights.filter((i) => i.deadline > now);
  } catch {
    return [];
  }
}

/**
 * Save deferred insights to storage.
 */
export function saveDeferredInsights(insights: DeferredInsight[]): void {
  try {
    // Filter out expired before saving
    const now = Date.now();
    const valid = insights.filter((i) => i.deadline > now);
    localStorage.setItem(DEFERRAL_STORAGE_KEY, JSON.stringify(valid));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Queue an insight for deferred display.
 *
 * @param insight - The insight to defer
 * @param score - The calculated surfacing score
 * @param escalationLevel - Determined escalation level
 * @param deferralWindowMs - Max time to wait (default: 5 minutes)
 */
export function deferInsight(
  insight: Insight,
  score: number,
  escalationLevel: EscalationLevel,
  deferralWindowMs: number = DEFAULT_DEFERRAL_WINDOW_MS
): void {
  const deferred = loadDeferredInsights();

  // Don't duplicate
  if (deferred.some((d) => d.insight.type === insight.type)) {
    return;
  }

  const now = Date.now();
  deferred.push({
    insight,
    queuedAt: now,
    deadline: now + deferralWindowMs,
    score,
    escalationLevel,
  });

  saveDeferredInsights(deferred);
}

/**
 * Check if there's an opportune moment to show deferred insights.
 *
 * Opportune moments:
 * - User has been idle for 30+ seconds
 * - Natural break (view change, scroll stop)
 * - Deadline approaching
 *
 * @param idleMs - How long user has been idle
 * @returns Insights ready to show (highest priority first)
 */
export function checkOpportuneMoment(idleMs: number): DeferredInsight[] {
  const deferred = loadDeferredInsights();
  if (deferred.length === 0) return [];

  const now = Date.now();
  const readyToShow: DeferredInsight[] = [];

  for (const item of deferred) {
    // Deadline passed - must show now
    if (now >= item.deadline) {
      readyToShow.push(item);
      continue;
    }

    // User is idle (30+ seconds) - good moment
    if (idleMs >= 30000) {
      readyToShow.push(item);
      continue;
    }

    // Within last 30 seconds of deadline - show soon
    if (item.deadline - now < 30000) {
      readyToShow.push(item);
      continue;
    }
  }

  // Sort by score (highest first)
  readyToShow.sort((a, b) => b.score - a.score);

  // Remove shown insights from queue
  if (readyToShow.length > 0) {
    const remaining = deferred.filter(
      (d) => !readyToShow.some((r) => r.insight.type === d.insight.type)
    );
    saveDeferredInsights(remaining);
  }

  return readyToShow;
}

/**
 * Clear a specific deferred insight (user dismissed or acted on it).
 */
export function clearDeferredInsight(insightType: string): void {
  const deferred = loadDeferredInsights().filter((d) => d.insight.type !== insightType);
  saveDeferredInsights(deferred);
}

/**
 * Clear all deferred insights.
 */
export function clearAllDeferredInsights(): void {
  try {
    localStorage.removeItem(DEFERRAL_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
