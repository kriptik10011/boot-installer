/**
 * ScrollZone — Circular-safe scrollable content area.
 *
 * Hides native scrollbar (clips against borderRadius:50% at poles).
 * Adds its own horizontal padding for full-width content that needs
 * to stay inside the circle's chord width. This is separate from
 * JunctionCardLayout's padding (which handles centered header content).
 *
 * Total horizontal inset = JunctionCardLayout paddingX + ScrollZone paddingX.
 * Default: 4cqi (layout) + 5cqi (scroll) = 9cqi total — safe within
 * the circle at typical scroll-area start positions.
 *
 * CSS injection follows the same idempotent pattern as FormField's slider styles.
 * Pure props, cqi-responsive.
 */

import type { ReactNode } from 'react';

// ── Scrollbar-hiding CSS (injected once) ─────────────────────────────────────

const STYLE_ID = 'circ-scroll-styles';

function ensureScrollStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .circ-scroll::-webkit-scrollbar { display: none; }
    .circ-scroll { -ms-overflow-style: none; scrollbar-width: none; }
  `;
  document.head.appendChild(s);
}

// ── Component ────────────────────────────────────────────────────────────────

interface ScrollZoneProps {
  children: ReactNode;
  className?: string;
  /** Horizontal padding for full-width content circular safety (default: 5cqi) */
  paddingX?: string;
  /** Bottom padding to clear the circular card's lower curve (default: 10cqi) */
  paddingBottom?: string;
}

export function ScrollZone({ children, className, paddingX = '5cqi', paddingBottom = '10cqi' }: ScrollZoneProps) {
  ensureScrollStyles();

  // Fade mask: content fades out at top and bottom edges
  const fadeMask = 'linear-gradient(to bottom, transparent 0%, black 8%, black 88%, transparent 100%)';

  return (
    <div
      className={`circ-scroll ${className ?? ''}`}
      style={{
        flex: '1 1 0',
        minHeight: 0,
        overflowY: 'auto',
        width: '100%',
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingBottom,
        maskImage: fadeMask,
        WebkitMaskImage: fadeMask,
      }}
    >
      {children}
    </div>
  );
}
