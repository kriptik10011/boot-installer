/**
 * useMealContext - Intelligent Meal Display Context Detection
 *
 * Determines whether to show Planning Layout or Cooking Layout based on:
 * 1. Time of day (morning/midday/afternoon/evening/night)
 * 2. Meal slot clicked (breakfast/lunch/dinner)
 * 3. Planning vs Living mode (from useCurrentMode)
 * 4. Whether a recipe exists
 *
 * Planning Layout: Recipe selection prominent, ingredients collapsed
 * Cooking Layout: Side-by-side fullscreen (instructions + ingredients)
 */

import { useMemo } from 'react';
import { useCurrentMode } from './useCurrentMode';
import type { MealType } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
export type DisplayMode = 'planning' | 'cooking';

export interface MealContext {
  // Inputs
  mealType: MealType;
  mealDate: string;
  hasRecipe: boolean;

  // Detected state
  isPlanningMode: boolean;
  isLivingMode: boolean;
  timeOfDay: TimeOfDay;
  isMealTimeNow: boolean;

  // Decisions
  displayMode: DisplayMode;
  shouldAutoFullscreen: boolean;

  // Debug info
  reason: string;
  modeConfidence: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Time windows for each time slot (24-hour format)
const TIME_WINDOWS: Record<TimeOfDay, { start: number; end: number }> = {
  morning: { start: 6, end: 10 },    // 6am - 10am
  midday: { start: 10, end: 14 },    // 10am - 2pm
  afternoon: { start: 14, end: 17 }, // 2pm - 5pm
  evening: { start: 17, end: 21 },   // 5pm - 9pm
  night: { start: 21, end: 6 },      // 9pm - 6am (wraps)
};

// Which meal type corresponds to which time slot
const MEAL_TIME_MAPPING: Record<MealType, TimeOfDay> = {
  breakfast: 'morning',
  lunch: 'midday',
  dinner: 'evening',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine current time of day based on hour.
 */
function getTimeOfDay(hour: number): TimeOfDay {
  // Check each time window
  for (const [slot, window] of Object.entries(TIME_WINDOWS) as [TimeOfDay, { start: number; end: number }][]) {
    if (slot === 'night') {
      // Night wraps around midnight
      if (hour >= window.start || hour < window.end) {
        return 'night';
      }
    } else {
      if (hour >= window.start && hour < window.end) {
        return slot;
      }
    }
  }
  // Default fallback
  return 'afternoon';
}

/**
 * Check if current time is within an hour of a meal's typical time.
 */
function isWithinMealTime(currentHour: number, mealType: MealType): boolean {
  const mealTimeSlot = MEAL_TIME_MAPPING[mealType];
  const window = TIME_WINDOWS[mealTimeSlot];

  // Extended window: ±1 hour from the standard window
  const extendedStart = window.start - 1;
  const extendedEnd = window.end + 1;

  return currentHour >= extendedStart && currentHour < extendedEnd;
}

/**
 * Check if the meal date is today.
 */
function isMealToday(mealDate: string): boolean {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  return mealDate === todayStr;
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useMealContext(
  mealType: MealType,
  mealDate: string,
  hasRecipe: boolean
): MealContext {
  const { isPlanningMode, isLivingMode, confidence, reason: modeReason } = useCurrentMode();

  const context = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const timeOfDay = getTimeOfDay(currentHour);

    // Is the meal for today?
    const isToday = isMealToday(mealDate);

    // Does the time of day match the meal slot?
    const expectedTimeSlot = MEAL_TIME_MAPPING[mealType];
    const timeMatchesMealSlot = timeOfDay === expectedTimeSlot;

    // Is it within an hour of typical meal time?
    const isNearMealTime = isWithinMealTime(currentHour, mealType);

    // Combined: Is this the current/next meal the user should be cooking?
    const isMealTimeNow = isToday && isNearMealTime;

    // Decision logic for display mode
    let displayMode: DisplayMode = 'planning';
    let shouldAutoFullscreen = false;
    let reason = '';

    if (!hasRecipe) {
      // No recipe = always planning mode (can't cook without a recipe)
      displayMode = 'planning';
      shouldAutoFullscreen = false;
      reason = 'No recipe selected - showing planning layout';
    } else if (isPlanningMode) {
      // In planning mode = always planning layout
      displayMode = 'planning';
      shouldAutoFullscreen = false;
      reason = `Planning mode detected (${modeReason})`;
    } else if (isLivingMode && isMealTimeNow) {
      // Living mode + meal time matches + has recipe = cooking mode!
      displayMode = 'cooking';
      shouldAutoFullscreen = true;
      reason = `Cooking time! ${mealType} during ${timeOfDay} with recipe available`;
    } else if (isLivingMode && !isToday) {
      // Living mode but viewing future/past date = planning
      displayMode = 'planning';
      shouldAutoFullscreen = false;
      reason = 'Viewing meal for different day - showing planning layout';
    } else if (isLivingMode && isToday && !timeMatchesMealSlot) {
      // Living mode, today, but wrong time slot = planning
      displayMode = 'planning';
      shouldAutoFullscreen = false;
      reason = `Current time (${timeOfDay}) doesn't match ${mealType} time - showing planning layout`;
    } else {
      // Default: planning mode
      displayMode = 'planning';
      shouldAutoFullscreen = false;
      reason = 'Default: planning layout';
    }

    return {
      mealType,
      mealDate,
      hasRecipe,
      isPlanningMode,
      isLivingMode,
      timeOfDay,
      isMealTimeNow,
      displayMode,
      shouldAutoFullscreen,
      reason,
      modeConfidence: confidence,
    };
  }, [mealType, mealDate, hasRecipe, isPlanningMode, isLivingMode, confidence, modeReason]);

  return context;
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Get human-readable label for time of day.
 */
export function getTimeOfDayLabel(timeOfDay: TimeOfDay): string {
  const labels: Record<TimeOfDay, string> = {
    morning: 'Morning',
    midday: 'Midday',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',
  };
  return labels[timeOfDay];
}

/**
 * Get the expected time slot for a meal type.
 */
export function getMealTimeSlot(mealType: MealType): TimeOfDay {
  return MEAL_TIME_MAPPING[mealType];
}
