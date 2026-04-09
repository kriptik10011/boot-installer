/**
 * useOnboarding — Step state + validation for the 3-step onboarding wizard.
 *
 * Steps: 0=Welcome, 1=Customize, 2=Get Started
 * Persists mid-flow via appStore.onboardingStep so reload resumes.
 */

import { useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';

export const ONBOARDING_STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'customize', label: 'Customize' },
  { id: 'get-started', label: 'Get Started' },
] as const;

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export function useOnboarding() {
  const onboardingStep = useAppStore((s) => s.onboardingStep);
  const setOnboardingStep = useAppStore((s) => s.setOnboardingStep);
  const completeFirstRun = useAppStore((s) => s.completeFirstRun);
  const modules = useAppStore((s) => s.modules);
  const setModuleEnabled = useAppStore((s) => s.setModuleEnabled);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const uiMode = useAppStore((s) => s.uiMode);
  const setUiMode = useAppStore((s) => s.setUiMode);

  const currentStep = onboardingStep;

  const goNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setOnboardingStep(currentStep + 1);
    }
  }, [currentStep, setOnboardingStep]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setOnboardingStep(currentStep - 1);
    }
  }, [currentStep, setOnboardingStep]);

  const finish = useCallback(() => {
    setOnboardingStep(0);
    completeFirstRun();
  }, [setOnboardingStep, completeFirstRun]);

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOTAL_STEPS - 1;

  return {
    currentStep,
    isFirstStep,
    isLastStep,
    goNext,
    goBack,
    finish,
    modules,
    setModuleEnabled,
    theme,
    setTheme,
    uiMode,
    setUiMode,
  };
}
