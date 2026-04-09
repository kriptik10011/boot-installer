/**
 * VitalCard — Generic card for a financial vital sign.
 *
 * 3 sizes (compact/standard/large), trust borders, expand/collapse accordion,
 * 3-layer intelligence (narrative/action/why), keyboard nav (Enter/Escape),
 * interaction recording for behavioral learning.
 *
 * Design: Calm medical monitor. Solid border = user data. Dashed = AI.
 * Amber glow for attention, never red (No-Shame).
 */

import { useCallback, useRef, useEffect } from 'react';
import type { VitalType, VitalSize, VitalIntelligenceLayer } from '@/types/vitals';
import { getVitalMetadata } from './vitalRegistry';
import { getTrustBorderClasses, getTrustOpacity } from '@/utils/trustVisualization';

interface VitalCardProps {
  type: VitalType;
  size: VitalSize;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Confidence 0-1 for trust border (solid vs dashed) */
  confidence?: number;
  /** Whether this vital has an active alert (amber glow) */
  hasAlert?: boolean;
  /** Intelligence layers */
  intelligence?: VitalIntelligenceLayer;
  /** Callback when user opens/expands */
  onOpen?: () => void;
  /** Callback when user takes action */
  onAction?: () => void;
  /** Callback for dwell time recording (ms) */
  onDwell?: (ms: number) => void;
  /** Content for compact view (1-line) */
  compactContent?: React.ReactNode;
  /** Content for standard view */
  standardContent?: React.ReactNode;
  /** Content for large/expanded view (additional detail) */
  expandedContent?: React.ReactNode;
  children?: React.ReactNode;
}

export function VitalCard({
  type,
  size,
  isExpanded,
  onToggleExpand,
  confidence = 0.8,
  hasAlert = false,
  intelligence,
  onOpen,
  onAction,
  onDwell,
  compactContent,
  standardContent,
  expandedContent,
  children,
}: VitalCardProps) {
  const meta = getVitalMetadata(type);
  const dwellStartRef = useRef<number | null>(null);

  // Trust border
  const borderClasses = getTrustBorderClasses(confidence, 'border-slate-700/50');
  const opacityClasses = getTrustOpacity(confidence);

  // Track dwell time when expanded; report on collapse
  useEffect(() => {
    if (isExpanded) {
      dwellStartRef.current = Date.now();
    } else if (dwellStartRef.current) {
      const dwellMs = Date.now() - dwellStartRef.current;
      if (dwellMs > 500) {
        onDwell?.(dwellMs);
      }
      dwellStartRef.current = null;
    }
  }, [isExpanded, onDwell]);

  const handleToggle = useCallback(() => {
    if (!isExpanded) {
      onOpen?.();
    }
    onToggleExpand();
  }, [isExpanded, onOpen, onToggleExpand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleToggle();
      } else if (e.key === 'Escape' && isExpanded) {
        e.preventDefault();
        onToggleExpand();
      }
    },
    [handleToggle, isExpanded, onToggleExpand]
  );

  const handleActionClick = useCallback(
    (actionFn: () => void) => {
      onAction?.();
      actionFn();
    },
    [onAction]
  );

  // Compact: single line
  if (size === 'compact' && !isExpanded) {
    return (
      <div
        className={`
          rounded-xl bg-slate-800/50 px-3 py-2 cursor-pointer
          transition-all duration-100 motion-reduce:transition-none
          focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none
          ${borderClasses} ${opacityClasses}
          ${hasAlert ? 'shadow-[0_0_12px_rgba(245,158,11,0.2)]' : ''}
        `}
        role="listitem"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-label={`${meta.label} vital`}
        aria-expanded={false}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {meta.label}
          </span>
          <div className="text-sm text-slate-200 truncate flex-1 text-right">
            {compactContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-xl overflow-hidden cursor-pointer
        transition-all duration-100 motion-reduce:transition-none
        focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none
        ${isExpanded ? 'bg-slate-800/80' : 'bg-slate-800/50'}
        ${borderClasses} ${opacityClasses}
        ${hasAlert ? 'shadow-[0_0_12px_rgba(245,158,11,0.2)] motion-reduce:border-amber-500/50' : ''}
      `}
      role="listitem"
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      aria-label={`${meta.label} vital`}
      aria-expanded={isExpanded}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {meta.label}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-100 motion-reduce:transition-none ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>

        {/* Standard content */}
        <div className="text-sm">{standardContent ?? children}</div>

        {/* Intelligence narrative (standard view) */}
        {intelligence?.narrative && !isExpanded && (
          <div className="mt-1 text-xs text-slate-400">{intelligence.narrative}</div>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div
            className="mt-3 pt-3 border-t border-slate-700/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Large/expanded detail */}
            {expandedContent}

            {/* Intelligence: narrative */}
            {intelligence?.narrative && (
              <div className="mt-2 text-sm text-slate-300">{intelligence.narrative}</div>
            )}

            {/* Intelligence: action */}
            {intelligence?.action && (
              <button
                className="mt-2 px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleActionClick(intelligence.action!.onClick);
                }}
              >
                {intelligence.action.label}
              </button>
            )}

            {/* Intelligence: reasoning (Glass Box) */}
            {intelligence?.reasoning && (
              <div className="mt-2 text-xs text-slate-500 leading-relaxed">
                {intelligence.reasoning}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
