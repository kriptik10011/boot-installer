/**
 * Week View Types
 *
 * Types for the single-page contextual week view components.
 */

import type {
  Event,
  FinancialItem,
  MealPlanEntry,
  Recipe,
  LensType,
  MealType,
} from '@/types';


// ============================================================================
// DAY CARD DATA
// ============================================================================

export interface DayData {
  date: string;              // ISO date "2026-01-20"
  dayName: string;           // "Monday"
  dayShort: string;          // "Mon"
  dayNumber: number;         // 20
  isToday: boolean;
  isPast: boolean;           // River of Time: "sediment" layer
  isFuture: boolean;         // River of Time: "foggy" layer
  events: Event[];
  meals: {
    breakfast: MealPlanEntry | null;
    lunch: MealPlanEntry | null;
    dinner: MealPlanEntry | null;
    breakfastRecipe: Recipe | null;
    lunchRecipe: Recipe | null;
    dinnerRecipe: Recipe | null;
  };
  bills: FinancialItem[];    // Bills due this day
  hasConflict: boolean;      // Overlapping event times
  isOverloaded: boolean;     // 5+ events
}

// ============================================================================
// HEALTH INDICATORS
// ============================================================================

export interface HealthIndicators {
  overdueCount: number;
  conflictDays: number;
  unplannedMeals: number;
  overloadedDays: number;
}

// ============================================================================
// PANEL STATE
// ============================================================================

export type PanelType = 'event' | 'meal' | 'bill' | 'shopping' | 'settings' | 'inventory' | 'import' | 'recipes' | 'finance' | 'review' | null;

export interface PanelState {
  type: PanelType;
  itemId: number | null;
  date?: string;           // For meal slots
  mealType?: MealType;     // For meal slots
  isOccurrence?: boolean;  // True if viewing a recurring occurrence
  occurrenceDate?: string; // The specific occurrence date
  isFullscreen: boolean;
}

// Cooking mode state - managed at WeekView level for true fullscreen
export interface CookingState {
  recipeId: number;
  mealId: number | null;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface WeekHeaderProps {
  weekStart: string;
  health: HealthIndicators;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSettingsClick: () => void;
  onInventoryClick?: () => void;
  onShoppingClick?: () => void;
  onShoppingModeClick?: () => void;  // Opens shopping in fullscreen "at store" mode
  onRecipeHubClick?: () => void;     // Opens Recipe Hub panel
  onFinanceClick?: () => void;       // Opens Finance panel
  onWeeklyReviewClick?: () => void;  // Opens Weekly Review Wizard
}

export interface DayCardProps {
  day: DayData;
  lens?: LensType;  // Deprecated: kept for backwards compat, defaults to 'normal'
  isFocused?: boolean;  // Keyboard navigation focus ring
  onEventClick: (event: Event) => void;
  onMealClick: (date: string, mealType: MealType, meal: MealPlanEntry | null, recipe: Recipe | null) => void;
  onBillClick: (bill: FinancialItem) => void;
  onAddEvent: (date: string) => void;
  onAddMeal: (date: string, mealType: MealType) => void;
  onAddBill?: (date: string) => void;
}

export interface DayCardItemProps {
  type: 'event' | 'meal' | 'bill';
  label: string;
  sublabel?: string;
  isEmpty?: boolean;
  isOverdue?: boolean;
  isPaid?: boolean;
  hasConflict?: boolean;
  isRecurring?: boolean;  // Shows repeat icon for recurring events/bills
  cookTimeMinutes?: number | null;  // Reference Class: show estimated time for meals
  lens?: LensType;  // Deprecated: kept for backwards compat, defaults to 'normal'
  onClick: () => void;
}

// ============================================================================
// COMMAND PALETTE ACTIONS
// ============================================================================

export interface CommandActions {
  // Navigation
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToThisWeek: () => void;
  // Panels
  openEventPanel: () => void;
  openMealPanel: () => void;
  openShoppingPanel: () => void;
  openInventoryPanel: () => void;
  openRecipeHubPanel: () => void;
  openFinancePanel: () => void;
  openSettingsPanel: () => void;
  // Quick Actions
  addEvent: () => void;
  addMeal: () => void;
  openShoppingMode: () => void;
  startWeeklyReview: () => void;
  whatCanICook: () => void;
  addTransaction: () => void;
  addBill: () => void;
  checkBudget: () => void;
  // View
  switchToTraditional: () => void;
  switchToIntelligent: () => void;
  toggleFinanceView: () => void;
  // Mode
  togglePlanningLiving: () => void;
}

// ============================================================================
// WEEK VIEW PROPS
// ============================================================================

export interface WeekViewProps {
  // Optional - for testing with mock data
  initialWeekStart?: string;
}
