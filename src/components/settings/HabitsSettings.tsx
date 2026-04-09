/**
 * HabitsSettings Component
 *
 * Settings panel for managing habits:
 * - View all tracked habits
 * - Add custom habits
 * - See auto-tracked habits info
 */

import { useState } from 'react';
import {
  useHabits,
  useRecordHabit,
  formatHabitName,
  getHabitIcon,
  getTrendColor,
  AUTO_HABITS,
  type Habit,
} from '@/hooks/useHabits';

export function HabitsSettings() {
  const { data: habits, isLoading } = useHabits();
  const recordHabit = useRecordHabit();
  const [newHabitName, setNewHabitName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddHabit = async () => {
    if (!newHabitName.trim()) return;

    const habitName = newHabitName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    if (!habitName) return;

    setIsAdding(true);
    try {
      // Create habit by recording first occurrence
      await recordHabit.mutateAsync({ habitName, occurred: true });
      setNewHabitName('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Auto-tracked Habits Info */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-3">
          Auto-Tracked Habits
        </h4>
        <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <p className="text-sm text-slate-400 mb-3">
            These habits are tracked automatically based on your app usage:
          </p>
          <div className="space-y-2">
            {Object.values(AUTO_HABITS).map(habit => (
              <div key={habit.name} className="flex items-center gap-3">
                <span className="text-lg">{habit.icon}</span>
                <div>
                  <div className="text-sm text-white">{habit.displayName}</div>
                  <div className="text-xs text-slate-500">{habit.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Custom Habit */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-3">
          Add Custom Habit
        </h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={newHabitName}
            onChange={e => setNewHabitName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddHabit()}
            placeholder="e.g., Exercise, Reading, Meditation..."
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleAddHabit}
            disabled={isAdding || !newHabitName.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
          >
            {isAdding ? 'Adding...' : 'Add'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Custom habits require weekly check-in to track progress.
        </p>
      </div>

      {/* Current Habits */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-3">
          Your Habits ({habits?.length || 0})
        </h4>
        {isLoading ? (
          <div className="p-4 bg-slate-700/50 rounded-lg animate-pulse">
            <div className="h-4 w-32 bg-slate-600 rounded" />
          </div>
        ) : habits && habits.length > 0 ? (
          <div className="space-y-2">
            {habits.map(habit => (
              <HabitItem key={habit.id} habit={habit} />
            ))}
          </div>
        ) : (
          <div className="p-4 bg-slate-700/50 rounded-lg text-center">
            <p className="text-sm text-slate-500">
              No habits tracked yet. Add a custom habit above or they'll appear as you use the app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function HabitItem({ habit }: { habit: Habit }) {
  const trendColor = getTrendColor(habit.display.trend_label);
  const isAutoHabit = habit.habit_name in AUTO_HABITS;

  return (
    <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
      <div className="flex items-center gap-3">
        <span className="text-lg">{getHabitIcon(habit.habit_name)}</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">
              {formatHabitName(habit.habit_name)}
            </span>
            {isAutoHabit && (
              <span className="px-1.5 py-0.5 text-[10px] bg-cyan-500/20 text-cyan-400 rounded">
                AUTO
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {habit.display.display_text}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-medium ${trendColor}`}>
          {habit.display.trend_label}
        </div>
        <div className="text-xs text-slate-500">
          {habit.display.trend_text}
        </div>
      </div>
    </div>
  );
}
