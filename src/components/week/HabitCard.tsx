/**
 * HabitCard Component
 *
 * Displays habit tracking in the week view.
 * Shows streak, trend, and check-in button for habits that need attention.
 */

import { useState } from 'react';
import {
  useHabitsSummary,
  useRecordHabit,
  useHabitsNeedingCheckIn,
  formatHabitName,
  getHabitIcon,
  getTrendColor,
  getTrendBgColor,
  type Habit,
} from '@/hooks/useHabits';
import { useToastStore } from '@/stores/toastStore';

interface HabitCardProps {
  /** Callback when user wants to manage habits */
  onManageHabits?: () => void;
}

export function HabitCard({ onManageHabits }: HabitCardProps) {
  const { data: summary, isLoading } = useHabitsSummary();
  const habitsNeedingCheckIn = useHabitsNeedingCheckIn();
  const recordHabit = useRecordHabit();
  const addToast = useToastStore((s) => s.addToast);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 animate-pulse">
        <div className="h-4 w-24 bg-slate-700 rounded mb-3" />
        <div className="h-8 w-full bg-slate-700 rounded" />
      </div>
    );
  }

  // No habits tracked yet
  if (!summary?.has_data) {
    return (
      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-400">Habits</h3>
          {onManageHabits && (
            <button
              onClick={onManageHabits}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              + Add habit
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500">
          No habits tracked yet. Add your first habit to start building streaks.
        </p>
      </div>
    );
  }

  const handleCheckIn = async (habitName: string, occurred: boolean) => {
    setCheckingIn(habitName);
    try {
      await recordHabit.mutateAsync({ habitName, occurred });
    } catch {
      addToast({ message: `Failed to record habit check-in`, type: 'error', durationMs: 4000 });
    } finally {
      setCheckingIn(null);
    }
  };

  return (
    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-400">
          Habits
          {summary.habits_tracked > 0 && (
            <span className="ml-2 text-xs text-slate-500">
              ({summary.habits_tracked} tracked)
            </span>
          )}
        </h3>
        {onManageHabits && (
          <button
            onClick={onManageHabits}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Manage
          </button>
        )}
      </div>

      {/* Habits needing check-in this week */}
      {habitsNeedingCheckIn.length > 0 && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="text-xs text-amber-400 mb-2">
            Weekly check-in needed
          </div>
          <div className="space-y-2">
            {habitsNeedingCheckIn.slice(0, 3).map(habit => (
              <div
                key={habit.id}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span>{getHabitIcon(habit.habit_name)}</span>
                  <span className="text-sm text-white">
                    {formatHabitName(habit.habit_name)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleCheckIn(habit.habit_name, true)}
                    disabled={checkingIn === habit.habit_name}
                    className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    {checkingIn === habit.habit_name ? '...' : 'Yes'}
                  </button>
                  <button
                    onClick={() => handleCheckIn(habit.habit_name, false)}
                    disabled={checkingIn === habit.habit_name}
                    className="px-2 py-1 text-xs bg-slate-600/50 text-slate-400 rounded hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    No
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strongest habit display */}
      {summary.strongest_habit && (
        <div
          className={`p-3 rounded-lg border ${getTrendBgColor(summary.strongest_habit.display.trend_label)}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {getHabitIcon(summary.strongest_habit.name)}
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">
                {formatHabitName(summary.strongest_habit.name)}
              </div>
              <div className={`text-xs ${getTrendColor(summary.strongest_habit.display.trend_label)}`}>
                {summary.strongest_habit.display.display_text}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-medium ${getTrendColor(summary.strongest_habit.display.trend_label)}`}>
                {summary.strongest_habit.display.trend_label}
              </div>
              <div className="text-xs text-slate-500">
                {summary.strongest_habit.display.trend_text}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show more habits if available */}
      {summary.habits.length > 1 && (
        <div className="mt-3 space-y-2">
          {summary.habits
            .filter(h => h.habit_name !== summary.strongest_habit?.name)
            .slice(0, 2)
            .map(habit => (
              <HabitRow key={habit.id} habit={habit} />
            ))}
        </div>
      )}
    </div>
  );
}

function HabitRow({ habit }: { habit: Habit }) {
  return (
    <div className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm">{getHabitIcon(habit.habit_name)}</span>
        <span className="text-sm text-slate-300">
          {formatHabitName(habit.habit_name)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${getTrendColor(habit.display.trend_label)}`}>
          {habit.display.streak}w
        </span>
        <span className="text-xs text-slate-500">
          ({habit.display.saves_remaining} saves)
        </span>
      </div>
    </div>
  );
}
