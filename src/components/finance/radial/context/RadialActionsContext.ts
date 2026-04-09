/**
 * RadialActionsContext — Provides navigation actions to self-fetching widgets.
 *
 * useRadialNavigation uses local useState — widgets CANNOT call it independently.
 * This context is the single source of truth for navigation actions, provided by
 * RadialDashboard and consumed by widgets via useRadialActions().
 */

import { createContext, useContext } from 'react';
import type { ArcPosition } from '../utils/arcGeometry';

export interface RadialActions {
  enterSubArc: (arc: ArcPosition, from?: ArcPosition) => void;
  viewWeek: () => void;
  viewFinances: () => void;
  viewInventory: () => void;
  browseRecipes: () => void;
  startCooking: (recipeId: number, mealId: number, mealType?: string) => void;
  addEvent: () => void;
  addBill: () => void;
  addMeal: () => void;
}

const RadialActionsContext = createContext<RadialActions | null>(null);

export const RadialActionsProvider = RadialActionsContext.Provider;

export function useRadialActions(): RadialActions {
  const ctx = useContext(RadialActionsContext);
  if (!ctx) {
    throw new Error('useRadialActions must be used within RadialActionsProvider');
  }
  return ctx;
}
