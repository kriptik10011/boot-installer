/**
 * ProgressBar — Inline horizontal progress bar with optional label and percentage.
 * Pure props, cqi-responsive. Used for goal completion, budget pace.
 */

import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

interface ProgressBarProps {
  progress: number;
  label?: string;
  /** Secondary label shown below the progress bar */
  sublabel?: string;
  color: string;
  trackColor?: string;
  showPct?: boolean;
  height?: string;
  className?: string;
}

export function ProgressBar({
  progress,
  label,
  sublabel,
  color,
  trackColor = 'rgba(100, 116, 139, 0.35)',
  showPct = false,
  height = '1.5cqi',
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const pct = Math.round(clamped * 100);

  return (
    <div className={`flex flex-col ${className ?? ''}`} style={{ gap: '0.3cqi' }}>
      {label != null && label !== '' && (
        <div className="flex items-center justify-between">
          <span
            className="text-slate-400 truncate"
            style={{ fontSize: `${CARD_SIZES.sectionContent}cqi`, fontFamily: FONT_FAMILY }}
          >
            {label}
          </span>
          {showPct && (
            <span
              className="text-slate-500 flex-shrink-0 tabular-nums"
              style={{ fontSize: `${CARD_SIZES.sectionContent * 0.9}cqi`, fontFamily: FONT_FAMILY }}
            >
              {pct}%
            </span>
          )}
        </div>
      )}

      <div className="flex items-center" style={{ gap: '0.6cqi' }}>
        <div
          className="flex-1 rounded-full overflow-hidden"
          style={{ height, backgroundColor: trackColor }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
          />
        </div>

        {showPct && (label == null || label === '') && (
          <span
            className="text-slate-500 flex-shrink-0 tabular-nums"
            style={{ fontSize: `${CARD_SIZES.sectionContent * 0.9}cqi`, fontFamily: FONT_FAMILY }}
          >
            {pct}%
          </span>
        )}
      </div>

      {sublabel != null && sublabel !== '' && (
        <span
          className="text-slate-500"
          style={{ fontSize: `${CARD_SIZES.sectionContent * 0.9}cqi`, fontFamily: FONT_FAMILY }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}
