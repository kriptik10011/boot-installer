/**
 * InsightCard - Individual Expandable Insight Card
 *
 * Implements the "Suggestion Contract" pattern from Intelligence Principles:
 * - Tap to expand (show details + actions)
 * - Accept button (primary action)
 * - Dismiss button (remove from view)
 * - "Don't show again" option (30-day suppression)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Insight } from '@/api/client';
import { getInsightIcon, getInsightColor } from '@/utils/surfacing';
import { getTrustBorderClasses } from '@/utils/trustVisualization';
import { trackInsightShown, trackInsightConsidered } from '@/services/observation';

// Icon components defined outside to prevent re-creation on render
function DollarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function getIcon(iconName: string) {
  switch (iconName) {
    case 'currency-dollar':
      return <DollarIcon />;
    case 'exclamation-triangle':
      return <WarningIcon />;
    case 'calendar':
      return <CalendarIcon />;
    case 'lightbulb':
      return <LightbulbIcon />;
    default:
      return <InfoIcon />;
  }
}

interface InsightCardProps {
  insight: Insight;
  insightId: string;
  /** Timestamp when this insight was originally deferred */
  deferredAt?: number;
  /** Why this insight is being resurfaced now */
  resurfaceReason?: 'idle' | 'deadline' | 'soon';
  onAccept?: (insight: Insight) => void;
  onDismiss: (insightType: string) => void;
  onDontAskAgain: (insightType: string) => void;
}

/**
 * Format relative time since deferral for display.
 */
