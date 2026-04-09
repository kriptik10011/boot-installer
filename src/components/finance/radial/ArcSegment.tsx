/**
 * ArcSegment — V3 hairline arc with outer labels, lattice beam, and contextual hover stats.
 *
 * Visual: Ultra-thin 1px stroke (barely visible at rest), soft glow on hover.
 * Hit area: 40px invisible stroke for easy mouse targeting.
 * Labels: Outside the ring as positioned <text>, NOT curved textPath.
 * Lattice beam: Decorative dots + line under label on hover.
 * Hover stat: Contextual data (e.g. "78% health") below label on hover.
 */

import { useId, useMemo } from 'react';
import {
  hairlineArcPath,
  outerLabelPosition,
  outerStatPosition,
  latticeBeamGeometry,
  curvedTextPath,
  type ArcConfig,
  type ArcPosition,
  VIEWBOX_SIZE,
} from './utils/arcGeometry';
import { useAppStore } from '@/stores/appStore';

interface ArcSegmentProps {
  config: ArcConfig;
  isHovered: boolean;
  isActive: boolean;
  hoverStat?: string;
  onClick: (arc: ArcPosition) => void;
  reducedMotion: boolean;
  /** When true, use config values directly (skip store overrides) */
  useConfigDirect?: boolean;
}

export function ArcSegment({
  config,
  isHovered,
  isActive,
  hoverStat,
  onClick,
  reducedMotion,
  useConfigDirect = false,
}: ArcSegmentProps) {
  const id = useId();
  const { position, startAngle, endAngle } = config; // positions are not user-configurable

  // Store-driven overrides — bypassed in sub-arc mode (useConfigDirect)
  const storeColors = useAppStore((s) => s.latticePrefs.arcColors);
  const storeLabels = useAppStore((s) => s.latticePrefs.arcLabels);
  const color = useConfigDirect ? config.color : (storeColors?.[position] ?? config.color);
  const label = useConfigDirect ? config.label : (storeLabels?.[position] ?? config.label);

  const arcD = useMemo(() => hairlineArcPath(startAngle, endAngle), [startAngle, endAngle]);
  const labelPos = useMemo(() => outerLabelPosition(position), [position]);
  const statPos = useMemo(() => outerStatPosition(position), [position]);
  const beam = useMemo(() => latticeBeamGeometry(position), [position]);
  const textPathD = useMemo(
    () => curvedTextPath(position, startAngle, endAngle),
    [position, startAngle, endAngle],
  );

  const glowFilterId = `arc-glow-v3-${id}`;
  const textPathId = `arc-text-path-${id}`;

  const transition = reducedMotion ? 'none' : 'all 200ms ease-out';

  return (
    <g
      role="button"
      aria-label={`${label} section${hoverStat ? ` — ${hoverStat}` : ''}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(position);
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <defs>
        {/* Glow filter — userSpaceOnUse avoids rectangular clipping artifacts */}
        <filter
          id={glowFilterId}
          x="0" y="0"
          width={VIEWBOX_SIZE}
          height={VIEWBOX_SIZE}
          filterUnits="userSpaceOnUse"
          primitiveUnits="userSpaceOnUse"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>
        {/* Curved path for textPath morph (text follows arc at rest) */}
        <path id={textPathId} d={textPathD} fill="none" />
      </defs>

      {/* Invisible hit area — 40px wide for easy targeting */}
      <path
        d={arcD}
        fill="none"
        stroke="transparent"
        strokeWidth={40}
        strokeLinecap="round"
      />

      {/* Glow layer on hover/active — rendered BEFORE hairline so it's behind */}
      {(isHovered || isActive) && (
        <path
          d={arcD}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeOpacity={0.4}
          strokeLinecap="round"
          filter={`url(#${glowFilterId})`}
        />
      )}

      {/* Hairline arc — barely visible at rest, brighter on hover/active */}
      <path
        d={arcD}
        fill="none"
        stroke={color}
        strokeWidth={isHovered || isActive ? 1.5 : 1}
        strokeOpacity={isHovered || isActive ? 0.6 : 0.15}
        strokeLinecap="round"
        style={{ transition }}
      />

      {/* Curved label (textPath on arc) — visible at rest, fades on hover */}
      {(() => {
        // Longer labels need smaller font/spacing to fit the arc
        const isLong = label.length > 8;
        return (
          <text
            fill={color}
            fontSize={isLong ? 9 : 11}
            fontWeight={500}
            fontFamily="'Space Grotesk', system-ui, sans-serif"
            letterSpacing={isLong ? '1.5px' : '3px'}
            opacity={isHovered || isActive ? 0 : 0.6}
            style={{ transition }}
          >
            <textPath
              href={`#${textPathId}`}
              startOffset="50%"
              textAnchor="middle"
            >
              {label}
            </textPath>
          </text>
        );
      })()}

      {/* Straight label (positioned text) — fades in on hover */}
      {(() => {
        const isLong = label.length > 8;
        return (
          <text
            x={labelPos.x}
            y={labelPos.y}
            textAnchor={labelPos.textAnchor}
            fill={color}
            fontSize={isLong ? 12 : 15}
            fontWeight={700}
            fontFamily="'Space Grotesk', system-ui, sans-serif"
            letterSpacing={isLong ? '1.5px' : '3px'}
            opacity={isHovered || isActive ? 1 : 0}
            style={{ transition }}
          >
            {label}
          </text>
        );
      })()}

      {/* Contextual stat on hover (e.g. "78% health") */}
      {isHovered && hoverStat && (
        <text
          x={statPos.x}
          y={statPos.y}
          textAnchor={statPos.textAnchor}
          fill={color}
          fontSize={11}
          fontWeight={400}
          fontFamily="'Space Grotesk', system-ui, sans-serif"
          letterSpacing="0.5px"
          opacity={0.7}
        >
          {hoverStat}
        </text>
      )}

      {/* Lattice beam — decorative line + dots under label on hover */}
      {isHovered && (
        <g opacity={0.5}>
          {/* Main beam line */}
          <line
            x1={beam.x1}
            y1={beam.y1}
            x2={beam.x2}
            y2={beam.y2}
            stroke={color}
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />
          {/* Evenly-spaced dots along beam */}
          {beam.dotPositions.map((dot, i) => (
            <circle
              key={i}
              cx={dot.x}
              cy={dot.y}
              r={1.5}
              fill={color}
              opacity={0.6}
            />
          ))}
          {/* Soft glow on center dot */}
          <circle
            cx={beam.dotPositions[2].x}
            cy={beam.dotPositions[2].y}
            r={3}
            fill={color}
            opacity={0.2}
            filter={`url(#${glowFilterId})`}
          />
        </g>
      )}

      {/* Hover pulse on arc (subtle animation) */}
      {isHovered && !reducedMotion && (
        <path
          d={arcD}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeLinecap="round"
          strokeOpacity={0.3}
        >
          <animate
            attributeName="stroke-opacity"
            values="0.15;0.4;0.15"
            dur="2s"
            repeatCount="indefinite"
          />
        </path>
      )}
    </g>
  );
}
