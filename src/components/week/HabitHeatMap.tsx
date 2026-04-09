/**
 * HabitHeatMap Component
 *
 * Heat map visualization for habits showing Mon-Sun completion cells.
 * Follows UX principle: "Avoid expandable rows for high-frequency habits"
 *
 * Features:
 * - Heat map cells (Mon-Sun) based on trend
 * - Trend indicator (Strong/Building/Fading/Starting)
 * - "Best X of Y" forgiveness-based metric
 * - Single "Track today" action button
 *
 * Part of the UX compliance improvements.
 */

import { useState } from 'react';
import type { HabitStreak } from '@/api/client';
import { useRecordHabit, getHabitTrendColor, getHabitTrendIcon } from '@/hooks/useHabitStreaks';

interface HabitHeatMapRowProps {
  habit: HabitStreak;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Format habit name for display (planning_session -> Planning Session)
 */
function formatHabitName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate heat map cells based on trend score.
 * Higher trend score = more filled cells.
 */
function generateHeatCells(trendScore: number): boolean[] {
  // trend_score is 0-100, convert to 0-7 filled cells
  const filledCount = Math.round((trendScore / 100) * 7);
  // Fill from the start (earlier in week = more likely completed)
  return Array(7).fill(false).map((_, i) => i < filledCount);
}

/**
 * Get short trend label for compact display
 */
function getShortTrendLabel(trendLabel: HabitStreak['display']['trend_label']): string {
  switch (trendLabel) {
    case 'Strong habit': return 'Strong';
    case 'Building': return 'Building';
    case 'Fading': return 'Fading';
    case 'Starting fresh': return 'Starting';
    default: return '';
  }
}

/**
 * Single habit row with heat map visualization.
 */
export function HabitHeatMapRow({ habit }: HabitHeatMapRowProps) {
  const { display } = habit;
  const textColor = getHabitTrendColor(display.trend_label);
  const cells = generateHeatCells(display.trend_score);

  return (
    <div className="flex items-center justify-between py-2 px-1">
      {/* Habit name */}
      <div className="flex items-center gap-2 min-w-[120px]">
        <span className="text-sm text-slate-300">{formatHabitName(habit.habit_name)}</span>
      </div>

      {/* Heat map cells */}
      <div className="flex gap-1">
        {cells.map((filled, idx) => (
          <div
            key={idx}
            className={`
              w-5 h-5 rounded-sm transition-colors
              ${filled
                ? 'bg-cyan-500/70'
                : 'bg-slate-700/50'
              }
            `}
            title={DAY_LABELS[idx]}
          />
        ))}
      </div>

      {/* Trend indicator */}
      <div className="flex items-center gap-2 min-w-[100px] justify-end">
        <span className="text-sm">{getHabitTrendIcon(display.trend_label)}</span>
        <span className={`text-xs ${textColor}`}>
          {getShortTrendLabel(display.trend_label)}
        </span>
        {display.streak > 0 && (
          <span className="text-xs text-slate-500">({display.streak}w)</span>
        )}
      </div>
    </div>
  );
}

/**
 * Quick check-in modal for recording today's habit.
 */
interface QuickCheckInModalProps {
  habit: HabitStreak | null;
  isOpen: boolean;
  onClose: () => void;
}

export function HabitQuickCheckInModal({ habit, isOpen, onClose }: QuickCheckInModalProps) {
  const recordHabit = useRecordHabit();
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isOpen || !habit) return null;

