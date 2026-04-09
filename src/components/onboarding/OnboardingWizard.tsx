/**
 * OnboardingWizard — 3-step first-run experience
 *
 * Steps:
 * 1. Welcome — App overview, feature highlights
 * 2. Customize — Toggle modules, select theme, choose view mode
 * 3. Get Started — "Start Fresh" or "Load Sample Data"
 *
 * Follows WeeklyReviewWizard modal pattern. Replaces FirstRunWelcome.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnboarding, ONBOARDING_STEPS, TOTAL_STEPS } from '@/hooks/useOnboarding';
import { loadSampleData } from '@/services/sampleData';
import { trapFocus, handleModalKeyDown } from '@/utils/accessibility';
import type { ModuleSettings, ThemeMode, UiMode } from '@/stores/appStore';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const {
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
  } = useOnboarding();

  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save previous focus + trap focus in dialog
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Focus first focusable element
    const firstFocusable = dialog.querySelector<HTMLElement>(
      'button, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const cleanup = trapFocus(dialog);
    return () => {
      cleanup();
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleStartFresh = useCallback(() => {
    finish();
    onComplete();
  }, [finish, onComplete]);

  const handleLoadSampleData = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadSampleData();
      queryClient.invalidateQueries();
      finish();
      onComplete();
    } finally {
      setIsLoading(false);
    }
  }, [queryClient, finish, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handleModalKeyDown(e, handleStartFresh);
    },
    [handleStartFresh]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Weekly Review"
        className="max-w-lg w-full mx-4 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden"
      >
        {/* Step Indicator */}
        <div className="px-8 pt-6">
          <StepIndicator currentStep={currentStep} />
        </div>

        {/* Step Content */}
        <div className="px-8 pb-2">
          {currentStep === 0 && <WelcomeStep />}
          {currentStep === 1 && (
            <CustomizeStep
              modules={modules}
              onModuleToggle={setModuleEnabled}
              theme={theme}
              onThemeChange={setTheme}
              uiMode={uiMode}
              onUiModeChange={setUiMode}
            />
          )}
          {currentStep === 2 && (
            <GetStartedStep
              isLoading={isLoading}
              onStartFresh={handleStartFresh}
              onLoadSampleData={handleLoadSampleData}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="px-8 pb-6 pt-4 flex items-center justify-between">
          {!isFirstStep ? (
            <button
              onClick={goBack}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {!isLastStep && (
            <button
              onClick={goNext}
              className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold
                         rounded-xl transition-colors text-sm shadow-lg shadow-cyan-500/25"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Step Indicator ---

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {ONBOARDING_STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < currentStep
                ? 'bg-emerald-500 text-white'
                : i === currentStep
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-700 text-slate-400'
            }`}
          >
            {i < currentStep ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              String(i + 1)
            )}
          </div>
          {i < TOTAL_STEPS - 1 && (
            <div className={`w-12 h-0.5 mx-1 ${i < currentStep ? 'bg-emerald-500' : 'bg-slate-700'}`} />
          )}
        </div>
      ))}
      <span className="ml-3 text-xs text-slate-500">
        {ONBOARDING_STEPS[currentStep].label}
      </span>
    </div>
  );
}

// --- Step 1: Welcome ---

function WelcomeStep() {
  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Welcome to Weekly Review</h1>
        <p className="text-slate-400">Your personal command center for the week ahead</p>
      </div>

      <div className="space-y-4">
        <FeatureHighlight
          icon={<CalendarIcon />}
          color="cyan"
          title="Events & Schedule"
          description="Plan your week with appointments, meetings, and tasks"
        />
        <FeatureHighlight
          icon={<BookIcon />}
          color="emerald"
          title="Meal Planning"
          description='Know what you&#39;re eating each day - no more "what&#39;s for dinner?"'
        />
        <FeatureHighlight
          icon={<DollarIcon />}
          color="amber"
          title="Bills & Finances"
          description="Track what's due and never miss a payment"
        />
      </div>
    </div>
  );
}

// --- Step 2: Customize ---

interface CustomizeStepProps {
  modules: ModuleSettings;
  onModuleToggle: (module: keyof ModuleSettings, enabled: boolean) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  uiMode: UiMode;
  onUiModeChange: (mode: UiMode) => void;
}

function CustomizeStep({
  modules,
  onModuleToggle,
  theme,
  onThemeChange,
  uiMode,
  onUiModeChange,
}: CustomizeStepProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Customize Your Experience</h2>
      <p className="text-sm text-slate-400 mb-5">You can change these anytime in Settings.</p>

      {/* Modules */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Modules</h3>
        <div className="space-y-2">
          <ToggleRow
            label="Events & Schedule"
            checked={modules.events}
            onChange={(v) => onModuleToggle('events', v)}
          />
          <ToggleRow
            label="Meal Planning"
            checked={modules.meals}
            onChange={(v) => onModuleToggle('meals', v)}
          />
          <ToggleRow
            label="Bills & Finances"
            checked={modules.bills}
            onChange={(v) => onModuleToggle('bills', v)}
          />
        </div>
      </div>

      {/* Theme */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Theme</h3>
        <div className="flex gap-2">
          <ThemeButton label="Dark" active={theme === 'dark'} onClick={() => onThemeChange('dark')} />
          <ThemeButton label="Light" active={theme === 'light'} onClick={() => onThemeChange('light')} />
          <ThemeButton label="System" active={theme === 'system'} onClick={() => onThemeChange('system')} />
        </div>
      </div>

      {/* View Mode */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">View Mode</h3>
        <div className="flex gap-2">
          <ThemeButton label="Grid" active={uiMode === 'traditional'} onClick={() => onUiModeChange('traditional')} />
          <ThemeButton label="Smart" active={uiMode === 'intelligent'} onClick={() => onUiModeChange('intelligent')} />
        </div>
      </div>
    </div>
  );
}

// --- Step 3: Get Started ---

interface GetStartedStepProps {
  isLoading: boolean;
  onStartFresh: () => void;
  onLoadSampleData: () => Promise<void>;
}

function GetStartedStep({ isLoading, onStartFresh, onLoadSampleData }: GetStartedStepProps) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">You're All Set!</h2>
      <p className="text-sm text-slate-400 mb-6">
        Start with a clean slate or explore with sample data to see how everything works.
      </p>

      <div className="space-y-3">
        <button
          onClick={onStartFresh}
          disabled={isLoading}
          className="w-full py-3 px-6 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500
                     text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25
                     hover:shadow-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Fresh
        </button>

        <button
          onClick={onLoadSampleData}
          disabled={isLoading}
          className="w-full py-3 px-6 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white
                     border border-slate-600 rounded-xl transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading sample week...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Explore with sample data
            </>
          )}
        </button>

        <p className="text-xs text-slate-500">
          Sample data shows what a typical week looks like. You can delete it anytime.
        </p>
      </div>
    </div>
  );
}

// --- Shared sub-components ---

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 cursor-pointer transition-colors">
      <span className="text-sm text-slate-200">{label}</span>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-slate-600 rounded-full peer-checked:bg-cyan-500 transition-colors" />
        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
      </div>
    </label>
  );
}

function ThemeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
          : 'bg-slate-700/30 text-slate-400 border border-transparent hover:bg-slate-700/50'
      }`}
    >
      {label}
    </button>
  );
}

function FeatureHighlight({
  icon,
  color,
  title,
  description,
}: {
  icon: React.ReactNode;
  color: 'cyan' | 'emerald' | 'amber';
  title: string;
  description: string;
}) {
  const bgClass = {
    cyan: 'bg-cyan-500/20',
    emerald: 'bg-emerald-500/20',
    amber: 'bg-amber-500/20',
  }[color];

  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg ${bgClass} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-white">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );
}

// --- Icons ---

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
