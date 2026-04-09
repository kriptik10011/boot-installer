/**
 * HintBubble — Single contextual hint pill.
 *
 * Glass background, pill-shaped, click to permanently dismiss.
 * Auto-dismiss via timer (session-only — reappears next launch).
 * Two variants: info (cyan) and warning (amber, never red).
 */

import { useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FONT_FAMILY, TEXT_COLORS, GLASS, BLUR } from '../cardTemplate';
import type { HintDefinition } from './hintCatalog';

const VARIANT_STYLES = {
  info: {
    borderColor: 'rgba(34, 211, 238, 0.20)',
    dotColor: '#22d3ee',
  },
  warning: {
    borderColor: 'rgba(217, 119, 6, 0.20)',
    dotColor: '#d97706',
  },
} as const;

interface HintBubbleProps {
  hint: HintDefinition;
  onDismiss: (id: string, permanent: boolean) => void;
}

export function HintBubble({ hint, onDismiss }: HintBubbleProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });
  const style = VARIANT_STYLES[hint.variant];

  // Auto-dismiss (session-only, not permanent). Ref prevents timer reset on re-renders.
  useEffect(() => {
    if (hint.autoDismissMs > 0) {
      timerRef.current = setTimeout(() => onDismissRef.current(hint.id, false), hint.autoDismissMs);
      return () => clearTimeout(timerRef.current);
    }
    return () => {};
  }, [hint.id, hint.autoDismissMs]);

  // Click = permanent dismiss. stopPropagation prevents the radial container's
  // click handler from running on the same event (it computes hit zones from
  // mouse coords and could otherwise misfire on the hint position). Both
  // onPointerDown and onClick are wired so the dismissal lands no matter what
  // the parent gesture system does with click vs pointerdown semantics.
  const handleClick = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    clearTimeout(timerRef.current);
    onDismiss(hint.id, true);
  }, [hint.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      onPointerDown={handleClick}
      onClick={handleClick}
      role="button"
      aria-label={`Dismiss hint: ${hint.message}`}
      tabIndex={0}
      style={{
        background: GLASS.subtle,
        backdropFilter: BLUR.light,
        WebkitBackdropFilter: BLUR.light,
        border: `1px solid ${style.borderColor}`,
        borderRadius: '9999px',
        padding: '0.6em 1.2em',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5em',
        maxWidth: 320,
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: style.dotColor,
          flexShrink: 0,
          boxShadow: `0 0 6px 1px ${style.dotColor}40`,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontFamily: FONT_FAMILY,
          color: TEXT_COLORS.primary,
          lineHeight: 1.3,
        }}
      >
        {hint.message}
      </span>
    </motion.div>
  );
}
