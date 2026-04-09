/**
 * DayArcPills — SVG shape rendering curved day pills on a circular card bezel.
 *
 * Each pill is an annular sector (arc band) with a <textPath> label following the curve.
 * Top arc = this week (clockwise text). Bottom arc = next week (counter-clockwise text).
 * Pure props, no hooks, no store access.
 */

import { FONT_FAMILY, CARD_SIZES, TEXT_COLORS, SUB_ARC_ACCENTS } from '../cardTemplate';
import { annularSectorPath } from '../cards/shared/arcHelpers';

// ── Geometry constants ──────────────────────────────────────────────────────

const ARC_SWEEP = 160;
const SLOT_GAP = 3;
const PILL_HEIGHT = 12; // viewBox units

function computeSegments(count: number, arcStartDeg: number) {
  const segSweep = (ARC_SWEEP - SLOT_GAP * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    startDeg: arcStartDeg + i * (segSweep + SLOT_GAP),
    sweepDeg: segSweep,
  }));
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface DayArcPillData {
  label: string;
  isActive: boolean;
  hasMeals: boolean;
  isToday: boolean;
  dimmed: boolean;
}

interface DayArcPillsProps {
  topPills: readonly DayArcPillData[];
  bottomPills: readonly DayArcPillData[];
  accentColor?: string;
  viewBox?: number;
  onPillClick?: (index: number, isTop: boolean) => void;
  onPillEnter?: (index: number, isTop: boolean) => void;
  onPillLeave?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function DayArcPills({
  topPills,
  bottomPills,
  accentColor = SUB_ARC_ACCENTS.meals,
  viewBox = 400,
  onPillClick,
  onPillEnter,
  onPillLeave,
}: DayArcPillsProps) {
  const cx = viewBox / 2;
  const cy = viewBox / 2;
  const outerR = 0.92 * (viewBox / 2);
  const innerR = outerR - PILL_HEIGHT;
  const textR = (outerR + innerR) / 2;

  const topSegs = computeSegments(topPills.length, -170);
  const bottomSegsRaw = computeSegments(bottomPills.length, 10);
  // Reverse bottom segments so Mon is on the left (mirrors top arc)
  const bottomSegs = [...bottomSegsRaw].reverse();

  const toRad = (d: number) => (d * Math.PI) / 180;
  const fontSize = viewBox * 0.021;

  // Pre-compute text paths for top-level <defs> (HIGH-1 fix: avoid nested <defs>)
  function buildTextPath(seg: { startDeg: number; sweepDeg: number }, isTop: boolean): string {
    const endDeg = seg.startDeg + seg.sweepDeg;
    if (isTop) {
      const sx = cx + textR * Math.cos(toRad(seg.startDeg));
      const sy = cy + textR * Math.sin(toRad(seg.startDeg));
      const ex = cx + textR * Math.cos(toRad(endDeg));
      const ey = cy + textR * Math.sin(toRad(endDeg));
      return `M ${sx} ${sy} A ${textR} ${textR} 0 0 1 ${ex} ${ey}`;
    }
    // Bottom: reverse direction so text faces outward (not upside-down)
    const sx = cx + textR * Math.cos(toRad(endDeg));
    const sy = cy + textR * Math.sin(toRad(endDeg));
    const ex = cx + textR * Math.cos(toRad(seg.startDeg));
    const ey = cy + textR * Math.sin(toRad(seg.startDeg));
    return `M ${sx} ${sy} A ${textR} ${textR} 0 0 0 ${ex} ${ey}`;
  }

  const topTextPaths = topSegs.map((seg) => buildTextPath(seg, true));
  const bottomTextPaths = bottomSegs.map((seg) => buildTextPath(seg, false));

  function renderPill(
    pill: DayArcPillData,
    seg: { startDeg: number; sweepDeg: number },
    index: number,
    isTop: boolean,
  ) {
    const id = `day-${isTop ? 't' : 'b'}-${index}`;
    const sectorPath = annularSectorPath(cx, cy, innerR, outerR, seg.startDeg, seg.sweepDeg, 3);

    const strokeColor = pill.isActive
      ? accentColor
      : pill.hasMeals
        ? 'rgba(52, 211, 153, 0.25)'
        : 'rgba(148, 163, 184, 0.25)';
    const fillColor = pill.isActive ? `${accentColor}20` : 'transparent';
    const textColor = pill.isActive
      ? '#fff'
      : pill.isToday
        ? accentColor
        : pill.hasMeals
          ? TEXT_COLORS.primary
          : TEXT_COLORS.secondary;

    return (
      <g
        key={id}
        opacity={pill.dimmed ? 0.6 : 1}
        style={{ cursor: 'pointer' }}
        onClick={() => onPillClick?.(index, isTop)}
        onMouseEnter={() => onPillEnter?.(index, isTop)}
        onMouseLeave={() => onPillLeave?.()}
      >
        <path d={sectorPath} fill={fillColor} stroke={strokeColor} strokeWidth={0.5} />
        <text
          fill={textColor}
          fontSize={fontSize}
          fontWeight={pill.isActive ? 600 : 400}
          fontFamily={FONT_FAMILY}
          letterSpacing="0.5px"
          dominantBaseline="central"
        >
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
            {pill.label}
          </textPath>
        </text>
        {pill.isActive && (
          <path d={sectorPath} fill="none" stroke={accentColor} strokeWidth={0.5} opacity={0.5}
                filter="url(#day-glow)" />
        )}
      </g>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none', zIndex: 5 }}
    >
      <defs>
        <filter id="day-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
        {topTextPaths.map((d, i) => <path key={`t-${i}`} id={`day-t-${i}`} d={d} fill="none" />)}
        {bottomTextPaths.map((d, i) => <path key={`b-${i}`} id={`day-b-${i}`} d={d} fill="none" />)}
      </defs>
      <g style={{ pointerEvents: 'auto' }}>
        {topPills.map((pill, i) => renderPill(pill, topSegs[i], i, true))}
        {bottomPills.map((pill, i) => renderPill(pill, bottomSegs[i], i, false))}
      </g>
    </svg>
  );
}
