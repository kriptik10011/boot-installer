/**
 * useWizardTiming — localStorage-based intelligence for auto-advancing wizard steps.
 *
 * Tracks time between last user interaction and next-click per step.
 * After 3 completed reviews, auto-advance converges to user's natural pace.
 *
 * Storage key: 'weekly-review-timing'
 * Per-step: last 10 readings, median * 1.2 for auto-advance delay.
 * Floor: 2s minimum auto-advance delay.
 */

import { useRef, useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'weekly-review-timing';
const MAX_READINGS = 10;
const MIN_REVIEWS_FOR_AUTO = 3;
const MIN_DELAY_MS = 2000;
const BUFFER_MULTIPLIER = 1.2;

interface TimingData {
  completedReviews: number;
  steps: Record<number, number[]>; // step index -> last N delays in ms
}

function loadTiming(): TimingData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TimingData;
  } catch { /* ignore corrupt data */ }
  return { completedReviews: 0, steps: {} };
}

function saveTiming(data: TimingData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full — degrade gracefully */ }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function useWizardTiming(currentStep: number, totalSteps: number) {
  const lastActionRef = useRef(Date.now());
  const timingRef = useRef(loadTiming());
  const [autoAdvanceMs, setAutoAdvanceMs] = useState<number | null>(null);

  // Recalculate auto-advance delay when step changes
  useEffect(() => {
    const data = timingRef.current;
    if (data.completedReviews < MIN_REVIEWS_FOR_AUTO) {
      setAutoAdvanceMs(null);
      return;
    }
    const readings = data.steps[currentStep];
    if (!readings || readings.length < 2) {
      setAutoAdvanceMs(null);
      return;
    }
    const delay = Math.max(MIN_DELAY_MS, Math.round(median(readings) * BUFFER_MULTIPLIER));
    setAutoAdvanceMs(delay);
  }, [currentStep]);

  // Reset last-action timestamp on step change
  useEffect(() => {
    lastActionRef.current = Date.now();
  }, [currentStep]);

  /** Call on any user interaction (click, type, select) to reset the timer */
  const recordInteraction = useCallback(() => {
    lastActionRef.current = Date.now();
  }, []);

  /** Call when user clicks Next — records the delay for this step */
  const recordAdvance = useCallback((stepIndex: number) => {
    const delay = Date.now() - lastActionRef.current;
    const data = timingRef.current;
    const readings = data.steps[stepIndex] ?? [];
    const updated = [...readings, delay].slice(-MAX_READINGS);
    data.steps[stepIndex] = updated;
    timingRef.current = data;
    saveTiming(data);
    lastActionRef.current = Date.now();
  }, []);

  /** Call when user completes the full wizard */
  const recordCompletion = useCallback(() => {
    const data = timingRef.current;
    data.completedReviews += 1;
    timingRef.current = data;
    saveTiming(data);
  }, []);

  /** Whether auto-advance is available (enough history) */
  const canAutoAdvance = autoAdvanceMs !== null;

  return {
    autoAdvanceMs,
    canAutoAdvance,
    recordInteraction,
    recordAdvance,
    recordCompletion,
  };
}
