/**
 * NeedsAttentionCard Component
 *
 * Reusable tile for items requiring attention.
 * Follows UX principle: "Items must be actionable" with One-Tap Repair options.
 *
 * Pattern:
 * - Line 1: What (count + type)
 * - Line 2: Context (specific items affected)
 * - Line 3: Actions (One-Tap Repair options)
 *
 * Part of the UX compliance improvements.
 */

import type { ReactNode } from 'react';

export type AttentionVariant = 'overdue' | 'conflict' | 'overloaded' | 'info';

interface AttentionAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'attention';
}

interface NeedsAttentionCardProps {
  /** Type of attention needed */
  variant: AttentionVariant;
  /** Main label (e.g., "2 Overdue Bills") */
  title: string;
  /** Additional context (e.g., "Electric Bill ($135) • Internet ($150)") */
  context?: string;
  /** Right-side value (e.g., "$285" or "Thursday") */
  rightValue?: string;
  /** Available actions */
  actions?: AttentionAction[];
  /** Icon to show (emoji or custom) */
  icon?: ReactNode;
  /** Called when the card itself is clicked (for navigation) */
  onClick?: () => void;
  /** Children for custom content */
  children?: ReactNode;
}

const variantStyles: Record<AttentionVariant, { bg: string; border: string; dot: string; text: string }> = {
  overdue: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
  conflict: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    dot: 'bg-yellow-400',
    text: 'text-yellow-300',
  },
  overloaded: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    dot: 'bg-blue-400',
    text: 'text-blue-300',
  },
  info: {
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-400',
    text: 'text-slate-300',
  },
};

const variantIcons: Record<AttentionVariant, string> = {
  overdue: '🟠',
  conflict: '🟡',
  overloaded: '🔵',
  info: '⚪',
};

export function NeedsAttentionCard({
  variant,
  title,
  context,
  rightValue,
  actions,
  icon,
  onClick,
  children,
}: NeedsAttentionCardProps) {
  const styles = variantStyles[variant];
  const defaultIcon = variantIcons[variant];

  const CardWrapper = onClick ? 'button' : 'div';

  return (
    <CardWrapper
      onClick={onClick}
      className={`
        w-full rounded-lg ${styles.bg} border ${styles.border} p-3 text-left
        ${onClick ? 'hover:brightness-110 cursor-pointer transition-all' : ''}
      `}
    >
      {/* Header row: Icon, Title, Right Value */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon || defaultIcon}</span>
          <span className={`text-sm font-medium ${styles.text}`}>{title}</span>
        </div>
        {rightValue && (
          <span className={`text-sm font-medium ${styles.text}`}>{rightValue}</span>
        )}
      </div>

      {/* Context line */}
      {context && (
        <p className="text-xs text-slate-400 pl-6 mb-2">{context}</p>
      )}

      {/* Custom children */}
      {children}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="flex gap-2 mt-2 pl-6">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              className={`
                px-2 py-1 rounded text-xs font-medium transition-colors
                ${action.variant === 'primary'
                  ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30'
                  : action.variant === 'attention'
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-600/50 hover:bg-slate-600 text-slate-300'
                }
              `}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </CardWrapper>
  );
}

export default NeedsAttentionCard;
