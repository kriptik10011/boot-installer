/**
 * TimeOfDayContext — Greeting bar that adapts focus based on time of day.
 *
 * Morning: Today's first event + dinner planning prompt
 * Afternoon: Remaining today + tomorrow preview
 * Evening: Tomorrow's schedule focus
 * Night: Minimal, rest
 */

import type { DayData } from '../types';
import { formatTimeShort, type TimeOfDay } from './layoutDHelpers';

export interface TimeContextInfo {
  greeting: string;
  focus: string;
  focusDay: 'today' | 'tomorrow';
  actionPrompt: string | null;
  icon: 'sun' | 'cloud-sun' | 'moon' | 'stars';
}

export function getTimeContext(
  timeOfDay: TimeOfDay,
  today: DayData | undefined,
  tomorrow: DayData | undefined,
  currentTime: Date
): TimeContextInfo {
  const hour = currentTime.getHours();

  switch (timeOfDay) {
    case 'morning': {
      const nextEvent = today?.events.find(e => {
        if (!e.start_time) return true;
        const [h] = e.start_time.split(':').map(Number);
        return h > hour;
      });
      const hasDinnerPlanned = !!today?.meals.dinner;

      return {
        greeting: 'Good morning',
        focus: nextEvent
          ? `First up: ${nextEvent.name}${nextEvent.start_time ? ` at ${formatTimeShort(nextEvent.start_time)}` : ''}`
          : today?.events.length
            ? `${today.events.length} event${today.events.length > 1 ? 's' : ''} today`
            : 'Clear day ahead',
        focusDay: 'today',
        actionPrompt: !hasDinnerPlanned ? "Plan tonight's dinner?" : null,
        icon: 'sun',
      };
    }

    case 'afternoon': {
      const remainingEvents = today?.events.filter(e => {
        if (!e.start_time) return true;
        const [h] = e.start_time.split(':').map(Number);
        return h > hour;
      }) ?? [];

      const tomorrowPreview = tomorrow?.events.length
        ? `Tomorrow: ${tomorrow.events.length} event${tomorrow.events.length > 1 ? 's' : ''}`
        : 'Tomorrow is clear';

      return {
        greeting: 'Good afternoon',
        focus: remainingEvents.length > 0
          ? `${remainingEvents.length} more today`
          : 'Done for the day',
        focusDay: 'today',
        actionPrompt: tomorrowPreview,
        icon: 'cloud-sun',
      };
    }

    case 'evening': {
      const hasEarlyStart = tomorrow?.events.some(e =>
        e.start_time && e.start_time < '09:00'
      );
      const tomorrowEvents = tomorrow?.events.length ?? 0;

      return {
        greeting: 'Good evening',
        focus: tomorrowEvents > 0
          ? `Tomorrow: ${tomorrowEvents} event${tomorrowEvents > 1 ? 's' : ''}${hasEarlyStart ? ' (early start)' : ''}`
          : 'Tomorrow is clear',
        focusDay: 'tomorrow',
        actionPrompt: hasEarlyStart && !tomorrow?.meals.breakfast
          ? 'Plan breakfast for early start?'
          : null,
        icon: 'moon',
      };
    }

    case 'night': {
      return {
        greeting: 'Good night',
        focus: 'Rest well',
        focusDay: 'tomorrow',
        actionPrompt: null,
        icon: 'stars',
      };
    }
  }
}

// Time-of-Day Context Component
export function TimeOfDayContextBar({
  context,
  onActionClick,
  isPlanningMode,
}: {
  context: TimeContextInfo;
  onActionClick?: () => void;
  isPlanningMode: boolean;
}) {
  const iconMap = {
    sun: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    'cloud-sun': (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
    moon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    ),
    stars: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-800/60 to-slate-800/30 rounded-xl border border-slate-700/30">
      <div className="flex items-center gap-3">
        <div className="text-cyan-400">
          {iconMap[context.icon]}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{context.greeting}</span>
            <span className="text-slate-500">•</span>
            <span className="text-sm text-slate-300">{context.focus}</span>
          </div>
        </div>
      </div>

      {/* Action prompt - only in Planning Mode and when there's an action */}
      {isPlanningMode && context.actionPrompt && onActionClick && (
        <button
          onClick={onActionClick}
          className="px-3 py-1.5 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg transition-colors"
        >
          {context.actionPrompt}
        </button>
      )}

      {/* Secondary info (no action) */}
      {(!context.actionPrompt || !isPlanningMode) && context.actionPrompt && (
        <span className="text-xs text-slate-500">{context.actionPrompt}</span>
      )}
    </div>
  );
}
