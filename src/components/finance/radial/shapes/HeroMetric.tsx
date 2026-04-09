/**
 * HeroMetric — Large centered number with label and optional sublabel.
 * Pure props, cqi-responsive. Used for health scores, budget pace, item counts.
 */

import { memo } from 'react';
import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

interface HeroMetricProps {
  value: string | number;
  label: string;
  sublabel?: string;
  color?: string;
  /** Dynamic color based on current value — overrides `color` when provided */
  computedColor?: (value: string | number) => string;
  /** Compact mode — label only, smaller text. Used when card is in form mode. */
  compact?: boolean;
  className?: string;
}

export const HeroMetric = memo(function HeroMetric({ value, label, sublabel, color, computedColor, compact, className }: HeroMetricProps) {
  const resolvedColor = computedColor ? computedColor(value) : color;

  if (compact) {
    return (
      <div className={`flex flex-col items-center text-center ${className ?? ''}`}>
        <span
          className="font-bold tracking-widest uppercase"
          style={{
            fontSize: `${CARD_SIZES.statusText}cqi`,
            color: resolvedColor ?? '#94a3b8',
            fontFamily: FONT_FAMILY,
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center text-center ${className ?? ''}`}
      style={{ gap: '0.3cqi' }}
    >
      <span
        className="font-bold tracking-widest uppercase"
        style={{
          fontSize: `${CARD_SIZES.labelText}cqi`,
          color: resolvedColor ?? '#94a3b8',
          fontFamily: FONT_FAMILY,
        }}
      >
        {label}
      </span>

      <span
        className="font-bold text-slate-200 leading-tight"
        style={{
          fontSize: `${CARD_SIZES.heroText}cqi`,
          fontFamily: FONT_FAMILY,
          maxWidth: '90%',
          textAlign: 'center',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>

      {sublabel != null && sublabel !== '' && (
        <span
          className="text-slate-500"
          style={{
            fontSize: `${CARD_SIZES.statusText}cqi`,
            fontFamily: FONT_FAMILY,
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
});
