/**
 * ButtonGroup — Selectable option buttons with flexible layout.
 * Thin colored border + colored text + transparent bg pattern.
 * Active state shown via visible border + brighter text.
 *
 * Supports:
 * - direction: 'horizontal' (default) or 'vertical' (stacked column)
 * - wrap: true to enable flex-wrap for chip/tag layouts
 * - accentColor: custom active color (defaults to slate VARIANT)
 *
 * Pure props, cqi-responsive.
 */

import { BUTTON_MIN_TEXT, FONT_FAMILY } from '../cardTemplate';
import { VARIANT } from './ActionBar';

export interface ButtonGroupOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface ButtonGroupProps {
  options: readonly ButtonGroupOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  /** Layout direction (default: 'horizontal') */
  direction?: 'horizontal' | 'vertical';
  /** Enable flex-wrap for chip layouts (default: false for horizontal, ignored for vertical) */
  wrap?: boolean;
  /** Custom accent color for active state (default: slate VARIANT) */
  accentColor?: string;
  className?: string;
}

export function ButtonGroup({
  options,
  value,
  onChange,
  size = 'md',
  direction = 'horizontal',
  wrap,
  accentColor,
  className,
}: ButtonGroupProps) {
  const fontSize = size === 'sm'
    ? `${BUTTON_MIN_TEXT}cqi`
    : `${BUTTON_MIN_TEXT * 1.15}cqi`;
  const padding = size === 'sm' ? '0.4cqi 1.5cqi' : '0.6cqi 2cqi';
  const isVertical = direction === 'vertical';
  const activeBorder = accentColor ? `rgba(${hexToRgb(accentColor)}, 0.25)` : 'rgba(148, 163, 184, 0.45)';
  const activeColor = accentColor ?? '#e2e8f0';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: isVertical ? 'stretch' : 'center',
        justifyContent: isVertical ? undefined : 'center',
        flexWrap: wrap || isVertical ? undefined : 'wrap',
        gap: isVertical ? '0.4cqi' : '0.8cqi',
      }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            disabled={opt.disabled}
            className="font-semibold"
            style={{
              fontSize,
              fontFamily: FONT_FAMILY,
              padding,
              borderRadius: '9999px',
              border: `1px solid ${isActive ? activeBorder : 'transparent'}`,
              background: isActive && accentColor
                ? `rgba(${hexToRgb(accentColor)}, 0.15)`
                : 'transparent',
              color: isActive ? activeColor : '#cbd5e1',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.4 : 1,
              transition: 'all 150ms',
              textAlign: isVertical ? 'left' : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Convert hex color to r,g,b string for rgba() */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
