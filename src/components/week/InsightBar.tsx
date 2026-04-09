/**
 * InsightBar - Mode-Aware Production Insight Display
 *
 * Implements intelligence decisions for insight surfacing:
 * - Living Mode: 1 status glyph, expand on tap, max 2 items
 * - Planning Mode: Up to 5 insight cards, priority-ordered
 * - Empty states per mode
 * - Learning state when confidence < 0.5
 * - Bounded Deferral: Queues insights for opportune moments
 * - Fogarty Signals: Respects user flow state
 *
 * @see intelligence-decisions.md for all cached decisions
 * @see INTELLIGENCE-PRINCIPLES.md v3.0.0
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Insight } from '@/api/client';
import { InsightCard } from './InsightCard';
import {
  shouldSurfaceInsight,
  loadDismissals,
  recordDismissal,
  recordAcceptance,
  getInsufficientDataInfo,
  loadDeferredInsights,
  checkOpportuneMoment,
  deferInsight,
  clearDeferredInsight,
  getEscalationLevel,
  type DismissalRecord,
  type DeferredInsight,
  type SurfacingContext,
} from '@/utils/surfacing';
import {
  useActivityTracking,
  isGoodMomentToSurface,
} from '@/hooks/useActivityTracking';
import { useDndMode } from '@/hooks/useDndMode';
import { useLogDismissal, useLogAction } from '@/hooks/useObservations';

interface InsightBarProps {
  insights: Insight[] | undefined;
  overallConfidence: number;
  isPlanningMode: boolean;
  sessionsCount?: number;
  onInsightAccept?: (insight: Insight) => void;
  /** Insight types already shown by other surfaces (e.g., WeekHealthPanel) */
  suppressedTypes?: string[];
}

/** Extended insight with deferral metadata */
interface SurfacedInsight {
  insight: Insight;
  deferredAt?: number;  // Timestamp when originally deferred
  resurfaceReason?: 'idle' | 'deadline' | 'soon';  // Why it's showing now
}

// Priority ranking from intelligence-decisions.md
// Bills > Conflicts > Patterns > Suggestions
const TYPE_PRIORITY: Record<string, number> = {
  bill_due_soon: 1,
  bill_overdue: 1,
  conflict: 2,
  busy_day: 3,
  pattern_detected: 4,
  meal_gap: 4,
  planning_time: 5,
  spending_high: 5,
  spending_low: 5,
};

function getTypePriority(type: string): number {
  return TYPE_PRIORITY[type] ?? 10;
}

// Get action label based on insight type (Glass Box pattern)
function getActionLabel(type: string): string {
  const labels: Record<string, string> = {
    bill_due_soon: 'Pay now',
    bill_overdue: 'Pay now',
    conflict: 'Resolve',
    busy_day: 'Review',
    pattern_detected: 'See pattern',
    meal_gap: 'Plan meal',
    planning_time: 'Start planning',
    spending_high: 'Review spending',
    spending_low: 'View details',
  };
  return labels[type] ?? 'View';
}

// Create a stable unique ID for each insight based on its content
function createInsightId(insight: Insight): string {
  // Combine type, message hash, and priority to create a unique but stable ID
  const messageHash = insight.message.slice(0, 20).replace(/\s+/g, '-').toLowerCase();
  return `${insight.type}-${insight.priority}-${messageHash}`;
}

