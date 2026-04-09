/**
 * DayDetailPanel — Expanded day view shown when a day is clicked in LayoutD.
 *
 * Shows events, meals, and bills in a dynamic column grid.
 * Time-aware: highlights current events and meal windows.
 */

import type { DayData } from '../types';
import type { Event, FinancialItem, MealPlanEntry, Recipe, MealType } from '@/types';
import type { ModuleSettings } from '@/stores/types';
import { EmptyState } from '../EmptyState';
import { formatTime, getDuration, isTimePast, isTimeCurrent, getMealTimeStatus } from './layoutDHelpers';

interface DayDetailPanelProps {
  day: DayData;
  tomorrow: DayData | undefined;
  currentTime: Date;
  modules: ModuleSettings;
  onEventClick: (event: Event) => void;
  onMealClick: (date: string, mealType: MealType, meal: MealPlanEntry | null, recipe: Recipe | null) => void;
  onBillClick: (bill: FinancialItem) => void;
  onAddEvent?: (date: string) => void;
  onAddBill?: (date: string) => void;
  onClose: () => void;
}

export function DayDetailPanel({
  day,
  tomorrow,
  currentTime,
  modules,
  onEventClick,
  onMealClick,
  onBillClick,
  onAddEvent,
  onAddBill,
  onClose,
}: DayDetailPanelProps) {
  const enabledCount = [modules.events, modules.meals, modules.bills].filter(Boolean).length;

  return (
    <div className="border-t border-slate-700/50 bg-slate-800/30">
      {/* Day Header */}
      <div className="p-4 border-b border-slate-700/30 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {day.isToday ? 'Today' : day.date === tomorrow?.date ? 'Tomorrow' : day.dayName}
          </h3>
          <p className="text-sm text-slate-400">
            {day.dayName}, {day.dayNumber}
            {day.isToday && (
              <span className="ml-2 text-cyan-400">
                {currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {modules.bills && (
            <button
              onClick={() => onAddBill?.(day.date)}
              className="px-3 py-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors"
            >
              + Bill
            </button>
          )}
          {modules.events && (
            <button
              onClick={() => onAddEvent?.(day.date)}
              className="px-3 py-1.5 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg transition-colors"
            >
              + Event
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day Content - Dynamic columns based on enabled modules */}
      <div className={`p-4 grid gap-6 ${
        enabledCount === 3 ? 'grid-cols-3' :
        enabledCount === 2 ? 'grid-cols-2' :
        'grid-cols-1'
      }`}>
        {/* Events Column */}
        {modules.events && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Events
            </h4>
            {day.events.length > 0 ? (
              <div className="space-y-2">
                {day.events.map(event => {
                  const isPast = day.isToday && event.start_time && isTimePast(event.start_time, currentTime);
                  const isCurrent = day.isToday && event.start_time && event.end_time &&
                    isTimeCurrent(event.start_time, event.end_time, currentTime);

                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className={`
                        w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all
                        ${isCurrent
                          ? 'bg-cyan-500/20 ring-1 ring-cyan-500/30'
                          : 'bg-slate-700/30 hover:bg-slate-700/50'
                        }
                        ${isPast ? 'opacity-50' : ''}
                      `}
                    >
                      <div className={`text-xs w-14 shrink-0 ${
                        isCurrent ? 'text-cyan-400 font-medium' : 'text-slate-500'
                      }`}>
                        {event.start_time ? formatTime(event.start_time) : 'All day'}
                      </div>
                      <div className={`w-1 h-8 rounded-full shrink-0 ${
                        isCurrent ? 'bg-cyan-400' : isPast ? 'bg-slate-600' : 'bg-cyan-500/50'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate flex items-center gap-1 ${
                          isPast ? 'text-slate-500 line-through' : 'text-white'
                        }`}>
                          {event.name}
                          {event.recurrence_rule_id && (
                            <span title="Recurring">
                              <svg className="w-3 h-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </span>
                          )}
                        </div>
                        {event.location && (
                          <div className="text-xs text-slate-500 truncate">{event.location}</div>
                        )}
                      </div>
                      {event.start_time && event.end_time && (
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          isPast ? 'bg-slate-700/50 text-slate-500' :
                          isCurrent ? 'bg-cyan-500/30 text-cyan-300' :
                          'bg-slate-700/50 text-slate-400'
                        }`}>
                          {getDuration(event.start_time, event.end_time)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                variant="events"
                onAction={() => onAddEvent?.(day.date)}
              />
            )}
          </div>
        )}

        {/* Meals Column */}
        {modules.meals && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Meals
            </h4>
            <div className="space-y-2">
              {(['breakfast', 'lunch', 'dinner'] as const).map(mealType => {
                const meal = day.meals[mealType];
                const recipe = day.meals[`${mealType}Recipe` as keyof typeof day.meals] as Recipe | null;
                const mealStatus = getMealTimeStatus(mealType, day.isToday, currentTime);

                return (
                  <button
                    key={mealType}
                    onClick={() => onMealClick(day.date, mealType, meal, recipe)}
                    className={`
                      w-full p-3 rounded-xl text-left transition-all
                      ${mealStatus === 'current' ? 'ring-2 ring-cyan-500/40' : ''}
                      ${mealStatus === 'past' ? 'opacity-50' : ''}
                      ${meal
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/20'
                        : 'bg-slate-700/30 hover:bg-slate-700/50'
                      }
                    `}
                  >
                    <div className={`text-xs font-medium mb-1 ${
                      meal ? 'text-emerald-400' : 'text-slate-500'
                    }`}>
                      {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                      {mealStatus === 'current' && day.isToday && (
                        <span className="ml-1 text-cyan-400">• Now</span>
                      )}
                    </div>
                    <div className={`text-sm truncate ${
                      meal ? 'text-emerald-200' : 'text-slate-400'
                    }`}>
                      {recipe?.name || meal?.description || 'Not planned'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bills Column */}
        {modules.bills && (
          <div>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Bills Due
            </h4>
            {day.bills.length > 0 ? (
              <div className="space-y-2">
                {day.bills.map(bill => (
                  <button
                    key={bill.id}
                    onClick={() => onBillClick(bill)}
                    className="w-full flex items-center justify-between p-3 bg-amber-500/15 hover:bg-amber-500/20 rounded-xl transition-colors"
                  >
                    <span className="text-sm text-amber-300 font-medium">{bill.name}</span>
                    <span className="text-sm font-semibold text-amber-400">${bill.amount.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState variant="bills" />
            )}
          </div>
        )}

        {/* Empty state when all modules are disabled */}
        {!modules.events && !modules.meals && !modules.bills && (
          <div className="text-sm text-slate-500 p-6 text-center bg-slate-700/20 rounded-lg">
            No modules enabled. Enable modules in Settings to see content here.
          </div>
        )}
      </div>
    </div>
  );
}
