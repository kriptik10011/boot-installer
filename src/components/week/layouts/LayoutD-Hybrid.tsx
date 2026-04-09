/**
 * Layout D: Hybrid Layout
 *
 * Based on user feedback:
 * - Full-width week grid from Layout A (NOT squeezed)
 * - Day detail view from Layout C appears when clicking a day
 * - A's unified container (cohesion)
 * - B's information density in grid (event counts + bill amounts)
 * - All elements clickable
 * - Tomorrow as distinct concept (natural language)
 *
 * INTELLIGENCE INTEGRATION:
 * - Week summary sentence from backend patterns
 * - Day health coloring on grid cells
 * - Critical alerts only (priority 1-2)
 * - Planning vs Living mode awareness
 * - TIME-OF-DAY CONTEXT (Issue jrt):
 *   - Morning (5am-12pm): Today's first event, dinner planning prompt
 *   - Afternoon (12pm-5pm): Remaining today, tomorrow preview
 *   - Evening (5pm-10pm): Tomorrow's schedule focus
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { DayData, HealthIndicators } from '../types';
import type { Event, FinancialItem, MealPlanEntry, Recipe, MealType } from '@/types';
import {
  useWeekPatterns,
  usePatternConfidence,
  useInsights,
  getCurrentWeekStart,
} from '@/hooks/usePatterns';
import { useCurrentMode } from '@/hooks/useCurrentMode';
import { useAppStore } from '@/stores/appStore';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { useEventIntelligence } from '@/hooks/useEventIntelligence';
import { useCrossFeatureIntelligence } from '@/hooks/useCrossFeatureIntelligence';
import { InsightBar } from '../InsightBar';
import { SpendingVelocityCard } from '../SpendingVelocityCard';
import { HabitConstellation } from '../HabitConstellation';
import { WeekHealthPanel } from '../WeekHealthPanel';
import { useHabitsSummary } from '@/hooks/useHabitStreaks';
import { getTimeOfDay } from './layoutDHelpers';
import { TimeOfDayContextBar, getTimeContext } from './TimeOfDayContext';
import { DayDetailPanel } from './DayDetailPanel';

interface LayoutDProps {
  days: DayData[];
  health: HealthIndicators;
  overdueItems: FinancialItem[];
  onEventClick: (event: Event) => void;
  onMealClick: (date: string, mealType: MealType, meal: MealPlanEntry | null, recipe: Recipe | null) => void;
  onBillClick: (bill: FinancialItem) => void;
  onAddEvent?: (date: string) => void;
  onAddBill?: (date: string) => void;
}

export function LayoutDHybrid({
  days,
  health,
  overdueItems,
  onEventClick,
  onMealClick,
  onBillClick,
  onAddEvent,
  onAddBill,
}: LayoutDProps) {
  const today = days.find(d => d.isToday);
  const tomorrow = days.find((d, i) => days[i - 1]?.isToday);

  // Selected day for detail view (null = collapsed)
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ==========================================================================
  // MODULE VISIBILITY SETTINGS
  // ==========================================================================

  const { modules } = useAppStore();

  // ==========================================================================
  // INTELLIGENCE INTEGRATION
  // ==========================================================================

  const weekStart = getCurrentWeekStart();
  const { data: patterns } = useWeekPatterns(weekStart);
  const { data: confidence } = usePatternConfidence();
  const { data: insights } = useInsights(weekStart);
  const { data: habitsSummary } = useHabitsSummary();

  // ==========================================================================
  // DOMAIN-SPECIFIC INTELLIGENCE
  // Phase B: Feature-Level Surfacing with Glass Box reasoning
  // ==========================================================================

  const financeIntel = useFinanceIntelligence();
  const eventIntel = useEventIntelligence(weekStart);
  const crossIntel = useCrossFeatureIntelligence();

  // Planning vs Living mode detection
  const {
    isPlanningMode,
    registerViewVisit,
  } = useCurrentMode();

  // Register this view visit for session tracking
  useEffect(() => {
    registerViewVisit('week');
  }, [registerViewVisit]);

  // Time-of-day context
  const timeOfDay = useMemo(() => getTimeOfDay(currentTime.getHours()), [currentTime]);
  const timeContext = useMemo(
    () => getTimeContext(timeOfDay, today, tomorrow, currentTime),
    [timeOfDay, today, tomorrow, currentTime]
  );

  // Handler for time context action (e.g., plan dinner, plan breakfast)
  const handleTimeContextAction = useCallback(() => {
    if (timeContext.focusDay === 'today' && today) {
      if (!today.meals.dinner) {
        onMealClick(today.date, 'dinner', null, null);
      }
    } else if (timeContext.focusDay === 'tomorrow' && tomorrow) {
      if (!tomorrow.meals.breakfast) {
        onMealClick(tomorrow.date, 'breakfast', null, null);
      }
    }
  }, [timeContext, today, tomorrow, onMealClick]);

  // Get week summary sentence (only if confidence >= 0.5 AND it's insightful)
  const weekSummary = useMemo(() => {
    if (!confidence || confidence.overall < 0.5) return null;
    const sentence = patterns?.week_summary?.summary_sentence;
    if (!sentence) return null;
    if (sentence.startsWith('This week:')) return null;
    return sentence;
  }, [confidence, patterns]);

  // Map day dates to their health status for coloring
  const dayHealthMap = useMemo(() => {
    const map = new Map<string, { status: string; score: number }>();
    if (patterns?.day_healths) {
      for (const dh of patterns.day_healths) {
        map.set(dh.date, { status: dh.status, score: dh.score });
      }
    }
    return map;
  }, [patterns]);

  // Get subtle background color for day health
  const getDayHealthColor = (date: string, isToday: boolean, isPast: boolean): string => {
    if (isPast) return '';
    const health = dayHealthMap.get(date);
    if (!health) return '';
    if (isToday) return '';

    switch (health.status) {
      case 'light':
        return 'bg-emerald-500/15';
      case 'balanced':
        return 'bg-cyan-500/15';
      case 'busy':
        return 'bg-amber-500/20';
      case 'overloaded':
        return 'bg-amber-500/30';
      default:
        return '';
    }
  };

  // Live clock - aligned to minute boundaries
  useEffect(() => {
    setCurrentTime(new Date());
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const alignmentTimeout = setTimeout(() => {
      setCurrentTime(new Date());
      intervalRef.current = setInterval(() => setCurrentTime(new Date()), 60000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(alignmentTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const selectedDayData = useMemo(() => {
    return days.find(d => d.date === selectedDay);
  }, [days, selectedDay]);

  // Compute arrays for WeekHealthPanel
  const conflictDaysArray = useMemo(() => {
    return days.filter(d => d.hasConflict && !d.isPast);
  }, [days]);

  const overloadedDaysArray = useMemo(() => {
    return days
      .filter(d => d.events.length >= 5 && !d.isPast)
      .map(d => ({ date: d.date, count: d.events.length }));
  }, [days]);

  // Insight types already shown by WeekHealthPanel (avoid duplicate warnings)
  const suppressedInsightTypes = useMemo(() => {
    const types: string[] = [];
    if (overdueItems.length > 0) {
      types.push('bill_overdue', 'bill_due_soon');
    }
    if (conflictDaysArray.length > 0) {
      types.push('conflict');
    }
    if (overloadedDaysArray.length > 0) {
      types.push('busy_day');
    }
    return types;
  }, [overdueItems.length, conflictDaysArray.length, overloadedDaysArray.length]);

  // Toggle day selection (click same day to close)
  const handleDayClick = (date: string) => {
    setSelectedDay(selectedDay === date ? null : date);
  };

  // Handler for insight acceptance
  const handleInsightAccept = useCallback((insight: { type: string }) => {
    switch (insight.type) {
      case 'bills_due': {
        const billDay = days.find(d => d.bills.length > 0 && !d.isPast);
        if (billDay && billDay.bills[0]) {
          onBillClick(billDay.bills[0]);
        } else if (overdueItems.length > 0) {
          onBillClick(overdueItems[0]);
        }
        break;
      }
      case 'conflicts': {
        const conflictDay = days.find(d => d.hasConflict && !d.isPast);
        if (conflictDay) setSelectedDay(conflictDay.date);
        break;
      }
      case 'busy_week': {
        const busyDay = days.find(d => {
          const health = dayHealthMap.get(d.date);
          return (health?.status === 'overloaded' || health?.status === 'busy') && !d.isPast;
        });
        if (busyDay) setSelectedDay(busyDay.date);
        break;
      }
      case 'spending_high':
        if (today) setSelectedDay(today.date);
        break;
      case 'planning_time':
        break;
      default:
        if (today) setSelectedDay(today.date);
        break;
    }
  }, [days, overdueItems, onBillClick, dayHealthMap, today]);

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* TIME-OF-DAY CONTEXT */}
      <TimeOfDayContextBar
        context={timeContext}
        onActionClick={timeContext.actionPrompt ? handleTimeContextAction : undefined}
        isPlanningMode={isPlanningMode}
      />

      {/* INSIGHT BAR */}
      <InsightBar
        insights={insights}
        overallConfidence={confidence?.overall ?? 0}
        isPlanningMode={isPlanningMode}
        onInsightAccept={handleInsightAccept}
        suppressedTypes={suppressedInsightTypes}
      />

      {/* DOMAIN-SPECIFIC INTELLIGENCE - Phase B: Feature-Level Surfacing */}
      {isPlanningMode && financeIntel.billInsights.filter(i => i.shouldShow && i.urgencyLevel !== 'ambient').length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Bill Intelligence
            </span>
          </div>
          <div className="space-y-2">
            {financeIntel.billInsights
              .filter(i => i.shouldShow && i.urgencyLevel !== 'ambient')
              .slice(0, 3)
              .map(insight => (
                <button
                  key={insight.bill.uid}
                  onClick={() => onBillClick({ id: insight.bill.rawId } as FinancialItem)}
                  className={`
                    w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-colors
                    ${insight.urgencyLevel === 'overdue' ? 'bg-amber-500/15 hover:bg-amber-500/20' : ''}
                    ${insight.urgencyLevel === 'urgent' ? 'bg-amber-500/10 hover:bg-amber-500/15' : ''}
                    ${insight.urgencyLevel === 'approaching' ? 'bg-slate-700/30 hover:bg-slate-700/50' : ''}
                  `}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${
                      insight.urgencyLevel === 'overdue' ? 'text-amber-300' :
                      insight.urgencyLevel === 'urgent' ? 'text-amber-400' :
                      'text-slate-300'
                    }`}>
                      {insight.message}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {insight.reasoning}
                    </div>
                  </div>
                  <span className={`text-sm font-mono shrink-0 ${
                    insight.urgencyLevel === 'overdue' ? 'text-amber-300' : 'text-slate-400'
                  }`}>
                    ${insight.bill.amount.toFixed(0)}
                  </span>
                </button>
              ))}
          </div>
          {financeIntel.billInsights.filter(i => i.shouldShow && i.urgencyLevel !== 'ambient').length > 3 && (
            <div className="mt-2 text-center">
              <span className="text-xs text-slate-500">
                +{financeIntel.billInsights.filter(i => i.shouldShow && i.urgencyLevel !== 'ambient').length - 3} more bills
              </span>
            </div>
          )}
        </div>
      )}

      {/* Event Conflict Intelligence */}
      {isPlanningMode && eventIntel.totalConflicts > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Schedule Conflicts
            </span>
          </div>
          <div className="space-y-2">
            {eventIntel.dayInsights
              .filter(d => d.conflicts.length > 0)
              .slice(0, 3)
              .map(dayInsight => (
                <div
                  key={dayInsight.date}
                  className="bg-slate-700/30 rounded-lg p-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${dayInsight.isToday ? 'text-cyan-400' : 'text-slate-300'}`}>
                      {dayInsight.dayName}
                    </span>
                    <span className="text-xs text-yellow-400">
                      {dayInsight.conflicts.length} conflict{dayInsight.conflicts.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mb-2">
                    {dayInsight.reasoning}
                  </div>
                  {dayInsight.conflicts.slice(0, 2).map((conflict, idx) => (
                    <div key={idx} className="text-xs text-slate-400 pl-2 border-l border-yellow-500/30 mb-1">
                      {conflict.message}
                    </div>
                  ))}
                  {dayInsight.suggestions.length > 0 && (
                    <div className="text-xs text-cyan-400/70 mt-1.5">
                      Tip: {dayInsight.suggestions[0]}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Cross-Feature Intelligence - Phase C */}
      {isPlanningMode && crossIntel.insights.length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Week Pattern
            </span>
            <span className="text-xs text-slate-500 ml-auto capitalize">
              {crossIntel.weekCharacter} week
            </span>
          </div>
          <div className="space-y-2">
            {crossIntel.insights.slice(0, 2).map((insight, idx) => (
              <div
                key={idx}
                className="bg-slate-700/30 rounded-lg p-2.5"
              >
                <div className="text-sm font-medium text-slate-300 mb-1">
                  {insight.message}
                </div>
                <div className="text-xs text-slate-500 mb-1.5">
                  {insight.reasoning}
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  {insight.affectedFeatures.map(f => (
                    <span
                      key={f}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-600/50 text-slate-400 capitalize"
                    >
                      {f}
                    </span>
                  ))}
                </div>
                {insight.suggestion && (
                  <div className="text-xs text-cyan-400/70">
                    Tip: {insight.suggestion}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UNIFIED CONTAINER */}
      <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">

        {/* WEEK SUMMARY HEADER */}
        {weekSummary && (
          <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/20">
            <p className="text-sm text-slate-300">{weekSummary}</p>
          </div>
        )}

        {/* FULL-WIDTH WEEK GRID */}
        <div className="p-4">
          <div className="grid grid-cols-7 gap-3">
            {days.map((day) => {
              const isSelected = selectedDay === day.date;
              const isTomorrow = tomorrow?.date === day.date;
              const healthColor = getDayHealthColor(day.date, day.isToday, day.isPast);

              return (
                <button
                  key={day.date}
                  onClick={() => handleDayClick(day.date)}
                  className={`
                    p-4 rounded-xl text-center transition-all
                    ${day.isToday
                      ? 'bg-cyan-500/20 border-2 border-cyan-500/50 ring-2 ring-cyan-500/20'
                      : day.isPast
                        ? 'bg-slate-800/30 opacity-50'
                        : `bg-slate-700/30 hover:bg-slate-700/50 ${healthColor}`
                    }
                    ${isSelected && !day.isToday ? 'ring-2 ring-white/30' : ''}
                    ${isTomorrow && !day.isToday ? 'border border-slate-600' : ''}
                  `}
                >
                  {(day.isToday || isTomorrow) && (
                    <div className={`text-[10px] font-medium uppercase tracking-wide mb-1 ${
                      day.isToday ? 'text-cyan-400' : 'text-slate-400'
                    }`}>
                      {day.isToday ? 'Today' : 'Tomorrow'}
                    </div>
                  )}

                  <div className={`text-xs font-medium mb-1 ${
                    day.isToday ? 'text-cyan-400' : 'text-slate-500'
                  }`}>
                    {day.dayShort}
                  </div>

                  <div className={`text-2xl font-bold mb-2 ${
                    day.isToday ? 'text-white' : 'text-slate-300'
                  }`}>
                    {day.dayNumber}
                  </div>

                  {modules.events && day.events.length > 0 && (
                    <div className={`text-xs mb-1 ${day.isToday ? 'text-cyan-400' : 'text-slate-400'}`}>
                      {day.events.length} event{day.events.length > 1 ? 's' : ''}
                    </div>
                  )}

                  {modules.bills && day.bills.length > 0 && (
                    <div className="text-xs text-amber-400 font-medium">
                      ${day.bills.reduce((s, b) => s + b.amount, 0).toFixed(0)}
                    </div>
                  )}

                  <div className="flex justify-center items-center gap-1 mt-2 min-h-[20px]">
                    {modules.events && day.hasConflict && !day.isPast && (
                      <div className="w-2 h-2 rounded-full bg-amber-400" title="Needs attention" />
                    )}
                    {modules.meals && (['breakfast', 'lunch', 'dinner'] as const).map(mt => (
                      <div
                        key={mt}
                        className={`w-1.5 h-1.5 rounded-full ${
                          day.meals[mt] ? 'bg-emerald-400' : 'bg-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* EXPANDED DAY DETAIL VIEW */}
        {selectedDayData && (
          <DayDetailPanel
            day={selectedDayData}
            tomorrow={tomorrow}
            currentTime={currentTime}
            modules={modules}
            onEventClick={onEventClick}
            onMealClick={onMealClick}
            onBillClick={onBillClick}
            onAddEvent={onAddEvent}
            onAddBill={onAddBill}
            onClose={() => setSelectedDay(null)}
          />
        )}

        {/* WEEK HEALTH PANEL */}
        <WeekHealthPanel
          overdueItems={overdueItems}
          conflictDays={conflictDaysArray}
          overloadedDays={overloadedDaysArray}
          onBillClick={onBillClick}
          onDayClick={handleDayClick}
          billsEnabled={modules.bills}
          eventsEnabled={modules.events}
        />

        {/* SPENDING VELOCITY ALERT */}
        {modules.bills && <SpendingVelocityCard />}

        {/* HABIT STREAKS */}
        {habitsSummary && habitsSummary.habits.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-700/30">
            <HabitConstellation habits={habitsSummary.habits} />
          </div>
        )}
      </div>
    </div>
  );
}
