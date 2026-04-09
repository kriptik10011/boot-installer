/**
 * TwoColumnLayout — Side-by-side columns with optional headers and divider.
 * Pure props, cqi-responsive. Used for split views (favorites|patterns, categories|metrics).
 */

import type { ReactNode } from 'react';
import { COLUMN_HEADER_STYLE } from '../cardTemplate';

interface TwoColumnLayoutProps {
  left: ReactNode;
  right: ReactNode;
  leftHeader?: string;
  rightHeader?: string;
  /** Accent color for headers (default: inherited from COLUMN_HEADER_STYLE) */
  headerColor?: string;
  dividerColor?: string;
  className?: string;
}

export function TwoColumnLayout({
  left,
  right,
  leftHeader,
  rightHeader,
  headerColor,
  dividerColor = 'rgba(148, 163, 184, 0.15)',
  className,
}: TwoColumnLayoutProps) {
  const hStyle = headerColor ? { ...COLUMN_HEADER_STYLE, color: headerColor } : COLUMN_HEADER_STYLE;

  return (
    <div
      className={`flex flex-1 min-h-0 ${className ?? ''}`}
      style={{ gap: 0 }}
    >
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {leftHeader != null && leftHeader !== '' && (
          <div style={hStyle}>{leftHeader}</div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">{left}</div>
      </div>

      <div
        className="flex-shrink-0"
        style={{
          width: '1px',
          background: dividerColor,
          margin: '1cqi 0',
        }}
      />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {rightHeader != null && rightHeader !== '' && (
          <div style={hStyle}>{rightHeader}</div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">{right}</div>
      </div>
    </div>
  );
}
