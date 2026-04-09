/**
 * PositionedCircle — Absolutely positioned circle with label and count.
 * Pure props, cqi-responsive. Used for inventory location bubbles, food stat zones.
 * Parent must have position: relative.
 */

import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

interface PositionedCircleProps {
  position: { x: number; y: number };
  label: string;
  count?: number;
  glowColor?: string;
  onClick?: () => void;
  className?: string;
}

export function PositionedCircle({
  position,
  label,
  count,
  glowColor = 'rgba(148, 163, 184, 0.3)',
  onClick,
  className,
}: PositionedCircleProps) {
  const size = '12cqi';
  const labelSize = `${CARD_SIZES.sectionContent * 0.7}cqi`;
  const countSize = `${CARD_SIZES.sectionContent * 1.1}cqi`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute flex flex-col items-center justify-center transition-transform hover:scale-110 ${className ?? ''}`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(30, 41, 59, 0.6)',
        boxShadow: `0 0 6cqi ${glowColor}`,
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
        padding: 0,
      }}
    >
      {count != null && (
        <span
          className="font-bold text-slate-200 leading-none"
          style={{ fontSize: countSize, fontFamily: FONT_FAMILY }}
        >
          {count}
        </span>
      )}
      <span
        className="text-slate-400 uppercase tracking-wider leading-tight"
        style={{
          fontSize: labelSize,
          fontFamily: FONT_FAMILY,
          maxWidth: '90%',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </button>
  );
}
