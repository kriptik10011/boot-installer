/**
 * HintLayer — Positioned container for contextual hints.
 *
 * Renders in the bottom-left corner of the parent panel, outside the radial
 * circle's arc click zones. The radial click handler computes hit zones from
 * normalized mouse coordinates against arc rings (dist 0.84-1.10) and junction
 * positions; placing hints in a corner eliminates any chance of overlap with
 * those zones AND keeps the hints visually separated from the lattice.
 *
 * pointerEvents:none on the container, auto on individual pills (the bubbles
 * also stopPropagation on click so the radial gesture system stays out of it).
 * Max 2 hints visible, stacked vertically with AnimatePresence.
 */

import { AnimatePresence } from 'framer-motion';
import { useHints } from './useHints';
import { HintBubble } from './HintBubble';
import type { HintContext } from './hintCatalog';

interface HintLayerProps {
  context: HintContext;
}

export function HintLayer({ context }: HintLayerProps) {
  const { activeHints, dismissHint } = useHints(context);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 24,
        zIndex: 60,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 8,
        maxWidth: 'calc(100% - 48px)',
      }}
    >
      <AnimatePresence mode="popLayout">
        {activeHints.map((hint) => (
          <HintBubble key={hint.id} hint={hint} onDismiss={dismissHint} />
        ))}
      </AnimatePresence>
    </div>
  );
}
