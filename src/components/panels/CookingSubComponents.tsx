/**
 * CookingSubComponents — ServingStepper, PhaseIndicator, CompletionOverlay.
 *
 * Extracted from CookingLayout to keep the main file focused on orchestration.
 */

import { useState, useEffect } from 'react';
import { formatDuration, type CookingPhase } from '@/hooks/useCookingSession';
import type { DepletionResponse } from '@/types';

// =============================================================================
// SERVING STEPPER
// =============================================================================

interface ServingStepperProps {
  value: number;
  baseValue: number;
  onChange: (value: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ServingStepper({ value, baseValue, onChange, isCollapsed, onToggleCollapse }: ServingStepperProps) {
  const isScaled = value !== baseValue;

  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
      >
        <span className={`text-lg font-bold ${isScaled ? 'text-amber-400' : 'text-emerald-400'}`}>
          {value}
        </span>
        <span className="text-sm text-slate-400">servings</span>
        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-400">Servings</h3>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Minimize
          </button>
        )}
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => onChange(value - 1)}
          disabled={value <= 1}
          className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-2xl text-white transition-colors"
          aria-label="Decrease servings"
        >
          −
        </button>
        <div className="text-center min-w-[80px]">
          <div className={`text-3xl font-bold ${isScaled ? 'text-amber-400' : 'text-emerald-400'}`}>
            {value}
          </div>
          {isScaled && (
            <div className="text-xs text-slate-500 mt-1">
              (was {baseValue})
            </div>
          )}
        </div>
        <button
          onClick={() => onChange(value + 1)}
          className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-2xl text-white transition-colors"
          aria-label="Increase servings"
        >
          +
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// PHASE INDICATOR
// =============================================================================

interface PhaseIndicatorProps {
  phase: CookingPhase;
  elapsedMinutes: number;
  onPrepToggle: () => void;
  onCookToggle: () => void;
  prepDone: boolean;
  cookDone: boolean;
}

export function PhaseIndicator({
  phase,
  elapsedMinutes,
  onPrepToggle,
  onCookToggle,
  prepDone,
  cookDone,
}: PhaseIndicatorProps) {
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-400">Phase</h3>
        <span className="text-sm text-slate-500">{formatDuration(elapsedMinutes)} elapsed</span>
      </div>

      {/* Phase indicator bar */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className={`flex-1 h-2 rounded-full transition-colors ${
            phase === 'prep' ? 'bg-cyan-500' : 'bg-cyan-500/30'
          }`}
        />
        <div
          className={`flex-1 h-2 rounded-full transition-colors ${
            phase === 'cooking' ? 'bg-amber-500' : prepDone ? 'bg-amber-500/30' : 'bg-slate-700'
          }`}
        />
        <div
          className={`flex-1 h-2 rounded-full transition-colors ${
            phase === 'done' ? 'bg-emerald-500' : cookDone ? 'bg-emerald-500/30' : 'bg-slate-700'
          }`}
        />
      </div>

      {/* Phase labels */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
        <span className={`flex-1 ${phase === 'prep' ? 'text-cyan-400 font-medium' : ''}`}>Prep</span>
        <span className={`flex-1 ${phase === 'cooking' ? 'text-amber-400 font-medium' : ''}`}>Cooking</span>
        <span className={`flex-1 ${phase === 'done' ? 'text-emerald-400 font-medium' : ''}`}>Done</span>
      </div>

      {/* Phase completion buttons - Now TOGGLEABLE (can unmark) */}
      <div className="flex gap-2">
        <button
          onClick={onPrepToggle}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            prepDone
              ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}
          title={prepDone ? 'Click to unmark' : 'Click to mark done'}
        >
          {prepDone ? '✓ Prep Done' : 'Mark Prep Done'}
        </button>
        <button
          onClick={onCookToggle}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            cookDone
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}
          title={cookDone ? 'Click to unmark' : 'Click to mark done'}
        >
          {cookDone ? '✓ Cook Done' : 'Mark Cook Done'}
        </button>
      </div>

      <p className="text-xs text-slate-600 mt-2 text-center">
        Tap again to unmark if needed
      </p>
    </div>
  );
}

// =============================================================================
// COMPLETION OVERLAY
// =============================================================================

interface CompletionOverlayProps {
  recipeName: string;
  servings: number;
  totalMinutes: number;
  depletionResult: DepletionResponse | null;
  onConfirm: () => void;
  onAdjust: () => void;
  onCancel: () => void;
}

export function CompletionOverlay({
  recipeName,
  servings,
  totalMinutes,
  depletionResult,
  onConfirm,
  onAdjust,
  onCancel,
}: CompletionOverlayProps) {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (countdown <= 0) {
      onConfirm();
      return;
    }

    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onConfirm]);

  return (
    <div className="absolute inset-0 bg-slate-900/95 flex items-center justify-center z-10">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Bon appétit!</h2>
        <p className="text-slate-400 mb-4">
          Logged <span className="text-emerald-400 font-medium">{recipeName}</span>
          <br />
          {servings} servings • {formatDuration(totalMinutes)}
        </p>

        {depletionResult && (depletionResult.depleted.length > 0 || depletionResult.skipped.length > 0) && (
          <DepletionSummary depletionResult={depletionResult} />
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={onAdjust}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Adjust Details
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
          >
            Confirm ({countdown}s)
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// DEPLETION SUMMARY (shown inside CompletionOverlay)
// =============================================================================

function formatDepletionAmount(entry: { mode: string; amount_depleted: number }): string {
  if (entry.mode === 'percentage') {
    return `-${Math.round(entry.amount_depleted)}%`;
  }
  const amt = entry.amount_depleted;
  return `-${amt % 1 === 0 ? amt : amt.toFixed(1)}`;
}

function DepletionSummary({ depletionResult }: { depletionResult: DepletionResponse }) {
  const { depleted, skipped } = depletionResult;
  const notInInventory = skipped.filter(s => s.reason === 'not_in_inventory');
  const noIngredientLink = skipped.filter(s => s.reason === 'no_ingredient_link');

  return (
    <div className="mb-4 text-left max-w-sm mx-auto">
      {depleted.length > 0 && (
        <p className="text-xs text-emerald-400 mb-1 max-h-16 overflow-y-auto">
          <span className="font-medium">Updated: </span>
          {depleted.map((d, i) => (
            <span key={d.ingredient_id}>
              {d.ingredient_name} ({formatDepletionAmount(d)})
              {i < depleted.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      )}
      {notInInventory.length > 0 && (
        <p className="text-xs text-amber-400 max-h-12 overflow-y-auto">
          <span className="font-medium">Not in inventory: </span>
          {notInInventory.map(s => s.ingredient_name).join(', ')}
        </p>
      )}
      {noIngredientLink.length > 0 && (
        <p className="text-xs text-slate-400 max-h-12 overflow-y-auto">
          <span className="font-medium">No ingredient link: </span>
          {noIngredientLink.map(s => s.ingredient_name).join(', ')}
        </p>
      )}
    </div>
  );
}
