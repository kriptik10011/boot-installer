/**
 * StatGrid — 2x2 or flexible grid of number + label pairs.
 * Pure props, cqi-responsive. Used for event/meal/bill counts, food group breakdown.
 */

import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

export interface StatItem {
  value: string | number;
  label: string;
  color?: string;
}

interface StatGridProps {
  stats: readonly StatItem[];
  columns?: 2 | 3;
  /** Maximum number of stat items to display */
  maxItems?: number;
  className?: string;
}

export function StatGrid({ stats, columns = 2, maxItems, className }: StatGridProps) {
  const visible = maxItems != null ? stats.slice(0, maxItems) : stats;
  return (
    <div
      className={`grid ${className ?? ''}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '1.5cqi',
      }}
    >
      {visible.map((stat) => (
        <div key={stat.label} className="flex flex-col items-center text-center" style={{ gap: '0.2cqi' }}>
          <span
            className="font-bold tabular-nums"
            style={{
              fontSize: `${CARD_SIZES.statsText}cqi`,
              color: stat.color ?? '#e2e8f0',
              fontFamily: FONT_FAMILY,
            }}
          >
            {stat.value}
          </span>
          <span
            className="text-slate-500 uppercase tracking-wider"
            style={{
              fontSize: `${CARD_SIZES.sectionContent * 0.75}cqi`,
              fontFamily: FONT_FAMILY,
            }}
          >
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
}