function formatDeferralTime(deferredAt: number): string {
  const diffMs = Date.now() - deferredAt;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Get human-readable reason for resurfacing.
 */
function getResurfaceLabel(reason: 'idle' | 'deadline' | 'soon'): string {
  switch (reason) {
    case 'idle':
      return 'showing due to idle';
    case 'deadline':
      return 'time-sensitive';
    case 'soon':
      return 'deadline approaching';
    default:
      return 'resurfaced';
  }
}

export function InsightCard({
  insight,
  insightId,
  deferredAt,
  resurfaceReason,
  onAccept,
  onDismiss,
  onDontAskAgain,
}: InsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const trackedRef = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverStartRef = useRef<number>(0);
  const consideredRef = useRef(false);

  // Track insight shown for backend learning (once per mount)
  useEffect(() => {
    if (!trackedRef.current) {
      trackedRef.current = true;
      trackInsightShown({
        insightId: insightId,
        insightType: insight.type,
        confidence: insight.confidence,
      });
    }
  }, [insightId, insight.type, insight.confidence]);

  // 6B: Track passive engagement — hover > 2s = consideration signal
  const handlePointerEnter = useCallback(() => {
    if (consideredRef.current) return;
    hoverStartRef.current = Date.now();
    hoverTimerRef.current = setTimeout(() => {
      consideredRef.current = true;
      trackInsightConsidered({
        insightId,
        insightType: insight.type,
        hoverDurationMs: Date.now() - hoverStartRef.current,
      });
    }, 2000);
  }, [insightId, insight.type]);

  const handlePointerLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const colorClass = getInsightColor(insight.priority);
  const iconName = getInsightIcon(insight.type);
  const icon = getIcon(iconName);

  // Check if this is a resurfaced (previously deferred) insight
  const isResurfaced = deferredAt !== undefined;

  // Glass Box: High confidence = solid border, Low confidence = dashed border
  const borderStyle = getTrustBorderClasses(insight.confidence, '');

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExiting(true);
    setTimeout(() => onDismiss(insight.type), 200);
  }, [insight.type, onDismiss]);

  const handleDontAskAgain = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExiting(true);
    setTimeout(() => onDontAskAgain(insight.type), 200);
  }, [insight.type, onDontAskAgain]);

  const handleAccept = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAccept) {
      setIsExiting(true);
      setTimeout(() => onAccept(insight), 200);
    }
  }, [insight, onAccept]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExpanded(prev => !prev);
  }, []);

  // Get primary action label based on insight type
  const getPrimaryActionLabel = () => {
    switch (insight.type) {
      case 'bill_due_soon':
      case 'bill_overdue':
        return 'View Bill';
      case 'conflict':
        return 'Resolve';
      case 'busy_day':
        return 'Review Day';
      case 'pattern_detected':
        return 'Apply';
      default:
        return 'View';
    }
  };

  // Exit animation
  if (isExiting) {
    return (
      <div
        data-insight-id={insightId}
        className="opacity-0 scale-95 transition-opacity duration-200"
      />
    );
  }

  return (
    <div
      data-insight-id={insightId}
      className={`rounded-xl ${borderStyle} ${colorClass}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Resurfaced indicator - shows when insight was deferred and is now showing */}
      {isResurfaced && resurfaceReason && (
        <div className="px-4 py-1.5 border-b border-current/10 flex items-center gap-2">
          <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs opacity-60">
            Deferred {formatDeferralTime(deferredAt)}, {getResurfaceLabel(resurfaceReason)}
          </span>
        </div>
      )}

      {/* Header - Always visible, clickable to toggle */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
      >
        <div className="shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <span className="text-sm">{insight.message}</span>
          {insight.is_template && insight.learning_message && (
            <p className="text-xs text-amber-400/70 mt-0.5">{insight.learning_message}</p>
          )}
          {/* 6A: Cold-start progress — show what the system is learning and when insights will be ready */}
          {insight.is_template && (insight.next_ready_progress ?? 0) > 0 && (
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500/60 rounded-full transition-all"
                    style={{ width: `${Math.min(100, insight.next_ready_progress ?? 0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {Math.round(insight.next_ready_progress ?? 0)}%
                </span>
              </div>
              {insight.next_ready && (
                <p className="text-[10px] text-slate-500">Ready by ~{insight.next_ready}</p>
              )}
              {insight.learning_features && insight.learning_features.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {insight.learning_features.map((f) => (
                    <span key={f} className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded-full text-slate-400">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <svg
          className={`w-4 h-4 shrink-0 opacity-50 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content - Conditionally rendered */}
      {isExpanded && (
        <div className="border-t border-current/20">
          {/* Glass Box: "Why am I seeing this?" - expandable explanation */}
          <div className="px-4 py-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowWhy(prev => !prev);
              }}
              className="flex items-center gap-2 text-xs opacity-70 hover:opacity-100 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Why am I seeing this?</span>
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${showWhy ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded "Why" content */}
            {showWhy && (
              <div className="mt-2 pl-5 space-y-2 text-xs">
                {/* Confidence */}
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-current rounded-full transition-all"
                      style={{ width: `${Math.round(insight.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="opacity-70">{Math.round(insight.confidence * 100)}% confidence</span>
                </div>

                {/* Observation count */}
                {insight.evidence?.observation_count !== undefined && (
                  <div className="flex items-center gap-2 opacity-70">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>Based on {insight.evidence.observation_count} observation{insight.evidence.observation_count !== 1 ? 's' : ''}</span>
                  </div>
                )}

                {/* Pattern strength */}
                {insight.evidence?.pattern_strength !== undefined && (
                  <div className="flex items-center gap-2 opacity-70">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span>Pattern strength: {Math.round(insight.evidence.pattern_strength * 100)}%</span>
                  </div>
                )}

                {/* Context explanation */}
                {insight.evidence?.context && (
                  <div className="opacity-70 italic">
                    "{insight.evidence.context}"
                  </div>
                )}

                {/* Last observed */}
                {insight.evidence?.last_observed && (
                  <div className="opacity-50 text-[10px]">
                    Last observed: {new Date(insight.evidence.last_observed).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            {/* Primary Action */}
            {onAccept && (
              <button
                type="button"
                onClick={handleAccept}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
              >
                {getPrimaryActionLabel()}
              </button>
            )}

            {/* Secondary Actions */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-sm opacity-70 hover:opacity-100 transition-opacity"
              >
                Not Now
              </button>
              <button
                type="button"
                onClick={handleDontAskAgain}
                className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-xs opacity-50 hover:opacity-70 transition-opacity"
                title="Don't show this type of insight for 30 days"
              >
                Don't show again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
