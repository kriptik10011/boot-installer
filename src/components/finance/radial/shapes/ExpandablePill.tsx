/**
 * ExpandablePill — Collapsible pill that expands to show children content.
 * Pure props, cqi-responsive. Used for inventory category groups, food stat sections.
 */

import type { ReactNode } from 'react';
import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

interface ExpandablePillProps {
  label: string;
  count?: number;
  icon?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  accentColor?: string;
  className?: string;
}

export function ExpandablePill({
  label,
  count,
  icon,
  expanded,
  onToggle,
  children,
  accentColor = '#94a3b8',
  className,
}: ExpandablePillProps) {
  const fontSize = `${CARD_SIZES.sectionContent}cqi`;
  const countSize = `${CARD_SIZES.sectionContent * 0.85}cqi`;

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center w-full text-left transition-colors hover:bg-slate-500/10"
        style={{
          gap: '0.8cqi',
          padding: '0.6cqi 1.5cqi',
          borderRadius: '2cqi',
          border: 'none',
          background: expanded ? 'rgba(51, 65, 85, 0.35)' : 'rgba(51, 65, 85, 0.08)',
          cursor: 'pointer',
        }}
      >
        {icon != null && (
          <span className="flex-shrink-0" style={{ fontSize }}>
            {icon}
          </span>
        )}
        <span
          className="flex-1 text-slate-300 truncate"
          style={{ fontSize, fontFamily: FONT_FAMILY }}
        >
          {label}
        </span>
        {count != null && (
          <span
            className="tabular-nums flex-shrink-0"
            style={{ fontSize: countSize, fontFamily: FONT_FAMILY, color: '#94a3b8' }}
          >
            {count}
          </span>
        )}
        <span
          className="flex-shrink-0 transition-transform"
          style={{
            fontSize,
            color: '#94a3b8',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          &#x203A;
        </span>
      </button>

      {expanded && (
        <div style={{ paddingLeft: '2cqi', paddingTop: '0.3cqi' }}>
          {children}
        </div>
      )}
    </div>
  );
}
