/**
 * Panel Types
 *
 * Types for contextual panel components.
 */

import type { MealType } from '@/types';
import type { MealSlotContext } from '@/stores/appStore';

export type PanelType = 'event' | 'meal' | 'bill' | 'shopping' | 'settings' | 'inventory' | 'import' | 'recipes' | 'finance' | 'review' | null;

// Callback for entering cooking mode with optional meal slot context for auto-assignment
export type EnterCookingModeCallback = (
  recipeId: number,
  mealId: number | null,
  mealSlotContext?: MealSlotContext
) => void;

export interface ContextPanelProps {
  type: PanelType;
  itemId: number | null;
  date?: string;
  mealType?: MealType;
  isOccurrence?: boolean;      // True if viewing a recurring occurrence
  occurrenceDate?: string;     // The specific occurrence date
  isFullscreen: boolean;
  inlineMode?: boolean;        // Render inline (below grid) instead of fixed overlay
  onClose: () => void;
  onToggleFullscreen: () => void;
  onEnterCookingMode?: EnterCookingModeCallback;
}

export interface EventPanelProps {
  eventId: number | null;
  date?: string;
  isOccurrence?: boolean;      // True if this is a recurring occurrence, not the master
  occurrenceDate?: string;     // The specific occurrence date being viewed
  onClose: () => void;
}

export interface MealPanelProps {
  mealId: number | null;
  date?: string;
  mealType?: MealType;
  onClose: () => void;
  onEnterCookingMode?: EnterCookingModeCallback;
}

export interface BillPanelProps {
  billId: number | null;
  date?: string;
  onClose: () => void;
}

export interface ShoppingPanelProps {
  weekStart: string;
  onClose: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export interface SettingsPanelProps {
  onClose: () => void;
}

export interface InventoryPanelProps {
  onClose: () => void;
}

export interface RecipePanelProps {
  onClose: () => void;
  onSelectForMeal?: (recipe: import('@/types').Recipe) => void;
  initialRecipeId?: number;
}

export interface FinancePanelProps {
  onClose: () => void;
}
