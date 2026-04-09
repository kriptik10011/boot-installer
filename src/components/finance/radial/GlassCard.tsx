/**
 * GlassCard — Shared frosted glass card used by both arc and junction carousels.
 *
 * Circular-only: 3-zone layout via CircularCard (core inscribed zone + bezel arcs).
 */

import { type ReactNode } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { CircularCard, type ArcNavConfig, type BezelArc } from './circular';
import { useGlassStyle } from './cardTemplate';

interface GlassCardProps {
  label: string;
  color: string;
  activeIndex: number;
  cardCount: number;
  labels: string[];
  widgets: ReactNode[];
  slideVariants: Variants;
  reducedMotion: boolean;
  /** Optional bezel arcs for circular mode (progress rings, directional arcs) */
  bezelArcs?: BezelArc[];
  /** Optional custom SVG content for the bezel zone */
  bezelSvg?: ReactNode;
  /** Hide the label/sublabel header to give more space to content */
  hideHeader?: boolean;
  /** Arc navigation config — renders left/right click arcs for page switching */
  arcNavConfig?: ArcNavConfig;
  /** Callback when arc navigation is clicked */
  onArcNavigate?: (direction: 'prev' | 'next') => void;
}

export function GlassCard({
  label,
  color,
  activeIndex,
  cardCount,
  labels,
  widgets,
  slideVariants,
  reducedMotion,
  bezelArcs,
  bezelSvg,
  hideHeader = false,
  arcNavConfig,
  onArcNavigate,
}: GlassCardProps) {
  const glass = useGlassStyle();

  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{
        ...glass,
        borderRadius: '50%',
        aspectRatio: '1',
      }}
    >
      <CircularCard bezelArcs={bezelArcs} bezelSvg={bezelSvg} arcNavConfig={arcNavConfig} onArcNavigate={onArcNavigate} arcNavColor={color}>
        {/* Header row — centered (hidden when hideHeader) */}
        {!hideHeader && (
          <div className="flex flex-col items-center pb-1 shrink-0">
            <div
              className="text-xs font-bold tracking-wider truncate text-center"
              style={{ color, fontFamily: "'Space Grotesk', system-ui" }}
            >
              {label}
            </div>
            <div className="text-[9px] text-slate-500">{labels[Math.min(activeIndex, labels.length - 1)]}</div>
          </div>
        )}

        {/* Widget content — overflow hidden, container queries from CircularCard */}
        <div className="flex-1 overflow-hidden relative min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={`card-${activeIndex}`}
              className="w-full h-full"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            >
              {widgets[Math.min(activeIndex, widgets.length - 1)]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot indicators — hidden when single widget */}
        {cardCount > 1 && (
          <div className="flex items-center justify-center gap-2 pt-1 shrink-0">
            {Array.from({ length: cardCount }, (_, i) => (
              <motion.div
                key={i}
                className="rounded-full"
                style={{
                  width: 5,
                  height: 5,
                  backgroundColor: i === activeIndex ? color : '#475569',
                  boxShadow: i === activeIndex ? `0 0 6px 2px ${color}50` : 'none',
                }}
                animate={{
                  scale: i === activeIndex ? 1.2 : 1,
                  opacity: i === activeIndex ? 1 : 0.5,
                }}
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
              />
            ))}
          </div>
        )}
      </CircularCard>
    </div>
  );
}
