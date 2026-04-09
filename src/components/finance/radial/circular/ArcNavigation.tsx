/**
 * ArcNavigation — Left/right arc click targets for page navigation.
 *
 * Renders as an SVG <g> inside CircularCard's bezel SVG layer.
 * Two arcs: left (prev) and right (next), each covering 35% of their
 * half-circle (63 degrees), centered at 9 o'clock and 3 o'clock.
 * Hidden when at first/last page respectively.
 */

import { useState, useCallback } from 'react';

interface ArcNavigationProps {
  /** SVG coordinate space size (matches CircularCard viewBox) */
  size: number;
  /** Current page index */
  activeIndex: number;
  /** Total page count */
  cardCount: number;
  /** Navigation callback */
  onNavigate: (direction: 'prev' | 'next') => void;
  /** Arc color (default: slate-400) */
  color?: string;
}

/** Degrees to radians */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** SVG arc path from center (cx,cy) at radius r */
function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const startRad = degToRad(startDeg);
  const endRad = degToRad(startDeg + sweepDeg);
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweepFlag = sweepDeg > 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
}

// Left arc: centered at 180 degrees (9 o'clock), spans 63 degrees
const LEFT_START = 180 - 31.5;  // 148.5
const LEFT_SWEEP = 63;

// Right arc: centered at 0 degrees (3 o'clock), spans 63 degrees
const RIGHT_START = 360 - 31.5; // 328.5
const RIGHT_SWEEP = 63;

export function ArcNavigation({
  size,
  activeIndex,
  cardCount,
  onNavigate,
  color = '#94a3b8',
}: ArcNavigationProps) {
  const [hovered, setHovered] = useState<'prev' | 'next' | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  // Position in the bezel zone, slightly inside the card edge
  const r = (size / 2) * 0.91;
  const visibleStroke = size * 0.005;  // thin visible arc
  const hitStroke = size * 0.06;       // wide invisible hit area

  const showLeft = activeIndex > 0;
  const showRight = activeIndex < cardCount - 1;

  const handleClick = useCallback((dir: 'prev' | 'next', e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(dir);
  }, [onNavigate]);

  if (cardCount <= 1) return null;

  const leftPath = arcPath(cx, cy, r, LEFT_START, LEFT_SWEEP);
  const rightPath = arcPath(cx, cy, r, RIGHT_START, RIGHT_SWEEP);

  return (
    <g>
      {/* Left arc — previous page */}
      {showLeft && (
        <>
          {/* Invisible hit area */}
          <path
            d={leftPath}
            fill="none"
            stroke="transparent"
            strokeWidth={hitStroke}
            strokeLinecap="round"
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            onClick={(e) => handleClick('prev', e)}
            onMouseEnter={() => setHovered('prev')}
            onMouseLeave={() => setHovered(null)}
          />
          {/* Visible arc */}
          <path
            d={leftPath}
            fill="none"
            stroke={color}
            strokeWidth={visibleStroke}
            strokeLinecap="round"
            strokeOpacity={hovered === 'prev' ? 0.6 : 0.2}
            style={{ pointerEvents: 'none', transition: 'stroke-opacity 150ms' }}
            filter={hovered === 'prev' ? 'url(#bezel-glow)' : undefined}
          />
        </>
      )}

      {/* Right arc — next page */}
      {showRight && (
        <>
          {/* Invisible hit area */}
          <path
            d={rightPath}
            fill="none"
            stroke="transparent"
            strokeWidth={hitStroke}
            strokeLinecap="round"
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            onClick={(e) => handleClick('next', e)}
            onMouseEnter={() => setHovered('next')}
            onMouseLeave={() => setHovered(null)}
          />
          {/* Visible arc */}
          <path
            d={rightPath}
            fill="none"
            stroke={color}
            strokeWidth={visibleStroke}
            strokeLinecap="round"
            strokeOpacity={hovered === 'next' ? 0.6 : 0.2}
            style={{ pointerEvents: 'none', transition: 'stroke-opacity 150ms' }}
            filter={hovered === 'next' ? 'url(#bezel-glow)' : undefined}
          />
        </>
      )}
    </g>
  );
}
