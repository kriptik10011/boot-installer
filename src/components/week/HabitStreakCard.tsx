/**
 * HabitStreakCard - Shows habit streak progress.
 *
 * Uses forgiveness-based streaks with "Best X of Y" display.
 * No-shame design: focuses on progress, not failure.
 */

import type { HabitStreak } from '@/api/client';
import { getHabitTrendColor, getHabitTrendBgColor } from '@/hooks/useHabitStreaks';

interface HabitStreakCardProps {
  habit: HabitStreak;
  /** Whether to show in compact mode */
  compact?: boolean;
  /** Called when user clicks the card */
  onClick?: () => void;
}

/**
 * Individual habit streak card.
 */
export function HabitStreakCard({ habit, compact = false, onClick }: HabitStreakCardProps) {
  const { display } = habit;
  const textColor = getHabitTrendColor(display.trend_label);
  const bgColor = getHabitTrendBgColor(display.trend_label);

  // Format habit name for display (planning_session -> Planning Session)
  const formattedName = habit.habit_name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (compact) {
    // Compact mode: Single line for list views
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${bgColor} hover:opacity-90 w-full text-left`}
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white truncate">{formattedName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={textColor}>{display.best_of_y}</span>
          {display.saves_remaining > 0 && (
            <span className="text-slate-500">{display.saves_remaining}💾</span>
          )}
        </div>
      </button>
    );
  }

  // Full mode: Card with details
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border border-slate-700/50 overflow-hidden transition-colors hover:border-slate-600/50 ${bgColor}`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Trend indicator */}
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor.replace('/15', '/30')}`}>
            <span className="text-xl">{getTrendIcon(display.trend_label)}</span>
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-white">{formattedName}</div>
            <div className={`text-xs ${textColor}`}>{display.trend_label}</div>
          </div>
        </div>

        {/* Progress display - No-Shame Pattern: show progress, not streak */}
        <div className="text-right">
          <div className={`text-sm font-medium ${textColor}`}>
            {display.best_of_y}
          </div>
          <div className="text-xs text-slate-500">
            {display.trend_label === 'Starting fresh' ? 'Fresh start' : 'this week'}
          </div>
        </div>
      </div>

      {/* Stats row - No-Shame: focus on positive indicators */}
      <div className="px-4 py-2 border-t border-slate-700/30 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          {/* Current streak - only show if positive */}
          {display.streak > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Streak:</span>
              <span className={textColor}>{display.streak} weeks</span>
            </div>
          )}

          {/* Saves - positive framing */}
          {display.saves_remaining > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Saves available:</span>
              <span className="text-cyan-400">{display.saves_remaining}</span>
            </div>
          )}
        </div>

        {/* Trend score as bar */}
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${bgColor.replace('/15', '')}`}
              style={{ width: `${display.trend_score * 100}%` }}
            />
          </div>
          <span className="text-slate-500">{Math.round(display.trend_score * 100)}%</span>
        </div>
      </div>
    </button>
  );
}

/**
 * List of habit streak cards.
 */
interface HabitStreakListProps {
  habits: HabitStreak[];
  onHabitClick?: (habit: HabitStreak) => void;
  /** Show compact version for each card */
  compact?: boolean;
  /** Max number of habits to show */
  limit?: number;
}

export function HabitStreakList({ habits, onHabitClick, compact = false, limit }: HabitStreakListProps) {
  const displayHabits = limit ? habits.slice(0, limit) : habits;

  if (displayHabits.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-slate-500">
        Ready to build new habits
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-3'}>
      {displayHabits.map(habit => (
        <HabitStreakCard
          key={habit.id}
          habit={habit}
          compact={compact}
          onClick={() => onHabitClick?.(habit)}
        />
      ))}
      {limit && habits.length > limit && (
        <div className="text-center text-xs text-slate-500 pt-2">
          +{habits.length - limit} more habits
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

export default HabitStreakCard;
