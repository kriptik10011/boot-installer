/**
 * Week domain adapter hooks (North arc).
 * Needs Date.now() for today filtering and event resolution.
 */

import { useMemo } from 'react';
import {
  useHealthScore,
} from '@/hooks';
import { useCrossFeatureIntelligence } from '@/hooks/useCrossFeatureIntelligence';
import { useEventIntelligence } from '@/hooks/useEventIntelligence';
import { useFinanceIntelligence } from '@/hooks/useFinanceIntelligence';
import { useMealIntelligence } from '@/hooks/useMealIntelligence';
import { useHabits } from '@/hooks/useHabits';
import { getMonday, getTodayLocal, getWeekDates, addWeeks } from '@/utils/dateUtils';
import { weekHealthColor, weekNarrative } from './sharedThresholds';
import { fmtCurrency } from '../../cards/shared/formatUtils';
import type {
  HeroMetricShapeProps,
  PillListShapeProps,
  ProgressBarShapeProps,
  StatGridShapeProps,
} from '../types';

// ── week-health-score ──

export function useWeekHealthScoreAdapter(): HeroMetricShapeProps {
  const { data: healthData } = useHealthScore();
  const score = (healthData as { overall_score?: number })?.overall_score ?? 65;
  return {
    value: score,
    label: weekNarrative(score),
    sublabel: 'week health',
    color: weekHealthColor(score),
  };
}

// ── upcoming-events ──

export function useUpcomingEventsAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { upcoming } = useEventIntelligence(periodStart);

  const items = upcoming
    .slice(0, 3)
    .map((e) => ({
      label: e.name,
      badge: e.start_time?.slice(0, 5) ?? e.date.slice(5),
      dotColor: '#22d3ee',
    }));

  return {
    items,
    header: 'Events',
    headerColor: '#22d3ee',
    emptyMessage: 'No events',
    maxItems: 3,
  };
}

// ── upcoming-bills (week context) ──

export function useUpcomingBillsAdapter(): PillListShapeProps {
  const { upcoming7d } = useFinanceIntelligence();
  const items = upcoming7d.slice(0, 3).map((b) => ({
    label: b.name,
    badge: b.dayLabel,
    dotColor: b.urgencyColor,
  }));

  return {
    items,
    header: 'Bills Due',
    headerColor: '#a78bfa',
    emptyMessage: 'No bills due',
    maxItems: 3,
  };
}

// ── meal-plan-status ──

export function useMealPlanStatusAdapter(): ProgressBarShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const { coveragePct, plannedCount } = useMealIntelligence(periodStart);
  const totalSlots = 21; // 3 meals x 7 days

  return {
    progress: coveragePct,
    label: 'Meal Plan',
    sublabel: `${plannedCount} of ${totalSlots} planned`,
    color: coveragePct >= 0.7 ? '#10b981' : coveragePct >= 0.4 ? '#f59e0b' : '#f97316',
    showPct: true,
  };
}

// ── week-summary ──

export function useWeekSummaryAdapter(): StatGridShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const eventIntel = useEventIntelligence(periodStart);
  const mealIntel = useMealIntelligence(periodStart);
  const { upcoming7d } = useFinanceIntelligence();

  return {
    stats: [
      { value: eventIntel.weekEventCount, label: 'Events', color: '#22d3ee' },
      { value: mealIntel.plannedCount, label: 'Meals', color: '#10b981' },
      { value: upcoming7d.length, label: 'Bills', color: '#a78bfa' },
    ],
    columns: 3,
    maxItems: 4,
  };
}

// ── cross-feature-insights ──

export function useCrossFeatureInsightsAdapter(): PillListShapeProps {
  const crossFeatureIntel = useCrossFeatureIntelligence();
  const insights = (crossFeatureIntel.insights ?? []).slice(0, 3);

  const insightColorMap: Record<string, string> = {
    busy_week_meals: '#fbbf24',
    end_of_month_budget: '#a78bfa',
    light_week_opportunity: '#34d399',
    spending_anomaly: '#d97706',
    routine_disruption: '#94a3b8',
    weekend_prep: '#22d3ee',
    rent_cash_flow: '#f59e0b',
    lease_expiry_planning: '#f97316',
  };

  const items = insights.map((i) => ({
    label: i.message,
    dotColor: insightColorMap[i.type] ?? '#94a3b8',
  }));

  return {
    items,
    header: 'Insights',
    headerColor: '#22d3ee',
    emptyMessage: 'All clear this week',
    maxItems: 3,
  };
}

// ── event-intelligence ──

