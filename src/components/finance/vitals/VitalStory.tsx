/**
 * VitalStory — Single-line narrative from cross-feature intelligence.
 *
 * Appears only when Bayesian Surprise z>2 OR bill due <48h.
 * Dismissable with 1-day suppression. Tappable to expand relevant vital.
 * Maximum 1 story visible (highest priority).
 */

import { useCallback } from 'react';

interface VitalStoryProps {
  /** The narrative text to display */
  message: string;
  /** Trust confidence for border treatment */
  confidence: number;
  /** Callback when user taps the story */
  onTap?: () => void;
  /** Callback when user dismisses */
  onDismiss?: () => void;
}

export function VitalStory({ message, confidence, onTap, onDismiss }: VitalStoryProps) {
  const borderStyle = confidence >= 0.7 ? 'border-l-cyan-500/60' : 'border-l-cyan-500/30';

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDismiss?.();
    },
    [onDismiss]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onTap?.();
      }
    },
    [onTap]
  );

  return (
    <div
      className="mx-3 mb-2 px-3 py-2 border-l-2 bg-slate-800/30 rounded-r-lg cursor-pointer flex items-center justify-between gap-2 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
      role="status"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={handleKeyDown}
      aria-label={`Insight: ${message}`}
    >
      <span className={`text-sm text-slate-300 flex-1 ${borderStyle}`}>{message}</span>
      {onDismiss && (
        <button
          className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
          onClick={handleDismiss}
          aria-label="Dismiss insight"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
