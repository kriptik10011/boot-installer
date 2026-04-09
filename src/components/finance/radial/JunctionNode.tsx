/**
 * JunctionNode — Interactive SVG junction point at diagonal corners.
 *
 * V6: Option C — No backdrop, compact icons, thin strokes (0.7px).
 *   Active state scales up (1.15x) with color shift. Icon IS the button.
 *   NW (SHOP) = bag, NE (DASH) = 2x2 grid, SE (HABITS) = check circle, SW (SETTINGS) = gear
 *   Label visibility controlled by latticePrefs.showJunctionLabels (default true).
 */

import { motion } from 'framer-motion';
import { junctionPosition, getJunctionColor, getJunctionLabel, type JunctionConfig, type JunctionId, type JunctionIcon } from './utils/arcGeometry';
import { useAppStore } from '@/stores/appStore';

interface JunctionNodeProps {
  config: JunctionConfig;
  isActive: boolean;
  reducedMotion: boolean;
  /** When true, use config.color/label directly instead of store-driven overrides */
  useConfigDirect?: boolean;
}

const HIT_R = 28;       // invisible hit area (generous for click targets)

/** Default icon mapping from junction ID */
const DEFAULT_ICON_MAP: Record<JunctionId, JunctionIcon> = {
  nw: 'bag',
  ne: 'grid',
  se: 'check',
  sw: 'gear',
};

/**
 * Compact ghost icons — thin stroke (0.7px), no backdrop, scaled down ~80%.
 * Centered on (0,0) in a ~10x10 box.
 */
function junctionIconElements(iconType: JunctionIcon, color: string): React.ReactElement[] {
  const s = { fill: 'none', stroke: color, strokeWidth: 0.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (iconType) {
    // SHOP — minimal bag silhouette (scaled 80%)
    case 'bag':
      return [
        <path key="bag" d="M-2.8,0 L-2.8,4.4 L2.8,4.4 L2.8,0" {...s} />,
        <path key="handle" d="M-1.2,0 L-1.2,-2 C-1.2,-3.6 1.2,-3.6 1.2,-2 L1.2,0" {...s} />,
      ];

    // DASH — 2x2 grid of rounded squares (scaled 80%)
    case 'grid':
      return [
        <rect key="tl" x={-4.4} y={-4.4} width={3.6} height={3.6} rx={0.8} {...s} />,
        <rect key="tr" x={0.8} y={-4.4} width={3.6} height={3.6} rx={0.8} {...s} />,
        <rect key="bl" x={-4.4} y={0.8} width={3.6} height={3.6} rx={0.8} {...s} />,
        <rect key="br" x={0.8} y={0.8} width={3.6} height={3.6} rx={0.8} {...s} />,
      ];

    // HABITS — checkmark circle (scaled 80%)
    case 'check':
      return [
        <circle key="ring" cx={0} cy={0} r={4.8} {...s} />,
        <path key="check" d="M-2,0.4 L-0.4,2 L2.4,-1.2" {...s} />,
      ];

    // SETTINGS — simple gear (hex outline + center dot, scaled 80%)
    case 'gear':
      return [
        <path key="gear" d="M0,-4.8 L2.8,-3.6 L4.4,-0.8 L4.4,0.8 L2.8,3.6 L0,4.8 L-2.8,3.6 L-4.4,0.8 L-4.4,-0.8 L-2.8,-3.6 Z" {...s} />,
        <circle key="center" cx={0} cy={0} r={1.6} {...s} />,
      ];

    // ADD — plus sign in circle
    case 'plus':
      return [
        <circle key="ring" cx={0} cy={0} r={4.8} {...s} />,
        <path key="h" d="M-2.4,0 L2.4,0" {...s} />,
        <path key="v" d="M0,-2.4 L0,2.4" {...s} />,
      ];
  }
}

/** Label offset based on quadrant — closer since no backdrop */
function labelOffset(id: JunctionId): { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' } {
  switch (id) {
    case 'nw': return { dx: 0, dy: 20, anchor: 'middle' };
    case 'ne': return { dx: 0, dy: 20, anchor: 'middle' };
    case 'se': return { dx: 0, dy: -14, anchor: 'middle' };
    case 'sw': return { dx: 0, dy: -14, anchor: 'middle' };
  }
}

export function JunctionNode({ config, isActive, reducedMotion, useConfigDirect }: JunctionNodeProps) {
  // Store-driven overrides (subscriptions trigger re-render when prefs change)
  useAppStore((s) => s.latticePrefs.junctionColors);
  useAppStore((s) => s.latticePrefs.junctionLabels);
  const showLabels = useAppStore((s) => s.latticePrefs.showJunctionLabels) ?? true;
  const color = useConfigDirect ? config.color : getJunctionColor(config.id);
  const label = useConfigDirect ? config.label : getJunctionLabel(config.id);

  const pos = junctionPosition(config);
  const offset = labelOffset(config.id);
  const iconColor = isActive ? color : '#94a3b8';
  const iconType = config.icon ?? DEFAULT_ICON_MAP[config.id];
  const iconElements = junctionIconElements(iconType, iconColor);

  return (
    <motion.g
      style={{ cursor: 'pointer', transformOrigin: `${pos.x}px ${pos.y}px` }}
      animate={isActive && !reducedMotion ? { scale: 1.15 } : { scale: 1 }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 20 }}
    >
      {/* Invisible hit area */}
      <circle cx={pos.x} cy={pos.y} r={HIT_R} fill="transparent" />

      {/* Icon group — no backdrop, just floating icons */}
      <motion.g
        transform={`translate(${pos.x}, ${pos.y})`}
        animate={{ opacity: isActive ? 1 : 0.45 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
      >
        {iconElements}
      </motion.g>

      {/* Label — toggled by showJunctionLabels setting */}
      {showLabels && (
        <text
          x={pos.x + offset.dx}
          y={pos.y + offset.dy}
          textAnchor={offset.anchor}
          fill={isActive ? color : '#64748b'}
          fontSize={9}
          fontWeight={600}
          fontFamily="'Space Grotesk', system-ui"
          letterSpacing="0.1em"
        >
          {label}
        </text>
      )}
    </motion.g>
  );
}
