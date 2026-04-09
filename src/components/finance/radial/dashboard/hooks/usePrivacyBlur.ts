/**
 * usePrivacyBlur — Blurs financial data when the tab loses focus (alt-tab).
 * Listens to document.visibilitychange and provides a blur state.
 * Users can also manually toggle privacy mode.
 */

import { useState, useEffect, useCallback } from 'react';

interface PrivacyBlurState {
  isBlurred: boolean;
  isAutoBlur: boolean;
  toggleManualBlur: () => void;
}

export function usePrivacyBlur(autoBlurEnabled = true): PrivacyBlurState {
  const [isAutoBlur, setIsAutoBlur] = useState(false);
  const [isManualBlur, setIsManualBlur] = useState(false);

  useEffect(() => {
    if (!autoBlurEnabled) return;

    function handleVisibilityChange() {
      setIsAutoBlur(document.hidden);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [autoBlurEnabled]);

  const toggleManualBlur = useCallback(() => {
    setIsManualBlur((prev) => !prev);
  }, []);

  return {
    isBlurred: isAutoBlur || isManualBlur,
    isAutoBlur,
    toggleManualBlur,
  };
}