export function useEventIntelligenceAdapter(): PillListShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const eventIntel = useEventIntelligence(periodStart);
  const crossFeatureIntel = useCrossFeatureIntelligence();
  const dayStatus = (crossFeatureIntel.weekCharacter ?? 'balanced') as string;

  const statusColors: Record<string, string> = {
    light: '#22c55e',
    balanced: '#22d3ee',
    busy: '#f59e0b',
    overloaded: '#d97706',
  };

  const todayInsight = eventIntel.dayInsights.find((d) => d.isToday);
  const conflicts = todayInsight?.conflicts?.length ?? 0;

  const items = [
    { label: dayStatus.charAt(0).toUpperCase() + dayStatus.slice(1), dotColor: statusColors[dayStatus] ?? '#22d3ee' },
    ...(conflicts > 0 ? [{ label: `${conflicts} overlap${conflicts > 1 ? 's' : ''}`, dotColor: '#d97706' }] : []),
  ];

  return {
    items,
    header: 'Day Status',
    headerColor: '#22d3ee',
    emptyMessage: 'No events today',
    maxItems: 3,
  };
}

// ── habit-status ──

export function useHabitStatusAdapter(): PillListShapeProps {
  const { data: habitsData } = useHabits();
  const habits = habitsData ?? [];
  const items = habits.slice(0, 3).map((h) => ({
    label: h.habit_name,
    dotColor: h.current_streak > 0 ? '#34d399' : '#64748b',
  }));

  return {
    items,
    header: 'Habits',
    headerColor: '#a78bfa',
    emptyMessage: 'No habits tracked',
    maxItems: 3,
  };
}

// ── week-day-health ──

export function useWeekDayHealthAdapter(): StatGridShapeProps {
  const periodStart = useMemo(() => getMonday(), []);
  const eventIntel = useEventIntelligence(periodStart);

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu'];
  const stats = eventIntel.dayInsights.slice(0, 4).map((d, i) => {
    const statusColors: Record<string, string> = {
      light: '#22c55e',
      balanced: '#22d3ee',
      busy: '#f59e0b',
      overloaded: '#d97706',
    };
    return {
      value: d.eventCount ?? 0,
      label: dayLabels[i] ?? `D${i + 1}`,
      color: statusColors[d.status ?? 'balanced'] ?? '#22d3ee',
    };
  });

  return { stats, columns: 2, maxItems: 4 };
}

// ── Sub-arc card adapters ────────────────────────────────────────────────────

const WAKING_HOURS = 16;

// ── week-event-count (WeekEventsCard hero) ──

export function useWeekEventCountAdapter(): HeroMetricShapeProps {
  const weekStart = getMonday();
  const today = getTodayLocal();
  const intel = useEventIntelligence(weekStart);

  const totalCount = intel.weekEventCount;
  const todayCount = (intel.byDate[today] ?? []).length;
  const todayConflicts = intel.dayInsights
    .find(d => d.date === today)?.conflicts.length ?? 0;

  const sublabel = todayConflicts > 0
    ? `${todayCount} today, ${todayConflicts} overlap`
    : todayCount > 0
      ? `${todayCount} today`
      : 'none today';

  return {
    value: totalCount,
    label: 'EVENTS',
    sublabel,
    color: '#22d3ee',
  };
}

// ── week-character (WeekSummaryCard hero) ──

const CHARACTER_MAP: Record<string, { label: string; color: string }> = {
  light: { label: 'Light', color: '#4ade80' },
  balanced: { label: 'Balanced', color: '#38bdf8' },
  busy: { label: 'Busy', color: '#fbbf24' },
  overloaded: { label: 'Overloaded', color: '#fbbf24' },
};

export function useWeekCharacterAdapter(): HeroMetricShapeProps {
  const cross = useCrossFeatureIntelligence();
  const char = CHARACTER_MAP[cross.weekCharacter] ?? CHARACTER_MAP.balanced;
  const topInsight = cross.insights[0]?.message;

  return {
    value: char.label,
    label: 'WEEK',
    sublabel: topInsight,
    color: char.color,
  };
}

// ── week-free-hours (WeekCalendarCard/Rhythm hero) ──

