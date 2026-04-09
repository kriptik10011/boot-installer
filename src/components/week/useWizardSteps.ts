/**
 * useWizardSteps — Shared state and navigation logic for the weekly review wizard.
 *
 * Consumed by both WeeklyReviewWizardWidget (radial) and WeeklyReviewPanel (traditional/smart).
 * Keeps step state, feeling, data hooks, and timing in one place.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useWeeklyReview } from '@/hooks/useWeeklyReview';
import { usePantrySuggestions } from '@/hooks/usePantrySuggestions';
import { useWizardTiming } from './useWizardTiming';

export const STEPS = [
  { id: 'review', label: 'Review', icon: '1' },
  { id: 'finances', label: 'Finances', icon: '2' },
  { id: 'meals', label: 'Plan Meals', icon: '3' },
  { id: 'shopping', label: 'Shopping', icon: '4' },
  { id: 'intention', label: 'Set Focus', icon: '5' },
] as const;

export function useWizardSteps(onClose: () => void) {
  const [step, setStep] = useState(0);
  const [feeling, setFeeling] = useState<number | null>(null);
  const weekStart = useAppStore((s) => s.currentWeekStart);
  const { data: review } = useWeeklyReview(weekStart);
  const { data: pantry } = usePantrySuggestions(0, 10);
  const timing = useWizardTiming(step, STEPS.length);

  const handleComplete = useCallback(() => {
    timing.recordCompletion();
    onClose();
  }, [timing, onClose]);

  const handleStepClick = useCallback((i: number) => {
    if (i < step) {
      setStep(i);
    } else if (i > step && i <= step + 1) {
      timing.recordAdvance(step);
      setStep(i);
    }
  }, [step, timing]);

  const goNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      timing.recordAdvance(step);
      setStep(step + 1);
    } else {
      handleComplete();
    }
  }, [step, timing, handleComplete]);

  const goBack = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  // Auto-advance timer
  useEffect(() => {
    if (!timing.canAutoAdvance || timing.autoAdvanceMs === null) return;
    if (step >= STEPS.length - 1) return;
    const timer = setTimeout(() => {
      timing.recordAdvance(step);
      setStep(step + 1);
    }, timing.autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [step, timing]);

  return {
    step,
    setStep,
    feeling,
    setFeeling,
    review,
    pantry,
    timing,
    weekStart,
    handleComplete,
    handleStepClick,
    goNext,
    goBack,
    totalSteps: STEPS.length,
  };
}
