/**
 * WeekView Component
 *
 * The single-page contextual app container. This IS the entire application.
 * No sidebar, no separate pages - just the week view with contextual panels.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { WeekHeader } from './WeekHeader';
import { CommandPalette } from '../shared/CommandPalette';
import { DayCard } from './DayCard';
import { IntelligentWeekView } from './IntelligentWeekView';

import { WeeklyReviewPanel } from './WeeklyReviewWizard';
import { WeekViewSkeleton } from './WeekViewSkeleton';
import { ContextPanel } from '../panels/ContextPanel';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { SettingsTooltip } from './SettingsTooltip';
import { OpenLoopTriageCard } from './OpenLoopTriageCard';
import { HabitCard } from './HabitCard';
import { useAppStore } from '@/stores/appStore';
import { useOverdueItems, useUpdateFinancialItem, useDeleteFinancialItem } from '@/hooks/useFinances';
import { useToastStore } from '@/stores/toastStore';
import { useEventIntelligence } from '@/hooks/useEventIntelligence';
import { useMealIntelligence } from '@/hooks/useMealIntelligence';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { useRecipes } from '@/hooks/useRecipes';
import { useViewTracking } from '@/hooks/useViewTracking';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';

import {
  getWeekDates,
  getTodayLocal,
  getDayName,
  getDayOfMonth,
  parseDateLocal,
  formatDateLocal,
} from '@/utils/dateUtils';
import type { WeekViewProps, DayData, PanelState, HealthIndicators, CommandActions } from './types';
import type { Event, FinancialItem, MealPlanEntry, Recipe, MealType } from '@/types';

function buildDayData(
  weekStart: string,
  events: Event[],
  meals: MealPlanEntry[],
  recipes: Recipe[],
  bills: FinancialItem[]
): DayData[] {
  const weekDates = getWeekDates(weekStart);
  const todayStr = getTodayLocal();

  // Create recipe lookup map
  const recipeMap = new Map<number, Recipe>();
  recipes.forEach((r) => recipeMap.set(r.id, r));

  return weekDates.map((dateStr) => {
    const dayEvents = events.filter((e) => e.date === dateStr);
    const dayMeals = meals.filter((m) => m.date === dateStr);
    const dayBills = bills.filter((b) => b.due_date === dateStr);

    // Check for time conflicts
    const hasConflict = dayEvents.length > 1 && dayEvents.some((e, i) => {
      if (!e.start_time || !e.end_time) return false;
      return dayEvents.slice(i + 1).some((other) => {
        if (!other.start_time || !other.end_time) return false;
        return e.start_time! < other.end_time! && e.end_time! > other.start_time!;
      });
    });

    // Find meals by type
    const findMeal = (type: MealType) => dayMeals.find((m) => m.meal_type === type) || null;
    const getRecipe = (meal: MealPlanEntry | null) =>
      meal?.recipe_id ? recipeMap.get(meal.recipe_id) || null : null;

    const breakfast = findMeal('breakfast');
    const lunch = findMeal('lunch');
    const dinner = findMeal('dinner');

    // River of Time: Determine temporal position (using string comparison is valid for YYYY-MM-DD)
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const isFuture = dateStr > todayStr;

    return {
      date: dateStr,
      dayName: getDayName(dateStr, 'long'),
      dayShort: getDayName(dateStr, 'short'),
      dayNumber: getDayOfMonth(dateStr),
      isToday,
      isPast,
      isFuture,
      events: dayEvents,
      meals: {
        breakfast,
        lunch,
        dinner,
        breakfastRecipe: getRecipe(breakfast),
        lunchRecipe: getRecipe(lunch),
        dinnerRecipe: getRecipe(dinner),
      },
      bills: dayBills,
      hasConflict,
      isOverloaded: dayEvents.length >= 5,
    };
  });
}

function calculateHealth(
  days: DayData[],
  overdueCount: number
): HealthIndicators {
  let conflictDays = 0;
  let unplannedMeals = 0;
  let overloadedDays = 0;

  for (const day of days) {
    if (day.hasConflict) conflictDays++;
    if (day.isOverloaded) overloadedDays++;

    // Count unplanned meals
    if (!day.meals.breakfast) unplannedMeals++;
    if (!day.meals.lunch) unplannedMeals++;
    if (!day.meals.dinner) unplannedMeals++;
  }

  return {
    overdueCount,
    conflictDays,
    unplannedMeals,
    overloadedDays,
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function WeekView({ initialWeekStart }: WeekViewProps) {
  // Global state
  const {
    currentWeekStart,
    goToPreviousWeek,
    goToNextWeek,
    goToThisWeek,
    uiMode,
    setUiMode,
    togglePlanningLivingMode,
    hasCompletedFirstRun,
    hasSeenSettingsTooltip,
    completeFirstRun,
    dismissSettingsTooltip,
    showInventory,
    cycleFinanceViewMode,
    financeViewMode,
  } = useAppStore();

  const weekStart = initialWeekStart || currentWeekStart;

  // Track view for observation layer
  useViewTracking('week');

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);

  // Panel state
  const [panel, setPanel] = useState<PanelState>({
    type: null,
    itemId: null,
    isFullscreen: false,
  });

  // Ref for inline panel auto-scroll
  const inlinePanelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to inline panel when it opens in traditional mode
  const isInlinePanel = uiMode === 'traditional' && !panel.isFullscreen;
  useEffect(() => {
    if (panel.type && isInlinePanel) {
      const id = setTimeout(() => {
        inlinePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return () => clearTimeout(id);
    }
  }, [panel.type, isInlinePanel]);

  // Note: Cooking mode is now managed at App level via appStore.isCookingMode
  // This respects the Intelligence Principles: cooking is a cognitive mode shift, not an overlay
  const { enterCookingMode } = useAppStore();

  // Data fetching — intelligence hooks are the canonical data source
  const eventIntel = useEventIntelligence(weekStart);
  const mealIntel = useMealIntelligence(weekStart);
  const events = eventIntel.allEvents;
  const meals = mealIntel.allMeals;
  const eventsLoading = eventIntel.isLoading;
  const mealsLoading = mealIntel.isLoading;
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes();
  // Finance intelligence: single source of truth for all bill data
  const financeIntel = useFinanceIntelligence();
  const billsLoading = financeIntel.isLoading;

  // Adapter: map ComputedBill[] → FinancialItem[] so all downstream types stay unchanged
  const allBills: FinancialItem[] = useMemo(
    () => financeIntel.upcoming7d.map((b) => ({
      id: b.rawId,
      name: b.name,
      amount: b.amount,
      due_date: b.dueDate,
      type: 'bill' as const,
      category_id: null,
      is_paid: false,
      paid_date: null,
      notes: null,
      recurrence_rule_id: b.isSubscription ? -1 : null,
      created_at: '',
      updated_at: '',
    })),
    [financeIntel.upcoming7d]
  );
  const { data: rawOverdueItems = [] } = useOverdueItems();

  // Show skeleton when primary data is still loading
  const isInitialLoading = eventsLoading || mealsLoading || recipesLoading || billsLoading;
  // Filter to only bills - income should never be "overdue" in the attention-needing sense
  const overdueItems = useMemo(
    () => rawOverdueItems.filter(item => item.type === 'bill'),
    [rawOverdueItems]
  );

  // Filter bills for this week
  const weekEnd = useMemo(() => {
    const end = parseDateLocal(weekStart);
    end.setDate(end.getDate() + 7);
    return formatDateLocal(end);
  }, [weekStart]);

  const weekBills = useMemo(() => {
    return allBills.filter((b) => b.due_date >= weekStart && b.due_date < weekEnd);
  }, [allBills, weekStart, weekEnd]);

  // Build day data
  const days = useMemo(
    () => buildDayData(weekStart, events, meals, recipes, weekBills),
    [weekStart, events, meals, recipes, weekBills]
  );

  // Calculate health indicators
  const health = useMemo(
    () => calculateHealth(days, financeIntel.overdue.length),
    [days, financeIntel.overdue]
  );

  // Panel handlers
  const openEventPanel = (event: Event) => {
    setPanel({
      type: 'event',
      itemId: event.id,
      isOccurrence: event.is_occurrence || false,
      occurrenceDate: event.occurrence_date || event.date,
      isFullscreen: false,
    });
  };

  const openMealPanel = (date: string, mealType: MealType, meal: MealPlanEntry | null, _recipe: Recipe | null) => {
    setPanel({
      type: 'meal',
      itemId: meal?.id || null,
      date,
      mealType,
      isFullscreen: false,
    });
  };

  const openBillPanel = (bill: FinancialItem) => {
    setPanel({ type: 'bill', itemId: bill.id, isFullscreen: false });
  };

  const openSettingsPanel = () => {
    setPanel({ type: 'settings', itemId: null, isFullscreen: false });
  };

  const openInventoryPanel = () => {
    setPanel({ type: 'inventory', itemId: null, isFullscreen: false });
  };

  const openRecipeHubPanel = () => {
    setPanel({ type: 'recipes', itemId: null, isFullscreen: false });
  };

  const openFinancePanel = () => {
    setPanel({ type: 'finance', itemId: null, isFullscreen: true });
  };


  const openShoppingPanel = (fullscreenMode: boolean = false) => {
    setPanel({ type: 'shopping', itemId: null, isFullscreen: fullscreenMode });
  };

  // Shopping mode - opens shopping panel in fullscreen for "at store" usage
  const openShoppingMode = () => {
    setPanel({ type: 'shopping', itemId: null, isFullscreen: true });
  };

  const closePanel = () => {
    setPanel({ type: null, itemId: null, isFullscreen: false });
  };

  // Cooking mode handler - uses app-level state per Intelligence Principles
  // Accepts optional mealSlotContext for auto-assignment when cooking completes on empty slot
  const handleEnterCookingMode = useCallback((
    recipeId: number,
    mealId: number | null,
    mealSlotContext?: { date: string; mealType: import('@/types').MealType }
  ) => {
    // Close the panel first, then enter cooking mode at app level
    setPanel({ type: null, itemId: null, isFullscreen: false });
    enterCookingMode(recipeId, mealId, mealSlotContext);
  }, [enterCookingMode]);

  const toggleFullscreen = () => {
    setPanel((prev) => ({ ...prev, isFullscreen: !prev.isFullscreen }));
  };

  // Add handlers (create new items)
  const handleAddEvent = (date: string) => {
    setPanel({ type: 'event', itemId: null, date, isFullscreen: false });
  };

  const handleAddMeal = (date: string, mealType: MealType) => {
    setPanel({ type: 'meal', itemId: null, date, mealType, isFullscreen: false });
  };

  const handleAddBill = (date: string) => {
    setPanel({ type: 'bill', itemId: null, date, isFullscreen: false });
  };

  // Open Loop Triage handlers (Carry/Kill/Park)
  const updateBill = useUpdateFinancialItem();
  const deleteBill = useDeleteFinancialItem();
  const addToast = useToastStore((s) => s.addToast);

  const handleCarry = useCallback((bill: FinancialItem) => {
    const dueDate = parseDateLocal(bill.due_date);
    dueDate.setDate(dueDate.getDate() + 7);
    updateBill.mutate(
      { id: bill.id, data: { due_date: formatDateLocal(dueDate) } },
      { onError: () => addToast({ message: `Failed to reschedule "${bill.name}"`, type: 'error', durationMs: 4000 }) },
    );
  }, [updateBill, addToast]);

  const handleKill = useCallback((bill: FinancialItem) => {
    deleteBill.mutate(bill.id, {
      onError: () => addToast({ message: `Failed to delete bill`, type: 'error', durationMs: 4000 }),
    });
  }, [deleteBill, addToast]);

  const handlePark = useCallback((bill: FinancialItem) => {
    updateBill.mutate(
      { id: bill.id, data: { is_paid: true } },
      { onError: () => addToast({ message: `Failed to mark bill as paid`, type: 'error', durationMs: 4000 }) },
    );
  }, [updateBill, addToast]);

  // Keyboard day navigation (Neurodivergent-first: keyboard as primary driver)
  const { focusedIndex, handleKeyDown: handleGridKeyDown, dayRefs } = useKeyboardNavigation({
    gridSize: 7,
    onEnter: (index) => {
      const day = days[index];
      if (day) handleAddEvent(day.date);
    },
  });

  // Command palette actions — memoized to avoid recreating commands on every render
  const commandActions: CommandActions = useMemo(
    () => ({
      goToPreviousWeek,
      goToNextWeek,
      goToThisWeek,
      openEventPanel: () => setPanel({ type: 'event', itemId: null, isFullscreen: false }),
      openMealPanel: () => setPanel({ type: 'meal', itemId: null, isFullscreen: false }),
      openShoppingPanel: () => openShoppingPanel(false),
      openInventoryPanel,
      openRecipeHubPanel,
      openFinancePanel,
      openSettingsPanel,
      addEvent: () => setPanel({ type: 'event', itemId: null, date: getTodayLocal(), isFullscreen: false }),
      addMeal: () => setPanel({ type: 'meal', itemId: null, date: getTodayLocal(), isFullscreen: false }),
      openShoppingMode,
      startWeeklyReview: () => {
        if (uiMode === 'intelligent') {
          setPanel({ type: 'review', itemId: null, isFullscreen: false });
        } else {
          setShowWizard(true);
        }
      },
      whatCanICook: () => openInventoryPanel(),
      addTransaction: () => openFinancePanel(),
      addBill: () => setPanel({ type: 'bill', itemId: null, date: getTodayLocal(), isFullscreen: false }),
      checkBudget: () => openFinancePanel(),
      switchToTraditional: () => setUiMode('traditional'),
      switchToIntelligent: () => setUiMode('intelligent'),
      toggleFinanceView: cycleFinanceViewMode,
      togglePlanningLiving: togglePlanningLivingMode,
    }),
    [
      goToPreviousWeek, goToNextWeek, goToThisWeek,
      openShoppingPanel, openInventoryPanel, openRecipeHubPanel,
      openFinancePanel, openSettingsPanel, openShoppingMode,
      setUiMode, uiMode, cycleFinanceViewMode, togglePlanningLivingMode,
    ]
  );

  // Show skeleton during initial data load — keeps user in context (no full-page blocker)
  if (isInitialLoading) {
    return <WeekViewSkeleton />;
  }

  return (
    <div className="relative min-h-screen bg-slate-900 text-white">
      {/* Week Header */}
      <WeekHeader
        weekStart={weekStart}
        health={health}
        onPrevWeek={goToPreviousWeek}
        onNextWeek={goToNextWeek}
        onToday={goToThisWeek}
        onSettingsClick={openSettingsPanel}
        onInventoryClick={showInventory ? openInventoryPanel : undefined}
        onShoppingClick={() => openShoppingPanel(false)}
        onShoppingModeClick={openShoppingMode}
        onRecipeHubClick={openRecipeHubPanel}
        onFinanceClick={openFinancePanel}
        onWeeklyReviewClick={() => {
          if (uiMode === 'intelligent') {
            setPanel({ type: 'review', itemId: null, isFullscreen: false });
          } else {
            setShowWizard(true);
          }
        }}
      />

      {/* Main Content - Traditional or Intelligent */}
      <main className="p-6">
        {uiMode === 'intelligent' ? (
          /* Intelligent Mode: Insights, not raw data */
          <IntelligentWeekView
            days={days}
            health={health}
            overdueItems={overdueItems}
            onEventClick={openEventPanel}
            onMealClick={openMealPanel}
            onBillClick={openBillPanel}
            onAddEvent={handleAddEvent}
            onAddBill={handleAddBill}
          />
        ) : (
          /* Traditional Mode: 7 Day Cards grid */
          <>
            <div
              className="grid grid-cols-7 gap-4"
              role="grid"
              aria-label="Week calendar"
              tabIndex={0}
              onKeyDown={handleGridKeyDown}
            >
              {days.map((day, i) => (
                <DayCard
                  key={day.date}
                  ref={(el) => { dayRefs.current[i] = el; }}
                  day={day}
                  isFocused={focusedIndex === i}
                  onEventClick={openEventPanel}
                  onMealClick={openMealPanel}
                  onBillClick={openBillPanel}
                  onAddEvent={handleAddEvent}
                  onAddMeal={handleAddMeal}
                  onAddBill={handleAddBill}
                />
              ))}
            </div>

            {/* Habits - auto-displays when user has habits configured */}
            <section className="mt-6">
              <HabitCard onManageHabits={openSettingsPanel} />
            </section>

            {/* Open Loops Section - No-Shame Pattern: Amber not red, neutral framing */}
            {overdueItems.length > 0 && (
              <section className="mt-8">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-400 mb-4">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Open Loops ({overdueItems.length})
                </h2>
                <div className="grid grid-cols-4 gap-3">
                  {overdueItems.map((bill) => (
                    <OpenLoopTriageCard
                      key={bill.id}
                      bill={bill}
                      onCarry={handleCarry}
                      onKill={handleKill}
                      onPark={handlePark}
                      onDetail={openBillPanel}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Contextual Panel */}
      <ContextPanel
        ref={inlinePanelRef}
        type={panel.type}
        itemId={panel.itemId}
        date={panel.date}
        mealType={panel.mealType}
        isOccurrence={panel.isOccurrence}
        occurrenceDate={panel.occurrenceDate}
        isFullscreen={panel.isFullscreen}
        inlineMode={isInlinePanel}
        onClose={closePanel}
        onToggleFullscreen={toggleFullscreen}
        onEnterCookingMode={handleEnterCookingMode}
      />

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette actions={commandActions} />

      {/* Note: CookingLayout is now rendered at App level per Intelligence Principles
          (cognitive mode shift, not overlay). See App.tsx. */}

      {/* Onboarding wizard (first-run experience) */}
      {!hasCompletedFirstRun && (
        <OnboardingWizard onComplete={dismissSettingsTooltip} />
      )}

      {/* Settings tooltip - shows after first-run welcome is dismissed */}
      {hasCompletedFirstRun && !hasSeenSettingsTooltip && (
        <SettingsTooltip onDismiss={dismissSettingsTooltip} />
      )}

      {/* Weekly Review — inline panel */}
      {showWizard && (
        <WeeklyReviewPanel onClose={() => setShowWizard(false)} />
      )}

    </div>
  );
}
