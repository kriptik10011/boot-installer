/**
 * PillList — Outlined column of items with consistent row layout.
 * Pure props, cqi-responsive. Used for shopping items, bills, events, habits, expiring items.
 * Uses thin border outline — inherits card glass background instead of own frosted glass.
 */

import {
  CARD_SIZES,
  FONT_FAMILY,
  COLUMN_HEADER_STYLE,
  MAX_PILL_ITEMS,
} from '../cardTemplate';

export interface PillListItem {
  label: string;
  badge?: string;
  sublabel?: string;
  progress?: number;
  dotColor?: string;
  onItemClick?: () => void;
  onItemAction?: () => void;
  actionLabel?: string;
  /** Checkable mode: current checked state */
  checked?: boolean;
  /** Checkable mode: toggle handler */
  onCheckChange?: (checked: boolean) => void;
  /** Checkable mode: check accent color */
  checkColor?: string;
  /** Checkable mode: strike through label when checked */
  strikethrough?: boolean;
}

/** Callback to compute dot color dynamically per item — overrides static `dotColor` */
type PillItemColorFn = (item: PillListItem) => string | undefined;

interface PillListProps {
  items: readonly PillListItem[];
  header?: string;
  headerColor?: string;
  emptyMessage?: string;
  maxItems?: number;
  borderRadius?: string;
  /** Dynamic dot color per item — overrides static `dotColor` when provided */
  computedColor?: PillItemColorFn;
  /** Show checkboxes on items that have onCheckChange */
  showCheckboxes?: boolean;
  className?: string;
}

export function PillList({
  items,
  header,
  headerColor,
  emptyMessage = 'None',
  maxItems = MAX_PILL_ITEMS,
  borderRadius = '50%',
  computedColor,
  showCheckboxes,
  className,
}: PillListProps) {
  const visible = items.slice(0, maxItems);
  const remaining = items.length - maxItems;
  const dotSize = `${CARD_SIZES.sectionContent * 0.5}cqi`;
  const fontSize = `${CARD_SIZES.sectionContent}cqi`;

  return (
    <div
      className={`flex flex-col min-h-0 ${className ?? ''}`}
      style={{ padding: '1cqi 2cqi' }}
    >
      {header != null && header !== '' && (
        <div style={{ ...COLUMN_HEADER_STYLE, color: headerColor }}>
          {header}
        </div>
      )}

      <div className="flex flex-col min-h-0" style={{ gap: '0.4cqi' }}>
        {visible.map((item) => (
          <span
            key={item.label}
            className="text-slate-300 flex items-center"
            style={{ fontSize, gap: '0.5cqi', cursor: item.onItemClick || item.onCheckChange ? 'pointer' : undefined }}
            onClick={item.onCheckChange ? () => item.onCheckChange?.(!item.checked) : item.onItemClick}
          >
            {showCheckboxes && item.onCheckChange != null && (
              <span
                className="inline-block flex-shrink-0 rounded-full border transition-colors"
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderColor: item.checkColor ?? '#94a3b8',
                  background: item.checked ? (item.checkColor ?? '#94a3b8') : 'transparent',
                }}
              />
            )}

            {(computedColor ? computedColor(item) : item.dotColor) != null && (
              <span
                className="inline-block rounded-full flex-shrink-0"
                style={{ width: dotSize, height: dotSize, backgroundColor: computedColor ? computedColor(item) : item.dotColor }}
              />
            )}

            <span
              className="flex-1"
              style={{
                overflowWrap: 'break-word',
                minWidth: 0,
                textDecoration: item.strikethrough && item.checked ? 'line-through' : undefined,
                opacity: item.strikethrough && item.checked ? 0.5 : undefined,
              }}
            >
              {item.label}
            </span>

            {item.badge != null && (
              <span className="text-slate-500 flex-shrink-0 tabular-nums" style={{ fontSize }}>
                {item.badge}
              </span>
            )}

            {item.onItemAction != null && item.actionLabel != null && (
              <button
                onClick={(e) => { e.stopPropagation(); item.onItemAction?.(); }}
                className="flex-shrink-0 text-slate-400 hover:text-slate-200 transition-colors"
                style={{ fontSize: `${CARD_SIZES.sectionContent * 0.8}cqi`, fontFamily: FONT_FAMILY }}
              >
                {item.actionLabel}
              </button>
            )}
          </span>
        ))}

        {visible.length === 0 && (
          <span className="text-slate-500" style={{ fontSize }}>
            {emptyMessage}
          </span>
        )}

        {remaining > 0 && (
          <span className="text-slate-500" style={{ fontSize: `${CARD_SIZES.sectionContent * 0.85}cqi`, textAlign: 'center', display: 'block' }}>
            +{remaining} more
          </span>
        )}
      </div>
    </div>
  );
}
