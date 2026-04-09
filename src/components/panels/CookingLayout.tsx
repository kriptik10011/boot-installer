/**
 * CookingLayout Component
 *
 * Fullscreen side-by-side layout for cooking mode:
 * - Left panel: Instructions (large, readable text) with stage tracking
 * - Right panel: Serving stepper, scaled ingredients, recipe info
 *
 * Features:
 * - Serving size stepper (integers only) with ingredient scaling
 * - Stage tracking (Prep → Cooking → Done)
 * - Passive time capture
 * - Completion overlay with smart defaults
 *
 * UX Patterns:
 * - Large tap targets (44px min)
 * - Diegetic timers (ambient, not ticking clocks)
 * - One-tap completion with exception reporting
 *
 * ARCHITECTURE (Per Intelligence Principles):
 * - This is a COGNITIVE MODE SHIFT, not a CSS overlay
 * - App renders CookingLayout OR WeekView, never both
 * - No position:fixed or z-index hacks needed
 * - DND auto-enables for context gating
 *
 * Sub-components: ./CookingSubComponents.tsx
 * Helpers:        ./cookingHelpers.ts
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  useCookingSession,
  formatDuration,
} from '@/hooks/useCookingSession';
import { useChefNotes, useRecipeDurationEstimate } from '@/hooks/useRecipeInsights';
import type { Recipe, MealPlanEntry, RecipeIngredient } from '@/types';
import {
  parseInstructions,
  parseIngredientsFromNotes,
  extractIngredientsForStep,
  scaleStringQuantity,
} from './cookingHelpers';
import { ServingStepper, PhaseIndicator, CompletionOverlay } from './CookingSubComponents';

interface CookingLayoutProps {
  recipe: Recipe;
  meal: MealPlanEntry | null;
  onClose: () => void;
  onDone?: () => void;
}

export function CookingLayout({ recipe, meal, onClose, onDone }: CookingLayoutProps) {
  const cookingSession = useCookingSession();

  // Start session on mount
  useEffect(() => {
    cookingSession.start(recipe, meal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch intelligence data
  const { data: chefNotes } = useChefNotes(recipe.id, 3);
  const { data: durationEstimate } = useRecipeDurationEstimate(recipe.id);

  // Track which steps are completed
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // UI State: Collapsed serving stepper
  const [servingStepperCollapsed, setServingStepperCollapsed] = useState(false);
  const servingStepperTimeoutRef = useRef<number | null>(null);

  // Auto-collapse serving stepper after 10 seconds of inactivity
  useEffect(() => {
    if (!servingStepperCollapsed) {
      if (servingStepperTimeoutRef.current) {
        clearTimeout(servingStepperTimeoutRef.current);
      }
      servingStepperTimeoutRef.current = window.setTimeout(() => {
        setServingStepperCollapsed(true);
      }, 10000);
    }

    return () => {
      if (servingStepperTimeoutRef.current) {
        clearTimeout(servingStepperTimeoutRef.current);
      }
    };
  }, [servingStepperCollapsed]);

  // Reset timer when servings are adjusted
  const handleServingsChange = useCallback((value: number) => {
    cookingSession.adjustServings(value);
    if (servingStepperTimeoutRef.current) {
      clearTimeout(servingStepperTimeoutRef.current);
    }
    servingStepperTimeoutRef.current = window.setTimeout(() => {
      setServingStepperCollapsed(true);
    }, 10000);
  }, [cookingSession]);

  // Parse instructions into steps
  const steps = useMemo(() => parseInstructions(recipe.instructions), [recipe.instructions]);

  // Get ingredients from recipe - prefer API data, fallback to parsing notes
  const ingredients: RecipeIngredient[] = useMemo(() => {
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      return recipe.ingredients;
    }
    return parseIngredientsFromNotes(recipe.notes);
  }, [recipe.ingredients, recipe.notes]);

  // Pre-compute inline ingredients for each step
  const stepIngredients = useMemo(() => {
    return steps.map(step => extractIngredientsForStep(step, ingredients));
  }, [steps, ingredients]);

  // Toggle step completion
  const toggleStep = (index: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Toggle prep done (un-markable for misclicks)
  const togglePrepDone = useCallback(() => {
    if (cookingSession.session?.prepDoneTime) {
      cookingSession.unmarkPrepDone?.();
    } else {
      cookingSession.markPrepDone();
    }
  }, [cookingSession]);

  // Toggle cook done (un-markable for misclicks)
  const toggleCookDone = useCallback(() => {
    if (cookingSession.session?.cookDoneTime) {
      cookingSession.unmarkCookDone?.();
    } else {
      cookingSession.markCookDone();
    }
  }, [cookingSession]);

  const allStepsComplete = steps.length > 0 && completedSteps.size === steps.length;

  const handleDoneCooking = useCallback(() => {
    cookingSession.complete();
  }, [cookingSession]);

  const handleConfirmCompletion = useCallback(async () => {
    await cookingSession.confirmCompletion();
    onDone?.();
  }, [cookingSession, onDone]);

  const handleCancelCompletion = useCallback(() => {
    cookingSession.dismissCompletion();
  }, [cookingSession]);

  const handleClose = useCallback(() => {
    cookingSession.abandon();
    onClose();
  }, [cookingSession, onClose]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Completion Overlay */}
      {cookingSession.showCompletionOverlay && cookingSession.completionResult && (
        <CompletionOverlay
          recipeName={recipe.name}
          servings={cookingSession.completionResult.servings}
          totalMinutes={cookingSession.completionResult.totalMinutes}
          depletionResult={cookingSession.depletionResult}
          onConfirm={handleConfirmCompletion}
          onAdjust={handleCancelCompletion}
          onCancel={handleCancelCompletion}
        />
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
        <button
          onClick={handleClose}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">{recipe.name}</h1>
          <p className="text-sm text-slate-400">
            {cookingSession.elapsedMinutes > 0
              ? `${formatDuration(cookingSession.elapsedMinutes)} elapsed`
              : 'Just started'}
          </p>
        </div>

        <button
          onClick={handleDoneCooking}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            allStepsComplete
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Done Cooking
        </button>
      </header>

      {/* Main Content - Side-by-side layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 overflow-hidden">
        {/* Left Panel: Instructions WITH Ingredients Side-by-Side */}
        <div className="flex flex-col bg-slate-900 lg:border-r border-slate-700 min-h-0">
          {/* Header with serving stepper (collapsible once chosen) */}
          <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Instructions
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {completedSteps.size} of {steps.length} steps completed
              </p>
            </div>
            <ServingStepper
              value={cookingSession.currentServings}
              baseValue={recipe.servings ?? 1}
              onChange={handleServingsChange}
              isCollapsed={servingStepperCollapsed}
              onToggleCollapse={() => setServingStepperCollapsed(!servingStepperCollapsed)}
            />
          </div>

          {/* Two-column content: Instructions + Ingredients reference */}
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_280px] overflow-hidden">
            {/* Instructions with inline ingredients */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {steps.length > 0 ? (
                steps.map((step, index) => {
                  const inlineIngs = stepIngredients[index] || [];
                  return (
                    <button
                      key={index}
                      onClick={() => toggleStep(index)}
                      className={`w-full text-left p-4 rounded-lg transition-all ${
                        completedSteps.has(index)
                          ? 'bg-emerald-900/30 border-2 border-emerald-500/50'
                          : 'bg-slate-800/50 border-2 border-transparent hover:border-slate-600'
                      }`}
                    >
                      <div className="flex gap-4">
                        <div
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold text-lg ${
                            completedSteps.has(index)
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {completedSteps.has(index) ? (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="flex-1">
                          <p
                            className={`text-lg leading-relaxed ${
                              completedSteps.has(index) ? 'text-slate-400 line-through' : 'text-white'
                            }`}
                          >
                            {step}
                          </p>
                          {inlineIngs.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {inlineIngs.map((ing, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center px-2 py-1 rounded text-sm ${
                                    completedSteps.has(index)
                                      ? 'bg-slate-700/50 text-slate-500'
                                      : 'bg-cyan-900/40 text-cyan-300'
                                  }`}
                                >
                                  <span className="font-medium mr-1">
                                    {scaleStringQuantity(ing.quantity, cookingSession.scaleFactor)} {ing.unit}
                                  </span>
                                  {ing.ingredient_name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-6 bg-slate-800/50 rounded-lg">
                  <p className="text-lg text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {recipe.instructions}
                  </p>
                </div>
              )}
            </div>

            {/* Ingredients reference panel - always visible on desktop */}
            <div className="hidden xl:flex flex-col bg-slate-800/20 border-l border-slate-700 overflow-hidden">
              <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  All Ingredients
                  {cookingSession.scaleFactor !== 1 && (
                    <span className="text-xs text-amber-500">(×{cookingSession.scaleFactor.toFixed(1)})</span>
                  )}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {ingredients.length > 0 ? (
                  ingredients.map((ing, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-slate-300 py-1">
                      <span className="font-medium text-cyan-400 min-w-[60px]">
                        {scaleStringQuantity(ing.quantity, cookingSession.scaleFactor)} {ing.unit}
                      </span>
                      <span>{ing.ingredient_name}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 italic">
                    No ingredients found. Import a recipe with ingredients or add them in recipe notes.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Phase & Controls */}
        <div className="flex flex-col bg-slate-800/30 min-h-0">
          <div className="px-4 py-4 bg-slate-800/50 border-b border-slate-700">
            <h2 className="text-base font-semibold text-amber-400 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Progress
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <PhaseIndicator
              phase={cookingSession.currentPhase}
              elapsedMinutes={cookingSession.elapsedMinutes}
              onPrepToggle={togglePrepDone}
              onCookToggle={toggleCookDone}
              prepDone={cookingSession.session?.prepDoneTime !== null}
              cookDone={cookingSession.session?.cookDoneTime !== null}
            />

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {durationEstimate?.source === 'personalized'
                    ? durationEstimate.prep_minutes
                    : (recipe.prep_time_minutes || '—')}
                </div>
                <div className="text-sm text-slate-400">
                  min prep
                  {durationEstimate?.source === 'personalized' && (
                    <span className="text-cyan-500 ml-1">✦</span>
                  )}
                </div>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {durationEstimate?.source === 'personalized'
                    ? durationEstimate.cook_minutes
                    : (recipe.cook_time_minutes || '—')}
                </div>
                <div className="text-sm text-slate-400">
                  min cook
                  {durationEstimate?.source === 'personalized' && (
                    <span className="text-amber-500 ml-1">✦</span>
                  )}
                </div>
              </div>
            </div>

            {/* Personalized Duration Notice */}
            {durationEstimate?.source === 'personalized' && (
              <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded-lg">
                <p className="text-sm text-cyan-300">
                  <span className="font-medium">✦ Personalized times</span> based on your {durationEstimate.sample_count} previous cooking sessions
                </p>
              </div>
            )}

            {/* Chef's Notes */}
            {chefNotes && chefNotes.length > 0 && (
              <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                <h3 className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Your Past Notes
                </h3>
                <ul className="space-y-1.5">
                  {chefNotes.slice(0, 2).map((note, index) => (
                    <li key={index} className="text-xs text-slate-300">
                      "{note.note}"
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ingredients on mobile */}
            <div className="xl:hidden">
              {ingredients.length > 0 && (
                <details className="bg-slate-800/50 rounded-lg">
                  <summary className="px-3 py-2 text-sm font-medium text-slate-400 cursor-pointer hover:text-slate-300">
                    View All Ingredients ({ingredients.length})
                    {cookingSession.scaleFactor !== 1 && (
                      <span className="text-amber-400 ml-2">(×{cookingSession.scaleFactor.toFixed(1)})</span>
                    )}
                  </summary>
                  <ul className="px-3 pb-3 space-y-1.5">
                    {ingredients.map((ing, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <span className="text-cyan-400 font-medium">
                          {scaleStringQuantity(ing.quantity, cookingSession.scaleFactor)} {ing.unit}
                        </span>
                        <span>{ing.ingredient_name}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            {/* Meal Info */}
            {meal && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Planned For</h3>
                <p className="text-white">
                  {new Date(meal.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-slate-400 capitalize">{meal.meal_type}</p>
              </div>
            )}

            {/* Notes */}
            {recipe.notes && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Notes</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{recipe.notes}</p>
              </div>
            )}

            {/* Steps Progress */}
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>Steps</span>
                <span>{completedSteps.size}/{steps.length}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
                  style={{
                    width: steps.length > 0
                      ? `${(completedSteps.size / steps.length) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>

            {/* Tip */}
            <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded-lg">
              <p className="text-xs text-cyan-300">
                Tap steps to complete. Ingredients scale with servings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
