/**
 * HabitsSection Component
 *
 * Debug section for Habit Tracking.
 * Shows all habits, streaks, forgiveness tokens, and allows manual recording.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patternsApi, type HabitStreak, type HabitsSummary } from '@/api/client';
import { DebugCard, StatusIndicator, ProgressBar } from '../shared';
import { getHabitTrendColor, getHabitTrendBgColor, habitKeys } from '@/hooks/useHabitStreaks';

type HabitsTab = 'overview' | 'all-habits' | 'record';

export function HabitsSection() {
  const [activeTab, setActiveTab] = useState<HabitsTab>('overview');
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedHabit, setSelectedHabit] = useState<string>('');
  const queryClient = useQueryClient();

  // Fetch all habits
  const { data: habits, isLoading: habitsLoading, error: habitsError } = useQuery<HabitStreak[]>({
    queryKey: habitKeys.list(),
    queryFn: () => patternsApi.getHabits(),
  });

  // Fetch habits summary
  const { data: summary, isLoading: summaryLoading } = useQuery<HabitsSummary>({
    queryKey: habitKeys.summary(),
    queryFn: () => patternsApi.getHabitsSummary(),
  });

  // Record habit mutation
  const recordMutation = useMutation({
    mutationFn: ({ habitName, occurred }: { habitName: string; occurred: boolean }) =>
      patternsApi.recordHabit(habitName, occurred),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.all });
    },
  });

  const tabs: { id: HabitsTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'all-habits', label: 'All Habits' },
    { id: 'record', label: 'Record Habit' },
  ];

  // Format habit name for display
  const formatHabitName = (name: string) =>
    name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const handleRecordHabit = (habitName: string, occurred: boolean) => {
    recordMutation.mutate({ habitName, occurred });
  };

  const handleCreateAndRecord = () => {
    if (!newHabitName.trim()) return;
    const habitName = newHabitName.trim().toLowerCase().replace(/\s+/g, '_');
    recordMutation.mutate({ habitName, occurred: true });
    setNewHabitName('');
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
              activeTab === tab.id
                ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {habitsError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          Error loading habits: {habitsError instanceof Error ? habitsError.message : 'Unknown error'}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <DebugCard title="Habit Summary">
            {summaryLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-slate-700 rounded w-1/2" />
                <div className="h-4 bg-slate-700 rounded w-1/3" />
              </div>
            ) : summary ? (
              <div className="space-y-4">
                {/* Total count */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Total Habits Tracked</span>
                  <span className="text-xl font-bold text-white">{summary.habits_tracked}</span>
                </div>

                {/* Strongest Habit */}
                {summary.strongest_habit && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-emerald-400 mb-1">Strongest Habit</div>
                        <div className="text-sm font-medium text-white">
                          {formatHabitName(summary.strongest_habit.name)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-400">
                          {summary.strongest_habit.display.best_of_y}
                        </div>
                        <div className="text-xs text-slate-500">
                          {summary.strongest_habit.display.trend_label}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Weakest Habit */}
                {summary.weakest_habit && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-amber-400 mb-1">Needs Attention</div>
                        <div className="text-sm font-medium text-white">
                          {formatHabitName(summary.weakest_habit.name)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-amber-400">
                          {summary.weakest_habit.display.best_of_y}
                        </div>
                        <div className="text-xs text-slate-500">
                          {summary.weakest_habit.display.trend_label}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* No habits message */}
                {summary.habits_tracked === 0 && (
                  <div className="text-center py-6 text-slate-500">
                    <div className="text-4xl mb-2">🌱</div>
                    <div className="text-sm">No habits tracked yet</div>
                    <div className="text-xs mt-1">Use the "Record Habit" tab to create one</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">No data available</div>
            )}
          </DebugCard>

          {/* Quick Stats Grid */}
          {habits && habits.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/50 text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {habits.filter(h => h.display.trend_label === 'Strong habit').length}
                </div>
                <div className="text-xs text-slate-500">Strong</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 text-center">
                <div className="text-2xl font-bold text-emerald-400">
                  {habits.filter(h => h.display.trend_label === 'Building').length}
                </div>
                <div className="text-xs text-slate-500">Building</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {habits.filter(h => h.display.trend_label === 'Fading').length}
                </div>
                <div className="text-xs text-slate-500">Fading</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Habits Tab */}
      {activeTab === 'all-habits' && (
        <div className="space-y-3">
          {habitsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-24 bg-slate-700/50 rounded-lg" />
              ))}
            </div>
          ) : habits && habits.length > 0 ? (
            habits.map(habit => (
              <HabitDetailCard
                key={habit.id}
                habit={habit}
                onRecord={(occurred) => handleRecordHabit(habit.habit_name, occurred)}
                isRecording={recordMutation.isPending}
              />
            ))
          ) : (
            <div className="text-center py-8 text-slate-500">
              <div className="text-4xl mb-2">📋</div>
              <div className="text-sm">No habits found</div>
              <div className="text-xs mt-1">Create a habit in the "Record Habit" tab</div>
            </div>
          )}
        </div>
      )}

      {/* Record Habit Tab */}
      {activeTab === 'record' && (
        <div className="space-y-4">
          {/* Create New Habit */}
          <DebugCard title="Create New Habit">
            <div className="space-y-3">
              <input
                type="text"
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                placeholder="e.g., morning_exercise, weekly_planning"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <button
                onClick={handleCreateAndRecord}
                disabled={!newHabitName.trim() || recordMutation.isPending}
                className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {recordMutation.isPending ? 'Creating...' : 'Create & Record Occurrence'}
              </button>
              <p className="text-xs text-slate-500">
                This will create a new habit and record today as an occurrence.
              </p>
            </div>
          </DebugCard>

          {/* Quick Record Existing */}
          {habits && habits.length > 0 && (
            <DebugCard title="Quick Record Existing Habit">
              <div className="space-y-3">
                <select
                  value={selectedHabit}
                  onChange={(e) => setSelectedHabit(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">Select a habit...</option>
                  {habits.map(h => (
                    <option key={h.id} value={h.habit_name}>
                      {formatHabitName(h.habit_name)}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => selectedHabit && handleRecordHabit(selectedHabit, true)}
                    disabled={!selectedHabit || recordMutation.isPending}
                    className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    ✓ Done Today
                  </button>
                  <button
                    onClick={() => selectedHabit && handleRecordHabit(selectedHabit, false)}
                    disabled={!selectedHabit || recordMutation.isPending}
                    className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    ✗ Missed (Use Save)
                  </button>
                </div>
              </div>
            </DebugCard>
          )}

          {/* Status Message */}
          {recordMutation.isSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
              ✓ Habit recorded successfully!
            </div>
          )}
          {recordMutation.isError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              Error: {recordMutation.error instanceof Error ? recordMutation.error.message : 'Failed to record'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// HABIT DETAIL CARD
// =============================================================================

interface HabitDetailCardProps {
  habit: HabitStreak;
  onRecord: (occurred: boolean) => void;
  isRecording: boolean;
}

function HabitDetailCard({ habit, onRecord, isRecording }: HabitDetailCardProps) {
  const { display } = habit;
  const textColor = getHabitTrendColor(display.trend_label);
  const bgColor = getHabitTrendBgColor(display.trend_label);

  const formatHabitName = (name: string) =>
    name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <div className={`rounded-xl border border-slate-700/50 overflow-hidden ${bgColor}`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-slate-800/50`}>
            <span className="text-xl">{getTrendIcon(display.trend_label)}</span>
          </div>
          <div>
            <div className="text-sm font-medium text-white">{formatHabitName(habit.habit_name)}</div>
            <div className={`text-xs ${textColor}`}>{display.trend_label}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${textColor}`}>
            {display.streak > 0 ? `${display.streak}w` : '—'}
          </div>
          <div className="text-xs text-slate-500">streak</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-4 py-3 border-t border-slate-700/30 grid grid-cols-4 gap-3 text-center">
        <div>
          <div className="text-xs text-slate-500 mb-1">Progress</div>
          <div className={`text-sm font-medium ${textColor}`}>{display.best_of_y}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Trend</div>
          <div className="text-sm font-medium text-white">{Math.round(display.trend_score * 100)}%</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Saves</div>
          <div className="text-sm font-medium text-cyan-400">
            {habit.forgiveness_tokens}/{habit.max_tokens}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Total</div>
          <div className="text-sm font-medium text-white">{habit.total_occurrences}</div>
        </div>
      </div>

      {/* Trend Progress Bar */}
      <div className="px-4 py-2 border-t border-slate-700/30">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-12">Trend</span>
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${bgColor.replace('/15', '')}`}
              style={{ width: `${display.trend_score * 100}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 w-10 text-right">
            {Math.round(display.trend_score * 100)}%
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-2 border-t border-slate-700/30 flex gap-2">
        <button
          onClick={() => onRecord(true)}
          disabled={isRecording}
          className="flex-1 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          ✓ Record Done
        </button>
        <button
          onClick={() => onRecord(false)}
          disabled={isRecording}
          className="flex-1 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          ✗ Record Miss
        </button>
      </div>

      {/* Last occurrence */}
      {habit.last_occurrence && (
        <div className="px-4 py-2 border-t border-slate-700/30 text-xs text-slate-500">
          Last recorded: {new Date(habit.last_occurrence).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

// Helper function to get trend icon
function getTrendIcon(trendLabel: HabitStreak['display']['trend_label']): string {
  switch (trendLabel) {
    case 'Strong habit':
      return '🌟';
    case 'Building':
      return '📈';
    case 'Fading':
      return '📉';
    case 'Starting fresh':
      return '🌱';
    default:
      return '•';
  }
}

export default HabitsSection;
