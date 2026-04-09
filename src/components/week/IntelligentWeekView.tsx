/**
 * IntelligentWeekView Component
 *
 * The "Smart" mode wrapper that renders LayoutD (main) or LayoutE (debug).
 * Intelligence data fetching is handled by LayoutDHybrid independently.
 * This component provides: plan repair, layout switching, bill repair handling.
 */

import { useMemo, useState, useCallback, lazy, Suspense } from 'react';
import type { DayData, HealthIndicators } from './types';
import type { Event, FinancialItem, MealPlanEntry, Recipe, MealType } from '@/types';
import {
  LayoutDHybrid,
  type LayoutVariant,
} from './layouts';
import { DEBUG_MODE } from '@/config/debug';

// Lazy-load debug layout -- never enters bundle when __DEBUG_BUILD__ is false
const LayoutESurfacing = lazy(() =>
  DEBUG_MODE
    ? import('./layouts/LayoutE-Surfacing').then(m => ({ default: m.LayoutESurfacing }))
    : Promise.resolve({ default: () => null as unknown as React.JSX.Element })
);

import { usePlanRepair, createRepairableItem } from '@/hooks/usePlanRepair';
import { PlanRepairModal } from './PlanRepairModal';

// =============================================================================
// TYPES
// =============================================================================

interface IntelligentWeekViewProps {
  days: DayData[];
  health: HealthIndicators;
  overdueItems: FinancialItem[];
  onEventClick: (event: Event) => void;
  onMealClick: (date: string, mealType: MealType, meal: MealPlanEntry | null, recipe: Recipe | null) => void;
  onBillClick: (bill: FinancialItem) => void;
  onAddEvent?: (date: string) => void;
  onAddBill?: (date: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function IntelligentWeekView({
  days,
  health,
  overdueItems,
  onEventClick,
  onMealClick,
  onBillClick,
  onAddEvent,
  onAddBill,
}: IntelligentWeekViewProps) {
  // Layout toggle: D (main) or E (debug intelligence stack)
  const [layoutVariant, setLayoutVariant] = useState<LayoutVariant>('D');

  // Get all bills from days for plan repair
  const allBills = useMemo(() => days.flatMap(d => d.bills), [days]);

  // Plan Repair hook - handles overdue/missed items gracefully
  const {
    isOpen: isRepairModalOpen,
    selectedItem: repairItem,
    openRepair,
    closeRepair,
    needsAttention,
    handleRepair,
  } = usePlanRepair({
    bills: allBills,
    onRepairComplete: () => {},
  });

  // Enhanced bill click handler - show repair modal for overdue items
  const handleBillClickWithRepair = useCallback((bill: FinancialItem) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(bill.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const isOverdue = dueDate < today && !bill.is_paid;

    if (isOverdue) {
      openRepair(createRepairableItem('bill', bill));
    } else {
      onBillClick(bill);
    }
  }, [openRepair, onBillClick]);

  // Props passed to layout components
  const layoutProps = {
    days,
    health,
    overdueItems,
    onEventClick,
    onMealClick,
    onBillClick: handleBillClickWithRepair,
    onAddEvent,
    onAddBill,
  };

  // Layout E (debug only) - full intelligence stack visibility
  if (layoutVariant === 'E' && DEBUG_MODE) {
    return (
      <div className="space-y-4">
        <LayoutSelector current={layoutVariant} onChange={setLayoutVariant} />
        <Suspense fallback={<div className="p-8 text-slate-400">Loading debug panel...</div>}>
          <LayoutESurfacing {...layoutProps} />
        </Suspense>
      </div>
    );
  }

  // Layout D (default) with PlanRepairModal
  return (
    <>
      <div className="space-y-4">
        {DEBUG_MODE && (
          <LayoutSelector current={layoutVariant} onChange={setLayoutVariant} />
        )}
        <LayoutDHybrid {...layoutProps} />
      </div>

      {/* Plan Repair Modal - graceful handling of missed/overdue items */}
      <PlanRepairModal
        isOpen={isRepairModalOpen}
        item={repairItem}
        onClose={closeRepair}
        onRepair={handleRepair}
      />

      {/* Needs Attention indicator - shows count of items needing repair */}
      {needsAttention.total > 0 && !isRepairModalOpen && (
        <button
          onClick={() => {
            const firstItem = needsAttention.bills[0] || needsAttention.events[0] || needsAttention.meals[0];
            if (firstItem) openRepair(firstItem);
          }}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-full text-amber-300 shadow-lg transition-all hover:scale-105"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
          </span>
          <span className="text-sm font-medium">
            {needsAttention.total} {needsAttention.total === 1 ? 'item' : 'items'} need{needsAttention.total === 1 ? 's' : ''} attention
          </span>
        </button>
      )}
    </>
  );
}

// =============================================================================
// LAYOUT SELECTOR (debug only)
// =============================================================================

interface LayoutSelectorProps {
  current: LayoutVariant;
  onChange: (variant: LayoutVariant) => void;
}

function LayoutSelector({ current, onChange }: LayoutSelectorProps) {
  if (current === 'E') {
    return (
      <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
        <button
          onClick={() => onChange('D')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Week
        </button>
        <span className="text-xs text-cyan-400 px-2">Debug Mode</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
      <span className="text-xs text-slate-500 px-2">View:</span>
      <button
        onClick={() => onChange('E')}
        title="Debug panel with full intelligence stack"
        className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
      >
        Debug
      </button>
    </div>
  );
}