export function InsightBar({
  insights,
  overallConfidence,
  isPlanningMode,
  sessionsCount = 0,
  onInsightAccept,
  suppressedTypes = [],
}: InsightBarProps) {
  const [dismissals, setDismissals] = useState<DismissalRecord[]>(() => loadDismissals());
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [deferredInsights, setDeferredInsights] = useState<DeferredInsight[]>(() => loadDeferredInsights());

  // Activity tracking for interruptibility detection (Fogarty signals)
  const activity = useActivityTracking();

  // DND mode for context gate enforcement
  const dndState = useDndMode();

  // Backend observation hooks — track dismissals/actions for pattern confidence learning
  const logDismissal = useLogDismissal();
  const logAction = useLogAction();

  // Check if we're in learning state (confidence < 0.5)
  const isLearning = overallConfidence < 0.5;
  const learningInfo = useMemo(() => {
    if (!isLearning) return null;
    return getInsufficientDataInfo(overallConfidence, sessionsCount);
  }, [isLearning, overallConfidence, sessionsCount]);

  // Check for deferred insights ready to resurface
  useEffect(() => {
    if (isLearning) return;

    // Check if it's a good moment to show deferred insights
    const readyInsights = checkOpportuneMoment(activity.idleMs);

    if (readyInsights.length > 0) {
      // Reload deferred list to stay in sync
      setDeferredInsights(loadDeferredInsights());

    }
  }, [activity.idleMs, isLearning]);

  // Filter and sort insights based on surfacing logic and priority
  // Integrates deferred insights with fresh insights
  const surfaceableInsights = useMemo((): SurfacedInsight[] => {
    if (!insights || isLearning) return [];

    const result: SurfacedInsight[] = [];
    const processedTypes = new Set<string>();

    // First, check for deferred insights ready to show (they take priority)
    const readyDeferred = checkOpportuneMoment(activity.idleMs);
    for (const deferred of readyDeferred) {
      if (sessionDismissed.has(deferred.insight.type)) continue;
      processedTypes.add(deferred.insight.type);

      // Determine resurface reason
      const now = Date.now();
      let resurfaceReason: 'idle' | 'deadline' | 'soon' = 'idle';
      if (now >= deferred.deadline) {
        resurfaceReason = 'deadline';
      } else if (deferred.deadline - now < 30000) {
        resurfaceReason = 'soon';
      }

      result.push({
        insight: deferred.insight,
        deferredAt: deferred.queuedAt,
        resurfaceReason,
      });
    }

    // Build surfacing context with real values from hooks
    const surfacingContext: SurfacingContext = {
      isDndMode: dndState.isDnd,
      isMidTask: activity.isMidTask,
      isPlanningMode,
      lastActivityTimestamp: activity.lastActivity,
    };

    // Then process fresh insights
    for (const insight of insights) {
      // Skip if already processed from deferred queue
      if (processedTypes.has(insight.type)) continue;
      // Skip if dismissed this session
      if (sessionDismissed.has(insight.type)) continue;
      // Skip types already shown by other surfaces (e.g., WeekHealthPanel)
      if (suppressedTypes.includes(insight.type)) continue;

      // Check surfacing decision with full context gates
      const decision = shouldSurfaceInsight(insight, overallConfidence, dismissals, surfacingContext);

      if (decision.shouldShow) {
        // Check interruptibility - if not a good moment, defer non-urgent
        if (!isGoodMomentToSurface(activity) && insight.priority > 2) {
          // Defer this insight for later
          const escalationLevel = getEscalationLevel(insight, overallConfidence);
          deferInsight(insight, decision.score, escalationLevel);

          continue;
        }

        result.push({ insight });
      }
    }

    // Sort by type priority first, then by insight priority
    return result.sort((a, b) => {
      const typeA = getTypePriority(a.insight.type);
      const typeB = getTypePriority(b.insight.type);
      if (typeA !== typeB) return typeA - typeB;
      return a.insight.priority - b.insight.priority;
    });
  }, [insights, overallConfidence, dismissals, sessionDismissed, isLearning, activity, dndState.isDnd, isPlanningMode, suppressedTypes]);

  // Apply mode-specific limits
  // Living: max 1 (critical only — per intelligence decision "1 summary + critical")
  // Planning: max 5
  const visibleInsights = useMemo((): SurfacedInsight[] => {
    const limit = isPlanningMode ? 5 : 1;
    if (!isPlanningMode) {
      // Living mode: only priority 1-2 (critical), max 1 item
      return surfaceableInsights.filter(s => s.insight.priority <= 2).slice(0, limit);
    }
    return surfaceableInsights.slice(0, limit);
  }, [surfaceableInsights, isPlanningMode]);

  // Count for "show all" functionality
  const hiddenCount = surfaceableInsights.length - visibleInsights.length;

  // Handlers
  // Regular dismiss: persists for 1 day (fixes the bug where dismissed insights return after refresh)
  const handleDismiss = useCallback((insightType: string) => {
    const updated = recordDismissal(insightType, false); // false = regular dismissal (1 day)
    setDismissals(updated);
    setSessionDismissed(prev => new Set([...prev, insightType]));
    // Also clear from deferred queue if present
    clearDeferredInsight(insightType);
    // Log to backend for pattern confidence learning
    logDismissal.mutate({ insightType });
  }, [logDismissal]);

  // "Don't ask again": persists for 30 days
  const handleDontAskAgain = useCallback((insightType: string) => {
    const updated = recordDismissal(insightType, true); // true = permanent dismissal (30 days)
    setDismissals(updated);
    setSessionDismissed(prev => new Set([...prev, insightType]));
    // Also clear from deferred queue if present
    clearDeferredInsight(insightType);
    // Log permanent dismissal to backend
    logDismissal.mutate({ insightType, context: 'permanent' });
  }, [logDismissal]);

  // Accept: record acceptance for trust score, then call original handler
  const handleAccept = useCallback((insight: Insight) => {
    // Record acceptance for trust score tracking
    recordAcceptance(insight.type);
    // Also clear from deferred queue
    clearDeferredInsight(insight.type);
    // Log action to backend for confidence boosting
    logAction.mutate({ insightType: insight.type, action: 'accepted' });
    // Call the original handler if provided
    onInsightAccept?.(insight);
  }, [onInsightAccept, logAction]);

  // Determine status for Living mode glyph
  // Per UX principles: NO numeric badges, use ambient messaging instead
  // Only surface insights with confidence >= 0.5
  const getLivingStatus = () => {
    // If still learning patterns, show learning message not "items need attention"
    if (isLearning) {
      return { label: 'Getting to know your patterns...', variant: 'learning' as const };
    }

    // Filter to truly confident critical insights
    const confidentCritical = surfaceableInsights.filter(s =>
      s.insight.priority <= 2 && (s.insight.confidence ?? 1) >= 0.5
    );

    if (confidentCritical.length === 0) {
      return { label: 'All Clear', variant: 'success' as const };
    }

    // Ambient messaging instead of numeric count
    return {
      label: 'Items need attention',
      variant: 'alert' as const,
    };
  };

  // ==========================================================================
  // RENDER: Learning State
  // ==========================================================================
  if (isLearning && learningInfo) {
    // Only show learning state in Planning mode
    if (!isPlanningMode) return null;

    return (
      <div className="px-4 py-3 bg-slate-800/30 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm text-slate-300">{learningInfo.message}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500/50 rounded-full transition-all duration-500"
              style={{ width: `${learningInfo.progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">{learningInfo.progressPercent}%</span>
        </div>
        {learningInfo.neededData.length > 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {learningInfo.neededData[0]}
          </p>
        )}
      </div>
    );
  }

  // ==========================================================================
  // RENDER: Living Mode (Collapsed Status Glyph)
  // ==========================================================================
  if (!isPlanningMode) {
    const status = getLivingStatus();

    // Learning state in Living Mode: subtle indicator, not "Items need attention"
    if (status.variant === 'learning') {
      return (
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm text-slate-400">{status.label}</span>
        </div>
      );
    }

    // Empty state: All Clear
    if (visibleInsights.length === 0) {
      return (
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-emerald-300">All Clear</span>
        </div>
      );
    }

    // Has critical items - show collapsed or expanded
    const handleBarToggle = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsExpanded(prev => !prev);
    };

    if (!isExpanded) {
      return (
        <button
          type="button"
          onClick={handleBarToggle}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/15 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm text-amber-300">{status.label}</span>
          </div>
          <svg className="w-4 h-4 text-amber-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      );
    }

    // Expanded Living mode - show simple list with quick dismiss
    // NO full Suggestion Contract - that's for Planning mode
    return (
      <div className="space-y-2">
        {/* Clickable header to collapse - no separate "Collapse" text */}
        <button
          type="button"
          onClick={handleBarToggle}
          className="w-full flex items-center justify-between px-4 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg hover:bg-amber-500/10 transition-colors"
        >
          <span className="text-xs text-slate-400 uppercase tracking-wide">
            {status.label}
          </span>
          <svg className="w-4 h-4 text-amber-400/60 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {visibleInsights.map((surfaced) => {
          const insightId = createInsightId(surfaced.insight);
          const confidence = surfaced.insight.confidence ?? 1;
          const isHighConfidence = confidence >= 0.7;

          return (
            <div
              key={insightId}
              className={`px-4 py-3 rounded-xl border transition-colors ${
                isHighConfidence
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-amber-500/5 border-dashed border-amber-500/15'
              }`}
            >
              {/* Main insight message */}
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-amber-200">{surfaced.insight.message}</span>

                  {/* Glass Box: WHY this needs attention */}
                  {surfaced.insight.evidence?.context && (
                    <p className="text-xs text-slate-400 mt-1">
                      {surfaced.insight.evidence.context}
                    </p>
                  )}

                  {/* Confidence indicator for low-confidence insights */}
                  {!isHighConfidence && (
                    <p className="text-xs text-slate-500 mt-1">
                      Still learning... ({Math.round(confidence * 100)}% confident)
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Primary action - context-aware label */}
                  {onInsightAccept && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAccept(surfaced.insight);
                      }}
                      className="px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/20 rounded transition-colors"
                    >
                      {getActionLabel(surfaced.insight.type)}
                    </button>
                  )}

                  {/* Dismiss */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDismiss(surfaced.insight.type);
                    }}
                    className="p-1 text-amber-400/60 hover:text-amber-300 transition-colors"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ==========================================================================
  // RENDER: Planning Mode (Full Insight Cards)
  // ==========================================================================

  // Empty state for established user
  if (visibleInsights.length === 0) {
    return (
      <div className="px-4 py-3 bg-slate-800/20 rounded-xl border border-slate-700/30">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-slate-300">No insights this week</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Your schedule looks balanced</p>
      </div>
    );
  }

  // Full insight cards
  return (
    <div className="space-y-2">
      {visibleInsights.map((surfaced) => {
        const insightId = createInsightId(surfaced.insight);
        return (
          <InsightCard
            key={insightId}
            insightId={insightId}
            insight={surfaced.insight}
            deferredAt={surfaced.deferredAt}
            resurfaceReason={surfaced.resurfaceReason}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            onDontAskAgain={handleDontAskAgain}
          />
        );
      })}

      {/* Show count of hidden insights */}
      {hiddenCount > 0 && (
        <p className="w-full text-center text-xs text-slate-500 py-2">
          +{hiddenCount} more insight{hiddenCount > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
