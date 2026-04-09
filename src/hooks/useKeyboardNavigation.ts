/**
 * useKeyboardNavigation — Grid keyboard navigation for DayCards.
 *
 * Research basis: Neurodivergent-first — keyboard as primary driver.
 * Doherty Threshold — speed creates perceived intelligence.
 *
 * Arrow keys move between cells, Enter opens day, Escape clears focus.
 */

import { useState, useCallback, useRef } from 'react';

interface UseKeyboardNavigationOptions {
  gridSize: number;
  onEnter?: (index: number) => void;
}

interface UseKeyboardNavigationReturn {
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  dayRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

export function useKeyboardNavigation({
  gridSize,
  onEnter,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);

  const moveFocus = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(gridSize - 1, newIndex));
      setFocusedIndex(clamped);
      dayRefs.current[clamped]?.focus();
    },
    [gridSize]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Only handle arrow keys, Enter, Escape
      if (!['ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Home', 'End'].includes(e.key)) {
        return;
      }

      e.preventDefault();

      const current = focusedIndex ?? 0;

      switch (e.key) {
        case 'ArrowLeft':
          moveFocus(current - 1);
          break;
        case 'ArrowRight':
          moveFocus(current + 1);
          break;
        case 'Home':
          moveFocus(0);
          break;
        case 'End':
          moveFocus(gridSize - 1);
          break;
        case 'Enter':
          if (focusedIndex !== null) {
            onEnter?.(focusedIndex);
          }
          break;
        case 'Escape':
          setFocusedIndex(null);
          // Return focus to the grid container
          (e.currentTarget as HTMLElement)?.focus();
          break;
      }
    },
    [focusedIndex, gridSize, moveFocus, onEnter]
  );

  return { focusedIndex, setFocusedIndex, handleKeyDown, dayRefs };
}
