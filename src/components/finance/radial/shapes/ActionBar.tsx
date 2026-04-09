/**
 * ActionBar — Row of pill buttons for card actions.
 * Thin colored border + colored text + transparent bg (card glass shows through).
 * Supports single-element morph: one button literally grows into a form
 * container via CSS transition. Same DOM element, same border.
 * Expanded state adds extra vertical padding to clear the 9999px rounded caps.
 * Pure props, cqi-responsive.
 */

import { memo, type ReactNode } from 'react';
import { BUTTON_MIN_TEXT, FONT_FAMILY } from '../cardTemplate';

export type ButtonVariant = 'amber' | 'cyan' | 'orange' | 'green' | 'violet' | 'emerald' | 'slate';

export const VARIANT: Record<ButtonVariant, { text: string; border: string }> = {
  amber:   { text: '#fbbf24', border: 'rgba(245, 158, 11, 0.25)' },
  cyan:    { text: '#22d3ee', border: 'rgba(34, 211, 238, 0.25)' },
  orange:  { text: '#fb923c', border: 'rgba(249, 115, 22, 0.25)' },
  green:   { text: '#4ade80', border: 'rgba(74, 222, 128, 0.25)' },
  violet:  { text: '#a78bfa', border: 'rgba(168, 85, 247, 0.25)' },
  emerald: { text: '#34d399', border: 'rgba(52, 211, 153, 0.25)' },
  slate:   { text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' },
};

export interface ActionItem {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Filled button: accent bg + white text (for primary CTAs like "Complete Review") */
  filled?: boolean;
  expanded?: boolean;
  expandedContent?: ReactNode;
}

interface ActionBarProps {
  actions: readonly ActionItem[];
  /** Render buttons without borders (for nesting inside a bordered container) */
  borderless?: boolean;
  className?: string;
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export const ActionBar = memo(function ActionBar({ actions, borderless, className }: ActionBarProps) {
  const hasExpanded = actions.some((a) => a.expanded);

  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className ?? ''}`}
      style={{ gap: '1cqi', paddingTop: '0.5cqi', paddingBottom: '0.5cqi' }}
    >
      {actions.map((action) => {
        const v = VARIANT[action.variant ?? 'slate'];
        const isExpanded = action.expanded && action.expandedContent;
        const isHidden = hasExpanded && !isExpanded;

        return (
          <div
            key={action.label}
            onClick={isExpanded ? undefined : action.disabled ? undefined : action.onClick}
            role={isExpanded ? undefined : 'button'}
            tabIndex={isExpanded ? undefined : 0}
            className="font-semibold"
            style={{
              borderRadius: '9999px',
              border: action.filled ? 'none' : borderless ? 'none' : `1px solid ${v.border}`,
              background: action.filled ? v.text : 'transparent',
              fontFamily: FONT_FAMILY,
              // Expanded: extra vertical padding clears the rounded caps
              // The 9999px radius eats ~width/2 at top and bottom
              // 4cqi vertical padding keeps content in the flat center zone
              padding: isExpanded ? '4cqi 3cqi' : '0.5cqi 2cqi',
              minWidth: isExpanded ? '38cqi' : undefined,
              cursor: isExpanded ? 'default' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: isExpanded ? 'stretch' : 'center',
              justifyContent: 'center',
              gap: isExpanded ? '0.5cqi' : undefined,
              // Hidden buttons clip content during maxWidth collapse
              // Expanded/normal buttons: NO overflow:hidden — let content breathe
              opacity: isHidden ? 0 : action.disabled && !isExpanded ? 0.5 : 1,
              maxWidth: isHidden ? 0 : '50cqi',
              overflow: isHidden ? 'hidden' : undefined,
              transition: `padding 0.3s ${EASE}, opacity 0.3s ${EASE}, max-width 0.3s ${EASE}, min-width 0.3s ${EASE}`,
            }}
          >
            {isExpanded ? (
              action.expandedContent
            ) : (
              <span
                style={{
                  fontSize: `${BUTTON_MIN_TEXT}cqi`,
                  color: action.filled ? '#fff' : v.text,
                  whiteSpace: 'nowrap',
                }}
              >
                {action.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
