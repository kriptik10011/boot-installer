/**
 * OverlayPanel — Full-bleed overlay header with back button and optional right element.
 * Pure props, cqi-responsive. Used by FoodStats sub-overlays.
 * Children render below the header in a scrollable area.
 */

import type { ReactNode } from 'react';
import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

interface OverlayPanelProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
  headerRight?: ReactNode;
  className?: string;
}

export function OverlayPanel({
  title,
  onBack,
  children,
  headerRight,
  className,
}: OverlayPanelProps) {
  const titleSize = `${CARD_SIZES.labelText}cqi`;
  const backSize = `${CARD_SIZES.sectionContent}cqi`;

  return (
    <div
      className={`flex flex-col h-full ${className ?? ''}`}
      style={{ padding: '2cqi 3cqi' }}
    >
      <div
        className="flex items-center shrink-0"
        style={{ gap: '1.5cqi', marginBottom: '1.5cqi' }}
      >
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
          style={{ fontSize: backSize, fontFamily: FONT_FAMILY }}
        >
          Back
        </button>
        <span
          className="font-bold text-slate-200 tracking-wider uppercase flex-1 text-center"
          style={{ fontSize: titleSize, fontFamily: FONT_FAMILY }}
        >
          {title}
        </span>
        <div className="flex-shrink-0" style={{ minWidth: backSize }}>
          {headerRight}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
