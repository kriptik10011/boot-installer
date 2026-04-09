/**
 * JunctionCardLayout — Circular-aware layout for junction card content.
 *
 * Provides MINIMAL padding for visual breathing room. Header elements
 * (ButtonGroup, counters) are centered and narrow — they don't need
 * aggressive padding for circular safety.
 *
 * Full-width scroll content (PillList items) gets its own circular-safe
 * horizontal inset via ScrollZone's paddingX prop.
 *
 * This split responsibility maximizes usable card area:
 * - JunctionCardLayout: tight padding for centered header content
 * - ScrollZone: adds horizontal inset for wide scrollable content
 */

import type { ReactNode } from 'react';

interface JunctionCardLayoutProps {
  children: ReactNode;
  className?: string;
  gap?: string;
  /** Horizontal padding for centered content (default: 4cqi) */
  paddingX?: string;
  /** Top padding — visual breathing room (default: 8cqi) */
  paddingTop?: string;
  /** Bottom padding (default: 4cqi) */
  paddingBottom?: string;
}

export function JunctionCardLayout({
  children,
  className,
  gap = '1cqi',
  paddingX = '4cqi',
  paddingTop = '8cqi',
  paddingBottom = '4cqi',
}: JunctionCardLayoutProps) {
  return (
    <div
      className={`flex flex-col h-full w-full ${className ?? ''}`}
      style={{
        paddingTop,
        paddingBottom,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        gap,
      }}
    >
      {children}
    </div>
  );
}
