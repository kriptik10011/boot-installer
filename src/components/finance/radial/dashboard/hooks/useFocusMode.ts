/**
 * useFocusMode — Spotlight a single card, dimming all others.
 * Click a card to focus it (enlarges + dims siblings).
 * Click again or press Escape to unfocus.
 */

import { useState, useCallback, useEffect } from 'react';

interface FocusModeState {
  focusedCard: string | null;
  isFocusMode: boolean;
  focusCard: (cardId: string) => void;
  unfocus: () => void;
  getCardOpacity: (cardId: string) => number;
  getCardScale: (cardId: string) => number;
}

export function useFocusMode(): FocusModeState {
  const [focusedCard, setFocusedCard] = useState<string | null>(null);

  const focusCard = useCallback((cardId: string) => {
    setFocusedCard((prev) => (prev === cardId ? null : cardId));
  }, []);

  const unfocus = useCallback(() => {
    setFocusedCard(null);
  }, []);

  useEffect(() => {
    if (!focusedCard) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setFocusedCard(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCard]);

  const getCardOpacity = useCallback(
    (cardId: string) => {
      if (!focusedCard) return 1;
      return focusedCard === cardId ? 1 : 0.25;
    },
    [focusedCard]
  );

  const getCardScale = useCallback(
    (cardId: string) => {
      if (!focusedCard) return 1;
      return focusedCard === cardId ? 1.02 : 0.98;
    },
    [focusedCard]
  );

  return {
    focusedCard,
    isFocusMode: focusedCard !== null,
    focusCard,
    unfocus,
    getCardOpacity,
    getCardScale,
  };
}
