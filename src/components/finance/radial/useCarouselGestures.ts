/**
 * useCarouselGestures — Shared wheel/touch gesture handling for card carousels.
 * Extracted from CardCarousel + JunctionCarousel during unification.
 */

import { useCallback, useRef } from 'react';

interface UseCarouselGesturesOptions {
  onScrollCard: (delta: number, maxIndex: number) => void;
  maxIndex: number;
}

export function useCarouselGestures({ onScrollCard, maxIndex }: UseCarouselGesturesOptions) {
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      if (wheelTimerRef.current !== null) return;
      const delta = e.deltaY > 0 ? 1 : -1;
      onScrollCard(delta, maxIndex);
      wheelTimerRef.current = setTimeout(() => {
        wheelTimerRef.current = null;
      }, 150);
    },
    [onScrollCard, maxIndex]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartYRef.current === null) return;
      const deltaY = touchStartYRef.current - e.changedTouches[0].clientY;
      touchStartYRef.current = null;
      if (Math.abs(deltaY) > 50) {
        onScrollCard(deltaY > 0 ? 1 : -1, maxIndex);
      }
    },
    [onScrollCard, maxIndex]
  );

  return { handleWheel, handleTouchStart, handleTouchEnd };
}
