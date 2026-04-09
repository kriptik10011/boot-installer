/**
 * useEditMode — Long-press detection (2s) with progressive feedback.
 * Move cancellation (10px threshold). Keyboard support (Enter/Escape).
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface EditModeState {
  isEditing: boolean;
  pressProgress: number; // 0-100 — drives border glow animation
}

interface UseEditModeReturn extends EditModeState {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  exitEditMode: () => void;
}

const HOLD_DURATION_MS = 2000;
const MOVE_THRESHOLD_PX = 10;
const PROGRESS_INTERVAL_MS = 50;

export function useEditMode(): UseEditModeReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [pressProgress, setPressProgress] = useState(0);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  // Ref mirrors state for use in callbacks without dependency churn
  const isEditingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
    setPressProgress(0);
    startTimeRef.current = 0;
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isEditingRef.current) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setPressProgress(progress);

      if (elapsed >= HOLD_DURATION_MS) {
        cleanup();
        isEditingRef.current = true;
        setIsEditing(true);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }
    }, PROGRESS_INTERVAL_MS);
  }, [cleanup]);

  const onPointerUp = useCallback(() => {
    if (!isEditingRef.current) cleanup();
  }, [cleanup]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPos.current || isEditingRef.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD_PX) {
      cleanup();
    }
  }, [cleanup]);

  const onPointerCancel = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isEditingRef.current) {
      isEditingRef.current = true;
      setIsEditing(true);
    } else if (e.key === 'Escape' && isEditingRef.current) {
      isEditingRef.current = false;
      setIsEditing(false);
    }
  }, []);

  const exitEditMode = useCallback(() => {
    isEditingRef.current = false;
    setIsEditing(false);
    cleanup();
  }, [cleanup]);

  return {
    isEditing,
    pressProgress,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerCancel,
    onKeyDown,
    exitEditMode,
  };
}
