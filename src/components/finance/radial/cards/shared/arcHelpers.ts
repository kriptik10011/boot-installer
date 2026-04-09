/**
 * Shared arc geometry helpers for bezel-arc SVG overlays.
 * Extracted from MealWidgets.tsx / PantryWidgets.tsx / FinanceWidgets.tsx.
 */

/** Build an SVG arc path from center (cx,cy), radius r, start angle and sweep (degrees). */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  sweepDeg: number,
): string {
  if (Math.abs(sweepDeg) < 0.01) return '';
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(startDeg + sweepDeg));
  const y2 = cy + r * Math.sin(toRad(startDeg + sweepDeg));
  const large = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweep = sweepDeg > 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

/**
 * Build a closed SVG path for an annular sector (arc band between two radii).
 * Optional cornerRadius adds rounded corners at the four radial edges
 * by offsetting arc endpoints and inserting small connecting arcs.
 */
export function annularSectorPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  sweepDeg: number,
  cornerRadius = 0,
): string {
  if (Math.abs(sweepDeg) < 0.01) return '';
  const toRad = (d: number) => (d * Math.PI) / 180;
  const endDeg = startDeg + sweepDeg;
  const large = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweep = sweepDeg > 0 ? 1 : 0;

  if (cornerRadius <= 0) {
    // Sharp corners — original path
    const ox1 = cx + outerR * Math.cos(toRad(startDeg));
    const oy1 = cy + outerR * Math.sin(toRad(startDeg));
    const ox2 = cx + outerR * Math.cos(toRad(endDeg));
    const oy2 = cy + outerR * Math.sin(toRad(endDeg));
    const ix1 = cx + innerR * Math.cos(toRad(endDeg));
    const iy1 = cy + innerR * Math.sin(toRad(endDeg));
    const ix2 = cx + innerR * Math.cos(toRad(startDeg));
    const iy2 = cy + innerR * Math.sin(toRad(startDeg));
    return [
      `M ${ox1} ${oy1}`,
      `A ${outerR} ${outerR} 0 ${large} ${sweep} ${ox2} ${oy2}`,
      `L ${ix1} ${iy1}`,
      // Inner arc goes opposite direction to close the shape
      `A ${innerR} ${innerR} 0 ${large} ${1 - sweep} ${ix2} ${iy2}`,
      'Z',
    ].join(' ');
  }

  // Rounded corners: offset arc endpoints by cornerRadius angular distance,
  // then draw small arcs at the 4 corners connecting outer↔inner
  const cr = Math.min(cornerRadius, (outerR - innerR) / 2);
  const oOffset = (cr / outerR) * (180 / Math.PI); // angular offset on outer arc
  const iOffset = (cr / innerR) * (180 / Math.PI); // angular offset on inner arc
  const dir = sweepDeg > 0 ? 1 : -1;

  // Outer arc: inset start/end by oOffset
  const oS = startDeg + oOffset * dir;
  const oE = endDeg - oOffset * dir;
  const ox1 = cx + outerR * Math.cos(toRad(oS));
  const oy1 = cy + outerR * Math.sin(toRad(oS));
  const ox2 = cx + outerR * Math.cos(toRad(oE));
  const oy2 = cy + outerR * Math.sin(toRad(oE));

  // Inner arc: inset start/end by iOffset (reversed direction)
  const iS = endDeg - iOffset * dir;
  const iE = startDeg + iOffset * dir;
  const ix1 = cx + innerR * Math.cos(toRad(iS));
  const iy1 = cy + innerR * Math.sin(toRad(iS));
  const ix2 = cx + innerR * Math.cos(toRad(iE));
  const iy2 = cy + innerR * Math.sin(toRad(iE));

  // Outer arc sweep (may be shorter than original due to offset)
  const oSweep = (oE - oS) * dir;
  const oLarge = Math.abs(oSweep) > 180 ? 1 : 0;
  const iSweep = (iE - iS) * dir;
  const iLarge = Math.abs(iSweep) > 180 ? 1 : 0;

  return [
    `M ${ox1} ${oy1}`,
    // Outer arc (shortened by corner offsets)
    `A ${outerR} ${outerR} 0 ${oLarge} ${sweep} ${ox2} ${oy2}`,
    // Corner: outer-end → inner-end (small arc)
    `A ${cr} ${cr} 0 0 ${sweep} ${ix1} ${iy1}`,
    // Inner arc (shortened, reversed direction)
    `A ${innerR} ${innerR} 0 ${iLarge} ${1 - sweep} ${ix2} ${iy2}`,
    // Corner: inner-start → outer-start (small arc)
    `A ${cr} ${cr} 0 0 ${sweep} ${ox1} ${oy1}`,
    'Z',
  ].join(' ');
}

/** Compute the (x,y) point on a circle at the given angle (degrees). */
export function circlePoint(
  cx: number,
  cy: number,
  r: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
