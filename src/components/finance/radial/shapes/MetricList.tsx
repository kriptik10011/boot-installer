/**
 * MetricList — Vertical list of label-value pairs with optional color accents.
 * Pure props, cqi-responsive. Used for budget categories, monitor metrics.
 */

import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

export interface MetricListItem {
  label: string;
  value: string | number;
  color?: string;
}

interface MetricListProps {
  items: readonly MetricListItem[];
  maxItems?: number;
  className?: string;
}

export function MetricList({ items, maxItems, className }: MetricListProps) {
  const visible = maxItems != null ? items.slice(0, maxItems) : items;
  const fontSize = `${CARD_SIZES.sectionContent}cqi`;

  return (
    <div
      className={`flex flex-col ${className ?? ''}`}
      style={{ gap: '0.6cqi', padding: '1cqi 2cqi' }}
    >
      {visible.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between"
          style={{ fontSize, fontFamily: FONT_FAMILY }}
        >
          <span className="text-slate-400 truncate" style={{ maxWidth: '60%' }}>
            {item.label}
          </span>
          <span
            className="font-semibold tabular-nums flex-shrink-0"
            style={{ color: item.color ?? '#e2e8f0' }}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
