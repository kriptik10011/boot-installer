/**
 * DayCardItem Component
 *
 * Clickable item within a day card - events, meals, or bills.
 * Styling adapts based on lens mode and item state.
 */

import type { DayCardItemProps } from './types';

export function DayCardItem({
  type,
  label,
  sublabel,
  isEmpty = false,
  isOverdue = false,
  isPaid = false,
  hasConflict = false,
  isRecurring = false,
  cookTimeMinutes,
  lens = 'normal',
  onClick,
}: DayCardItemProps) {
  // Base styles for the item
  const baseStyles = 'w-full text-left px-3 py-2 rounded-lg transition-colors';

  // Determine item styling based on state and lens
  const getItemStyles = (): string => {
    if (isEmpty) {
      // Empty slot - warm nudge styling
      return `${baseStyles} border border-dashed border-slate-600 hover:border-slate-500 hover:bg-slate-800/30 text-slate-400 hover:text-slate-300`;
    }

    if (isPaid) {
      return `${baseStyles} bg-slate-800/30 text-slate-500 line-through opacity-60`;
    }

    if (isOverdue) {
      // No-Shame Pattern: Use amber (attention) not red (guilt)
      // Frame as "Open Loop" to manage, not failure
      if (lens === 'risk') {
        return `${baseStyles} bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30`;
      }
      return `${baseStyles} bg-amber-500/10 text-amber-400 hover:bg-amber-500/20`;
    }

    if (hasConflict && lens === 'risk') {
      return `${baseStyles} bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30`;
    }

    // Type-based styling
    switch (type) {
      case 'event':
        if (lens === 'risk' && hasConflict) {
          return `${baseStyles} bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`;
        }
        return `${baseStyles} bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20`;

      case 'meal':
        return `${baseStyles} bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`;

      case 'bill':
        if (lens === 'money') {
          return `${baseStyles} bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30`;
        }
        return `${baseStyles} bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`;

      default:
        return `${baseStyles} bg-slate-700/50 text-slate-300 hover:bg-slate-700`;
    }
  };

  // Icon based on type
  const getIcon = () => {
    if (isEmpty) {
      return (
        <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      );
    }

    switch (type) {
      case 'event':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'meal':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        );
      case 'bill':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <button onClick={onClick} className={getItemStyles()} aria-label={isEmpty ? `Add ${type}` : label}>
      <div className="flex items-center gap-2">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate text-sm font-medium" title={isEmpty ? undefined : label}>
            {isEmpty ? `Add ${type}` : label}
            {isRecurring && !isEmpty && (
              <span title="Recurring">
                <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </span>
            )}
          </div>
          {sublabel && !isEmpty && (
            <div className="truncate text-xs opacity-70" title={sublabel}>
              {sublabel}
              {cookTimeMinutes && type === 'meal' && (
                <span className="ml-1 text-slate-400">~{cookTimeMinutes}m</span>
              )}
            </div>
          )}
        </div>
        {isOverdue && !isEmpty && (
          <span className="shrink-0 text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
            Open Loop
          </span>
        )}
        {hasConflict && !isEmpty && lens === 'risk' && (
          <span className="shrink-0 text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
            Conflict
          </span>
        )}
      </div>
    </button>
  );
}
