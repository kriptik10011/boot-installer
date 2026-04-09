/**
 * DayCard Component
 *
 * Individual day card showing events, meals, and bills for that day.
 * Part of the card-based week view layout.
 *
 * Sediment Layer (River of Time): Completed/paid items settle to bottom.
 * Keyboard Navigation: Accepts isFocused prop for ring highlight.
 */

import { forwardRef, useMemo } from 'react';
import { DayCardItem } from './DayCardItem';
import type { DayCardProps } from './types';
import type { MealType } from '@/types';

const MEAL_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner'];

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export const DayCard = forwardRef<HTMLDivElement, DayCardProps>(function DayCard({
  day,
  lens = 'normal',
  isFocused = false,
  onEventClick,
  onMealClick,
  onBillClick,
  onAddEvent,
  onAddMeal,
  onAddBill,
}, ref) {
  const hasEvents = day.events.length > 0;
  const hasBills = day.bills.length > 0;

  // Sediment Layer: Sort paid bills to bottom within bills section
  const sortedBills = useMemo(() => {
    if (!hasBills) return day.bills;
    return [...day.bills].sort((a, b) => {
      if (a.is_paid === b.is_paid) return 0;
      return a.is_paid ? 1 : -1;
    });
  }, [day.bills, hasBills]);

  // River of Time styling: Today sharp, Future foggy, Past sediment
  const getCardStyles = (): string => {
    if (day.isToday) {
      // "Now" layer: Sharp, high-contrast, "floats closer"
      return 'bg-slate-800/80 border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/10';
    }
    if (day.isPast) {
      // "Sediment" layer: Faded, showing progress without competing
      return 'bg-slate-800/30 border border-slate-700/30 opacity-75';
    }
    if (day.isFuture) {
      // "Fog" layer: Less detailed, lower opacity, background plane
      return 'bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/50 hover:opacity-100 opacity-85';
    }
    return 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50';
  };

  const cardStyles = getCardStyles();
  const focusRing = isFocused ? 'ring-2 ring-cyan-500/50 ring-offset-1 ring-offset-transparent' : '';

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="gridcell"
      aria-label={`${day.dayName} ${day.dayNumber}`}
      className={`rounded-xl ${cardStyles} ${focusRing} overflow-hidden flex flex-col min-h-[300px] outline-none transition-shadow duration-150`}
    >
      {/* Day Header */}
      <div className={`px-4 py-3 border-b ${day.isToday ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-slate-700/50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-sm font-medium ${day.isToday ? 'text-cyan-400' : 'text-slate-300'}`}>
              {day.dayName}
            </div>
            <div className={`text-2xl font-bold ${day.isToday ? 'text-white' : 'text-slate-200'}`}>
              {day.dayNumber}
            </div>
          </div>
          {day.isToday && (
            <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded-full">
              Today
            </span>
          )}
          {day.hasConflict && lens === 'risk' && (
            <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
              Conflicts
            </span>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex-1 p-3 space-y-4 overflow-y-auto">
        {/* Events Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Events</span>
            {hasEvents && (
              <span className="text-xs text-slate-400">{day.events.length}</span>
            )}
          </div>
          {hasEvents ? (
            <div className="space-y-1.5">
              {day.events.map((event) => (
                <DayCardItem
                  key={`${event.id}-${event.occurrence_date || event.date}`}
                  type="event"
                  label={event.name}
                  sublabel={event.start_time ? formatTime(event.start_time) : 'All day'}
                  hasConflict={day.hasConflict}
                  isRecurring={event.recurrence_rule_id !== null}
                  lens={lens}
                  onClick={() => onEventClick(event)}
                />
              ))}
            </div>
          ) : (
            <DayCardItem
              type="event"
              label=""
              isEmpty
              lens={lens}
              onClick={() => onAddEvent(day.date)}
            />
          )}
        </div>

        {/* Meals Section */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Meals</span>
          <div className="space-y-1.5">
            {MEAL_SLOTS.map((mealType) => {
              const meal = day.meals[mealType];
              const recipe = day.meals[`${mealType}Recipe` as keyof typeof day.meals] as typeof day.meals.breakfastRecipe;

              if (meal) {
                const totalTime = (recipe?.prep_time_minutes ?? 0) + (recipe?.cook_time_minutes ?? 0);
                return (
                  <DayCardItem
                    key={mealType}
                    type="meal"
                    label={recipe?.name || meal.description || MEAL_LABELS[mealType]}
                    sublabel={MEAL_LABELS[mealType]}
                    cookTimeMinutes={totalTime > 0 ? totalTime : undefined}
                    lens={lens}
                    onClick={() => onMealClick(day.date, mealType, meal, recipe)}
                  />
                );
              }

              return (
                <DayCardItem
                  key={mealType}
                  type="meal"
                  label={MEAL_LABELS[mealType]}
                  isEmpty
                  lens={lens}
                  onClick={() => onAddMeal(day.date, mealType)}
                />
              );
            })}
          </div>
        </div>

        {/* Bills Section — Sediment: paid items settle to bottom */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Bills</span>
            {hasBills && (
              <span className="text-xs text-slate-400">
                ${day.bills.reduce((sum, b) => sum + b.amount, 0).toFixed(0)}
              </span>
            )}
          </div>
          {hasBills ? (
            <div className="space-y-1.5">
              {sortedBills.map((bill) => (
                <DayCardItem
                  key={`${bill.id}-${bill.occurrence_date || bill.due_date}`}
                  type="bill"
                  label={bill.name}
                  sublabel={`$${bill.amount.toFixed(2)}`}
                  isOverdue={isOverdue(bill.due_date)}
                  isPaid={bill.is_paid}
                  isRecurring={bill.recurrence_rule_id !== null}
                  lens={lens}
                  onClick={() => onBillClick(bill)}
                />
              ))}
            </div>
          ) : (
            <DayCardItem
              type="bill"
              label=""
              isEmpty
              lens={lens}
              onClick={() => onAddBill?.(day.date)}
            />
          )}
        </div>
      </div>
    </div>
  );
});

// Helper functions
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function isOverdue(dueDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}
