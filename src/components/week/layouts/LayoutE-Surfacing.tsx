/**
 * Layout E: Debug Layout
 *
 * Development-focused layout for debugging the intelligence stack.
 * Shows ONLY the UltimateDebugPanel - no week calendar or summary.
 *
 * The UltimateDebugPanel provides 5-layer debug workbench:
 * OBSERVE -> INFER -> DECIDE -> SURFACE -> ADAPT
 *
 * Lazy-loads the debug panel so it never enters the production bundle.
 */

import { useEffect, lazy, Suspense } from 'react';
import type { DayData, HealthIndicators } from '../types';
import type { Event, FinancialItem, MealPlanEntry, Recipe, MealType } from '@/types';
import { useCurrentMode } from '@/hooks/useCurrentMode';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const UltimateDebugPanel = lazy(() =>
  import('@/components/debug/UltimateDebugPanel').then(m => ({
    default: m.UltimateDebugPanel,
  }))
);

interface LayoutEProps {
  days: DayData[];
  health: HealthIndicators;
  overdueItems: FinancialItem[];
  onEventClick: (event: Event) => void;
  onMealClick: (date: string, mealType: MealType, meal: MealPlanEntry | null, recipe: Recipe | null) => void;
  onBillClick: (bill: FinancialItem) => void;
  onAddEvent?: (date: string) => void;
  onAddBill?: (date: string) => void;
}

export function LayoutESurfacing(_props: LayoutEProps) {
  // Register this view visit for session tracking
  const { registerViewVisit } = useCurrentMode();
  useEffect(() => {
    registerViewVisit('debug');
  }, [registerViewVisit]);

  // Debug layout: ONLY show the UltimateDebugPanel
  // No week calendar or summary - that's what the Week View is for
  return (
    <div className="max-w-5xl mx-auto">
      <ErrorBoundary>
        <Suspense fallback={<div className="p-8 text-slate-400">Loading debug workbench...</div>}>
          <UltimateDebugPanel />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