  const handleRecord = async (occurred: boolean) => {
    try {
      await recordHabit.mutateAsync({
        habitName: habit.habit_name,
        occurred,
      });

      // Show forgiveness-based feedback
      if (occurred) {
        const newStreak = habit.display.streak + 1;
        setFeedbackMessage(`Nice! ${newStreak > 1 ? `${newStreak} week streak` : 'Started!'}`);
      } else {
        const savesLeft = habit.display.saves_remaining - 1;
        if (savesLeft >= 0) {
          setFeedbackMessage(`Noted! ${savesLeft} saves left`);
        } else {
          setFeedbackMessage('Noted. Ready to start fresh!');
        }
      }

      // Close modal after delay
      setTimeout(() => {
        setFeedbackMessage(null);
        onClose();
      }, 1200);
    } catch {
      setFeedbackMessage('Error recording');
      setTimeout(() => setFeedbackMessage(null), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-slate-800 rounded-xl border border-slate-700 p-5 max-w-xs w-full mx-4 shadow-xl">
        <h3 className="text-lg font-medium text-white text-center mb-1">
          {formatHabitName(habit.habit_name)}
        </h3>
        <p className="text-sm text-slate-400 text-center mb-4">
          Did you complete this today?
        </p>

        {feedbackMessage ? (
          <div className={`text-center py-4 text-lg ${feedbackMessage.includes('Error') ? 'text-amber-400' : 'text-emerald-400'}`}>
            {feedbackMessage}
          </div>
        ) : (
          <>
            <div className="flex gap-3">
              <button
                onClick={() => handleRecord(true)}
                disabled={recordHabit.isPending}
                className="flex-1 px-4 py-3 rounded-lg
                         bg-emerald-600 hover:bg-emerald-500
                         text-white font-medium text-base
                         transition-colors disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => handleRecord(false)}
                disabled={recordHabit.isPending}
                className="flex-1 px-4 py-3 rounded-lg
                         bg-slate-600 hover:bg-slate-500
                         text-slate-200 font-medium text-base
                         transition-colors disabled:opacity-50"
              >
                No
              </button>
            </div>
            {habit.display.saves_remaining > 0 && (
              <p className="text-xs text-slate-500 mt-3 text-center">
                {habit.display.saves_remaining} forgiveness tokens remaining
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Full habit heat map section with all habits and track button.
 */
interface HabitHeatMapProps {
  habits: HabitStreak[];
  /** Overall "Best X of Y" text to display */
  summaryText?: string;
  /** Max habits to show */
  limit?: number;
}

export function HabitHeatMap({ habits, summaryText, limit }: HabitHeatMapProps) {
  const [selectedHabit, setSelectedHabit] = useState<HabitStreak | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const effectiveLimit = showAll ? undefined : limit;
  const displayHabits = effectiveLimit ? habits.slice(0, effectiveLimit) : habits;

  if (displayHabits.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-slate-500">
        No habits tracked yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Habit rows */}
      {displayHabits.map(habit => (
        <HabitHeatMapRow key={habit.id} habit={habit} />
      ))}

      {/* Day labels footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
        <div className="min-w-[120px]" />
        <div className="flex gap-1">
          {DAY_LABELS.map((label, idx) => (
            <div key={idx} className="w-5 text-center text-xs text-slate-500">
              {label}
            </div>
          ))}
        </div>
        <div className="min-w-[100px]" />
      </div>

      {/* Habit picker (shown when multiple habits and user clicks Track today) */}
      {showPicker && habits.length > 1 && (
        <div className="bg-slate-800/50 rounded-lg p-2 mt-1">
          <p className="text-xs text-slate-400 mb-2">Which habit?</p>
          <div className="flex flex-wrap gap-1">
            {habits.map(habit => (
              <button
                key={habit.id}
                onClick={() => {
                  setSelectedHabit(habit);
                  setShowPicker(false);
                }}
                className="px-2 py-1 rounded text-xs transition-colors
                  bg-slate-700/50 text-slate-400 hover:bg-cyan-500/30 hover:text-cyan-300"
              >
                {formatHabitName(habit.habit_name)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Track today button */}
      <div className="flex items-center justify-between pt-3">
        {summaryText && (
          <span className="text-xs text-slate-500">{summaryText}</span>
        )}
        <button
          onClick={() => {
            if (habits.length === 1) {
              setSelectedHabit(habits[0]);
            } else {
              setShowPicker(prev => !prev);
            }
          }}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium
                   bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30
                   text-cyan-400 transition-colors"
        >
          + Track today
        </button>
      </div>

      {/* Quick check-in modal */}
      <HabitQuickCheckInModal
        habit={selectedHabit}
        isOpen={selectedHabit !== null}
        onClose={() => setSelectedHabit(null)}
      />

      {/* Show more / show less toggle */}
      {limit && habits.length > limit && (
        <button
          onClick={() => setShowAll(prev => !prev)}
          className="w-full text-center text-xs text-slate-500 hover:text-cyan-400 pt-1 transition-colors"
        >
          {showAll
            ? 'Show less'
            : `+${habits.length - limit} more habit${habits.length - limit !== 1 ? 's' : ''}`
          }
        </button>
      )}
    </div>
  );
}

export default HabitHeatMap;
