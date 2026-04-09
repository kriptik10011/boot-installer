/**
 * @deprecated Use CircularCardLayout formZone pattern instead. All overlay content
 * should render as formZone states within the card component (see MealsOverviewCard,
 * FoodStatsCard, InventoryOverviewCard for reference). This component is retained
 * only for UrlImportCard until its conversion is complete.
 *
 * OverlayShell — Shared backdrop + panel wrapper for full-bleed circular overlays.
 * Pair with OverlayPanel for header + scrollable content.
 */

import type { ReactNode } from 'react';

interface OverlayShellProps {
  onClose: () => void;
  children: ReactNode;
  /** Extra classes on the panel div (e.g. "flex flex-col" for non-OverlayPanel content) */
  panelClassName?: string;
}

export function OverlayShell({ onClose, children, panelClassName }: OverlayShellProps) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(2, 6, 15, 0.5)', zIndex: 10 }}
        onClick={onClose}
      />
      <div
        className={`absolute ${panelClassName ?? ''}`}
        style={{
          inset: 0,
          zIndex: 11,
          background: 'rgba(8, 16, 32, 0.90)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: 'none',
          padding: '15cqi 20cqi',
          containerType: 'inline-size' as const,
        }}
      >
        {children}
      </div>
    </>
  );
}