export function useWeekFreeHoursAdapter(): HeroMetricShapeProps {
  const today = getTodayLocal();
  const weekStart = getMonday();
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const intel = useEventIntelligence(weekStart);

  // Previous weeks for trend (intelligence hooks = canonical data source)
  const prev1 = addWeeks(weekStart, -1);
  const prev2 = addWeeks(weekStart, -2);
  const prev3 = addWeeks(weekStart, -3);
  const prevIntel1 = useEventIntelligence(prev1);
  const prevIntel2 = useEventIntelligence(prev2);
  const prevIntel3 = useEventIntelligence(prev3);

  const todayIndex = weekDates.indexOf(today);
  const todayEvents = intel.byDate[today] ?? [];

  // Today's free hours
  const todayFree = useMemo(() => {
    if (todayIndex < 0) return WAKING_HOURS;
    let committed = 0;
    for (const ev of todayEvents) {
      if (ev.start_time && ev.end_time) {
        const [sh, sm] = ev.start_time.split(':').map(Number);
        const [eh, em] = ev.end_time.split(':').map(Number);
        committed += Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
      } else {
        committed += 1;
      }
    }
    return Math.max(0, WAKING_HOURS - committed);
  }, [todayEvents, todayIndex]);

  // Trend label
  const trendLabel = useMemo(() => {
    const currentCount = intel.weekEventCount;
    const prevCounts = [
      prevIntel1.weekEventCount,
      prevIntel2.weekEventCount,
      prevIntel3.weekEventCount,
    ];
    const filled = prevCounts.filter(c => c > 0);
    const avg = filled.length > 0 ? filled.reduce((s, c) => s + c, 0) / filled.length : 0;
    const delta = avg > 0 ? Math.round(((currentCount - avg) / avg) * 100) : 0;
    if (delta > 10) return `${delta}% busier`;
    if (delta < -10) return `${Math.abs(delta)}% lighter`;
    return 'Similar to average';
  }, [intel.weekEventCount, prevIntel1.weekEventCount, prevIntel2.weekEventCount, prevIntel3.weekEventCount]);

  return {
    value: `${Math.round(todayFree)}h`,
    label: 'RHYTHM',
    sublabel: trendLabel,
    color: todayFree >= 8 ? '#4ade80' : todayFree >= 4 ? '#38bdf8' : '#fbbf24',
  };
}

// ── week-patterns (WeekCalendarCard pills) ──

export function useWeekPatternsAdapter(): PillListShapeProps {
  const weekStart = getMonday();
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const intel = useEventIntelligence(weekStart);
  const finance = useFinanceIntelligence();

  const items = useMemo(() => {
    const result: { label: string; dotColor: string }[] = [];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // Busiest day
    let busiestIdx = 0;
    let busiestCount = 0;
    for (let i = 0; i < 7; i++) {
      const count = (intel.byDate[weekDates[i]] ?? []).length;
      if (count > busiestCount) { busiestCount = count; busiestIdx = i; }
    }
    if (busiestCount > 0) {
      result.push({ label: `Busiest: ${dayNames[busiestIdx]} (${busiestCount})`, dotColor: '#22d3ee' });
    }

    // Free windows
    const freeDay = weekDates.find(date => {
      const dayEvents = intel.byDate[date] ?? [];
      let committed = 0;
      for (const ev of dayEvents) {
        if (ev.start_time && ev.end_time) {
          const [sh, sm] = ev.start_time.split(':').map(Number);
          const [eh, em] = ev.end_time.split(':').map(Number);
          committed += Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
        } else committed += 1;
      }
      return (WAKING_HOURS - committed) >= 8;
    });
    if (freeDay) {
      const idx = weekDates.indexOf(freeDay);
      result.push({ label: `Light: ${dayNames[idx]}`, dotColor: '#4ade80' });
    }

    // Budget pace
    const exceeded = finance.budgetPaceInsights.filter(b => b.level === 'exceeded');
    if (exceeded.length > 0) {
      result.push({ label: `Budget: ${exceeded.length} over`, dotColor: '#f59e0b' });
    } else if (finance.budgetPaceInsights.length > 0) {
      result.push({ label: 'Budget: on pace', dotColor: '#34d399' });
    }

    return result;
  }, [intel.byDate, weekDates, finance.budgetPaceInsights]);

  return {
    items,
    header: 'Patterns',
    headerColor: '#22d3ee',
    emptyMessage: 'No patterns detected',
    maxItems: 3,
  };
}

// ── week-bill-total (WeekBillsCard hero) ──

export function useWeekBillTotalAdapter(): HeroMetricShapeProps {
  const { billInsights, totalUpcoming } = useFinanceIntelligence();
  const visibleCount = billInsights.filter(i => i.shouldShow).length;

  return {
    value: fmtCurrency(totalUpcoming),
    label: 'BILLS',
    sublabel: `${visibleCount} upcoming`,
    color: '#a78bfa',
  };
}
