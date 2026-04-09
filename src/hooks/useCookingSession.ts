/**
 * useCookingSession Hook
 *
 * Manages cooking session state including:
 * - Session start/end times
 * - Serving size adjustments
 * - Stage tracking (prep/cook)
 * - Completion flow with observation recording
 *
 * Intelligent cooking mode.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { recordAction } from '@/services/observation';
import { mealsApi, inventoryApi } from '@/api/client';
import { useAppStore, type MealSlotContext } from '@/stores/appStore';
import type { Recipe, MealPlanEntry, DepletionResponse } from '@/types';
import { scaleIngredientQuantity, formatDuration } from '@/utils/quantityFormatting';

// Query keys for meals (matching useMeals.ts)
const mealKeys = {
  all: ['meals'] as const,
};

// =============================================================================
// TYPES
// =============================================================================

export type CookingPhase = 'prep' | 'cooking' | 'done';

export interface CookingSession {
  recipeId: number;
  recipeName: string;
  mealId: number | null;
  startTime: Date;
  prepDoneTime: Date | null;
  cookDoneTime: Date | null;
  baseServings: number;
  currentServings: number;
  notes: string;
}

export interface CookingSessionResult {
  actualPrepMinutes: number;
  actualCookMinutes: number;
  totalMinutes: number;
  servings: number;
  notes: string;
}

export interface UseCookingSessionReturn {
  // Session state
  session: CookingSession | null;
  isActive: boolean;
  currentPhase: CookingPhase;
  currentServings: number;
  scaleFactor: number;
  elapsedMinutes: number;

  // Completion overlay state
  showCompletionOverlay: boolean;
  completionResult: CookingSessionResult | null;
  depletionResult: DepletionResponse | null;

  // Actions
  start: (recipe: Recipe, meal: MealPlanEntry | null) => void;
  adjustServings: (servings: number) => void;
  markPrepDone: () => void;
  markCookDone: () => void;
  unmarkPrepDone: () => void;  // For misclick correction
  unmarkCookDone: () => void;  // For misclick correction
  setNotes: (notes: string) => void;
  complete: () => CookingSessionResult;
  confirmCompletion: (adjustedResult?: Partial<CookingSessionResult>) => Promise<void>;
  dismissCompletion: () => void;
  abandon: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useCookingSession(): UseCookingSessionReturn {
  // Get query client for cache invalidation
  const queryClient = useQueryClient();

  // Session state
  const [session, setSession] = useState<CookingSession | null>(null);
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const [completionResult, setCompletionResult] = useState<CookingSessionResult | null>(null);
  const [depletionResult, setDepletionResult] = useState<DepletionResponse | null>(null);
  const confirmingRef = useRef(false);

  // Track elapsed time with interval
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Auto-prompt completion timer (V2 Feature #1: Auto-Prompt Done Cooking)
  const autoPromptTimerRef = useRef<number | null>(null);

  // Update elapsed time every minute
  useEffect(() => {
    if (session) {
      const updateElapsed = () => {
        const elapsed = Math.floor((Date.now() - session.startTime.getTime()) / 60000);
        setElapsedMinutes(elapsed);
      };

      // Update immediately
      updateElapsed();

      // Then every minute
      intervalRef.current = window.setInterval(updateElapsed, 60000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        // Also clear auto-prompt timer on cleanup
        if (autoPromptTimerRef.current) {
          clearTimeout(autoPromptTimerRef.current);
          autoPromptTimerRef.current = null;
        }
      };
    } else {
      setElapsedMinutes(0);
      // Clear auto-prompt timer when session ends
      if (autoPromptTimerRef.current) {
        clearTimeout(autoPromptTimerRef.current);
        autoPromptTimerRef.current = null;
      }
    }
  }, [session]);

  // Derived state
  const isActive = session !== null;

  const currentPhase: CookingPhase = useMemo(() => {
    if (!session) return 'prep';
    if (session.cookDoneTime) return 'done';
    if (session.prepDoneTime) return 'cooking';
    return 'prep';
  }, [session]);

  const currentServings = session?.currentServings ?? 1;

  // Scale factor for ingredient display. The user's final serving count
  // is persisted to the meal entry via mealsApi.completeCooking(), and the
  // backend reads it at depletion time to scale inventory deductions.
  // See: inventory_service.py deplete_inventory_for_meal() scale_factor.
  const scaleFactor = useMemo(() => {
    if (!session) return 1;
    if (session.baseServings === 0) return 1;
    return session.currentServings / session.baseServings;
  }, [session]);

  // Start a cooking session
  const start = useCallback((recipe: Recipe, meal: MealPlanEntry | null) => {
    const baseServings = recipe.servings ?? 1;
    // Use planned_servings from meal if available (persisted user selection)
    const initialServings = meal?.planned_servings ?? baseServings;

    const newSession: CookingSession = {
      recipeId: recipe.id,
      recipeName: recipe.name,
      mealId: meal?.id ?? null,
      startTime: new Date(),
      prepDoneTime: null,
      cookDoneTime: null,
      baseServings,
      currentServings: initialServings,
      notes: '',
    };

    setSession(newSession);
    setShowCompletionOverlay(false);
    setCompletionResult(null);
    setDepletionResult(null);

    // Record observation
    recordAction('cooking_start', 'recipe', recipe.id, {
      meal_id: meal?.id,
      planned_servings: baseServings,
      planned_prep_minutes: recipe.prep_time_minutes,
      planned_cook_minutes: recipe.cook_time_minutes,
    });
  }, []);

  // Adjust serving size (integers only) and persist to meal plan
  const adjustServings = useCallback(async (servings: number) => {
    if (!session) return;

    // Enforce integer, minimum 1
    const newServings = Math.max(1, Math.round(servings));

    setSession(prev => prev ? {
      ...prev,
      currentServings: newServings,
    } : null);

    // Persist to meal plan entry if we have a meal ID
    if (session.mealId) {
      try {
        await mealsApi.update(session.mealId, {
          planned_servings: newServings,
        });
        // Invalidate meal cache so UI reflects the updated servings
        queryClient.invalidateQueries({ queryKey: mealKeys.all });
      } catch (error) {
        // Continue anyway - UI state was updated
      }
    }
  }, [session, queryClient]);

  // Mark prep phase as done
  const markPrepDone = useCallback(() => {
    if (!session || session.prepDoneTime) return;

    setSession(prev => prev ? {
      ...prev,
      prepDoneTime: new Date(),
    } : null);

    recordAction('prep_done', 'recipe', session.recipeId, {
      elapsed_minutes: elapsedMinutes,
    });
  }, [session, elapsedMinutes]);

  // Mark cooking phase as done
  const markCookDone = useCallback(() => {
    if (!session || session.cookDoneTime) return;

    // If prep wasn't marked, mark it now
    const now = new Date();
    const needsPrepMark = !session.prepDoneTime;

    setSession(prev => prev ? {
      ...prev,
      prepDoneTime: needsPrepMark ? now : prev.prepDoneTime,
      cookDoneTime: now,
    } : null);

    recordAction('cook_done', 'recipe', session.recipeId, {
      elapsed_minutes: elapsedMinutes,
    });

    // V2 Feature #1: Auto-Prompt Done Cooking After Mark Complete
    // Start 30-second timer to auto-show completion prompt
    // Clear any existing timer first
    if (autoPromptTimerRef.current) {
      clearTimeout(autoPromptTimerRef.current);
    }
    autoPromptTimerRef.current = window.setTimeout(() => {
      // Only auto-prompt if session is still active and cook is done
      // The complete() function will check session state
      setSession(current => {
        if (current && current.cookDoneTime && !showCompletionOverlay) {
          // Trigger completion overlay by setting the result
          const endTime = new Date();
          const totalMs = endTime.getTime() - current.startTime.getTime();
          const totalMinutes = Math.round(totalMs / 60000);

          let actualPrepMinutes: number;
          let actualCookMinutes: number;

          if (current.prepDoneTime && current.cookDoneTime) {
            actualPrepMinutes = Math.round(
              (current.prepDoneTime.getTime() - current.startTime.getTime()) / 60000
            );
            actualCookMinutes = Math.round(
              (current.cookDoneTime.getTime() - current.prepDoneTime.getTime()) / 60000
            );
          } else if (current.prepDoneTime) {
            actualPrepMinutes = Math.round(
              (current.prepDoneTime.getTime() - current.startTime.getTime()) / 60000
            );
            actualCookMinutes = totalMinutes - actualPrepMinutes;
          } else {
            actualPrepMinutes = Math.round(totalMinutes * 0.3);
            actualCookMinutes = totalMinutes - actualPrepMinutes;
          }

          const result: CookingSessionResult = {
            actualPrepMinutes,
            actualCookMinutes,
            totalMinutes,
            servings: current.currentServings,
            notes: current.notes,
          };

          setCompletionResult(result);
          setShowCompletionOverlay(true);

          // Record that auto-prompt was triggered for intelligence learning
          recordAction('cooking_auto_prompt', 'recipe', current.recipeId, {
            delay_seconds: 30,
            user_initiated: false,
          });
        }
        return current;
      });
    }, 30000); // 30 seconds
  }, [session, elapsedMinutes, showCompletionOverlay]);

  // Unmark prep phase (for misclick correction)
  // Per Intelligence Principles: Track corrections for cognitive load detection
  const unmarkPrepDone = useCallback(() => {
    if (!session || !session.prepDoneTime) return;

    setSession(prev => prev ? {
      ...prev,
      prepDoneTime: null,
    } : null);

    // Record correction for intelligence layer (cognitive load / misclick analysis)
    recordAction('prep_unmarked', 'recipe', session.recipeId, {
      elapsed_minutes: elapsedMinutes,
      correction_type: 'misclick',
    });
  }, [session, elapsedMinutes]);

  // Unmark cooking phase (for misclick correction)
  const unmarkCookDone = useCallback(() => {
    if (!session || !session.cookDoneTime) return;

    // Cancel auto-prompt timer since cooking is no longer done
    if (autoPromptTimerRef.current) {
      clearTimeout(autoPromptTimerRef.current);
      autoPromptTimerRef.current = null;
    }

    setSession(prev => prev ? {
      ...prev,
      cookDoneTime: null,
    } : null);

    // Record correction for intelligence layer
    recordAction('cook_unmarked', 'recipe', session.recipeId, {
      elapsed_minutes: elapsedMinutes,
      correction_type: 'misclick',
    });
  }, [session, elapsedMinutes]);

  // Set notes
  const setNotes = useCallback((notes: string) => {
    setSession(prev => prev ? { ...prev, notes } : null);
  }, []);

  // Complete cooking and calculate results
  const complete = useCallback((): CookingSessionResult => {
    // Clear auto-prompt timer since user is manually completing
    if (autoPromptTimerRef.current) {
      clearTimeout(autoPromptTimerRef.current);
      autoPromptTimerRef.current = null;
    }

    if (!session) {
      return {
        actualPrepMinutes: 0,
        actualCookMinutes: 0,
        totalMinutes: 0,
        servings: 1,
        notes: '',
      };
    }

    const now = new Date();
    const totalMs = now.getTime() - session.startTime.getTime();
    const totalMinutes = Math.round(totalMs / 60000);

    // Calculate prep/cook split
    let actualPrepMinutes: number;
    let actualCookMinutes: number;

    if (session.prepDoneTime && session.cookDoneTime) {
      // User marked both phases
      actualPrepMinutes = Math.round(
        (session.prepDoneTime.getTime() - session.startTime.getTime()) / 60000
      );
      actualCookMinutes = Math.round(
        (session.cookDoneTime.getTime() - session.prepDoneTime.getTime()) / 60000
      );
    } else if (session.prepDoneTime) {
      // Only prep marked
      actualPrepMinutes = Math.round(
        (session.prepDoneTime.getTime() - session.startTime.getTime()) / 60000
      );
      actualCookMinutes = totalMinutes - actualPrepMinutes;
    } else {
      // No phases marked - estimate 30% prep, 70% cook
      actualPrepMinutes = Math.round(totalMinutes * 0.3);
      actualCookMinutes = totalMinutes - actualPrepMinutes;
    }

    const result: CookingSessionResult = {
      actualPrepMinutes,
      actualCookMinutes,
      totalMinutes,
      servings: session.currentServings,
      notes: session.notes,
    };

    setCompletionResult(result);
    setShowCompletionOverlay(true);

    return result;
  }, [session]);

  // Depletion with one retry — returns full response for UI display
  const attemptDepletion = useCallback(async (mealId: number): Promise<DepletionResponse | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await inventoryApi.depletFromCooking(mealId);
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        setDepletionResult(response);
        return response;
      } catch {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    return null;
  }, [queryClient]);

  // Get meal slot context from app store (for auto-assignment when cooking from empty slot)
  const mealSlotContext = useAppStore(state => state.cookingMealSlotContext);

  // Confirm completion (with optional adjustments)
  const confirmCompletion = useCallback(async (
    adjustedResult?: Partial<CookingSessionResult>
  ): Promise<void> => {
    if (!session || !completionResult || confirmingRef.current) return;
    confirmingRef.current = true;

    const finalResult = { ...completionResult, ...adjustedResult };

    // Record the cooking completion observation for pattern learning
    recordAction('cooking_complete', 'meal', session.mealId ?? undefined, {
      recipe_id: session.recipeId,
      recipe_name: session.recipeName,
      planned_servings: session.baseServings,
      actual_servings: finalResult.servings,
      actual_prep_minutes: finalResult.actualPrepMinutes,
      actual_cook_minutes: finalResult.actualCookMinutes,
      total_minutes: finalResult.totalMinutes,
      notes: finalResult.notes,
      start_time: session.startTime.toISOString(),
      end_time: new Date().toISOString(),
    });

    // Update meal slot with cooking data (if meal exists)
    if (session.mealId) {
      try {
        await mealsApi.completeCooking(session.mealId, {
          actual_servings: finalResult.servings,
          actual_prep_minutes: finalResult.actualPrepMinutes,
          actual_cook_minutes: finalResult.actualCookMinutes,
          notes: finalResult.notes || null,
        });

        // Deplete inventory after cooking (blocking with retry)
        await attemptDepletion(session.mealId);
      } catch (error) {
        // Continue anyway - observation was recorded for pattern learning
      }
    } else if (mealSlotContext) {
      // Empty slot was clicked before entering cooking mode - create the meal entry
      // Meal slot auto-assignment after cooking
      try {
        const createdMeal = await mealsApi.create({
          date: mealSlotContext.date,
          meal_type: mealSlotContext.mealType,
          recipe_id: session.recipeId,
          description: null,
        });
        // Record that we auto-created a meal slot (for intelligence learning)
        recordAction('meal_auto_created', 'recipe', session.recipeId, {
          date: mealSlotContext.date,
          meal_type: mealSlotContext.mealType,
          actual_servings: finalResult.servings,
        });

        // Complete cooking on the newly created meal (same as existing-meal path)
        try {
          await mealsApi.completeCooking(createdMeal.id, {
            actual_servings: finalResult.servings,
            actual_prep_minutes: finalResult.actualPrepMinutes,
            actual_cook_minutes: finalResult.actualCookMinutes,
            notes: finalResult.notes || null,
          });

          // Deplete inventory after cooking
          await attemptDepletion(createdMeal.id);
        } catch {
          // Depletion failure must not block meal creation
        }
      } catch {
        // Meal creation failure is already surfaced via the mutation error state
      }
    }

    // Invalidate meals cache so WeekView reflects any changes
    queryClient.invalidateQueries({ queryKey: mealKeys.all });

    // Invalidate shopping list cache — cooking depletes inventory which
    // affects what the shopping list should show (e.g. items now needed)
    queryClient.invalidateQueries({ queryKey: ['shoppingList'] });

    // Invalidate inventory + pattern queries — cooking depletes inventory,
    // which affects low-stock alerts and meal coverage warnings
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['patterns'] });

    // Brief pause so the user can see the depletion summary on the overlay
    await new Promise(r => setTimeout(r, 3000));

    // Clear session
    confirmingRef.current = false;
    setSession(null);
    setShowCompletionOverlay(false);
    setCompletionResult(null);
    setDepletionResult(null);
  }, [session, completionResult, mealSlotContext, attemptDepletion, queryClient]);

  // Dismiss completion overlay (go back to adjust)
  const dismissCompletion = useCallback(() => {
    setShowCompletionOverlay(false);
  }, []);

  // Abandon session without recording
  const abandon = useCallback(() => {
    // Clear auto-prompt timer
    if (autoPromptTimerRef.current) {
      clearTimeout(autoPromptTimerRef.current);
      autoPromptTimerRef.current = null;
    }

    if (session) {
      recordAction('cooking_abandoned', 'recipe', session.recipeId, {
        elapsed_minutes: elapsedMinutes,
      });
    }

    setSession(null);
    setShowCompletionOverlay(false);
    setCompletionResult(null);
    setDepletionResult(null);
  }, [session, elapsedMinutes]);

  return {
    // Session state
    session,
    isActive,
    currentPhase,
    currentServings,
    scaleFactor,
    elapsedMinutes,

    // Completion overlay state
    showCompletionOverlay,
    completionResult,
    depletionResult,

    // Actions
    start,
    adjustServings,
    markPrepDone,
    markCookDone,
    unmarkPrepDone,
    unmarkCookDone,
    setNotes,
    complete,
    confirmCompletion,
    dismissCompletion,
    abandon,
  };
}

// Re-export utility functions from their new home for backwards compatibility
export { scaleIngredientQuantity, formatDuration } from '@/utils/quantityFormatting';
