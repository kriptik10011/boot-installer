/**
 * TimeInput Component
 *
 * Enhanced time input with smart parsing, duration presets, and keyboard navigation.
 * Accepts informal input ("2pm", "930", "2:30p") and normalizes to HH:MM format.
 *
 * Features:
 * - Smart time parsing: "2pm" → "14:00", "930" → "09:30", "2:30p" → "14:30"
 * - Duration presets: "30m", "1h", "1.5h", "2h" auto-set end time from start
 * - Duration label: Shows "1h 30m" between start and end
 * - Keyboard: Arrow keys adjust by 15min, Tab navigates naturally
 */

import { useState, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Time parsing
// ---------------------------------------------------------------------------

/**
 * Parse informal time strings into HH:MM format.
 *
 * Supported formats:
 *   "2pm"    → "14:00"
 *   "2:30pm" → "14:30"
 *   "2:30p"  → "14:30"
 *   "930"    → "09:30"
 *   "930a"   → "09:30"
 *   "14:30"  → "14:30"
 *   "2"      → "02:00"
 *   "14"     → "14:00"
 */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  // Already valid HH:MM — pass through
  if (/^\d{2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return s;
    return null;
  }

  // Strip am/pm suffix and detect meridiem
  let meridiem: 'am' | 'pm' | null = null;
  let numeric = s;
  if (/[ap]m?$/.test(numeric)) {
    meridiem = numeric.includes('p') ? 'pm' : 'am';
    numeric = numeric.replace(/[ap]m?$/, '');
  }

  // "H:MM" or "HH:MM" with optional meridiem
  const colonMatch = numeric.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    let h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (m > 59) return null;
    h = applyMeridiem(h, meridiem);
    if (h < 0 || h > 23) return null;
    return fmt(h, m);
  }

  // "HMM" or "HHMM" — 3 or 4 digits
  if (/^\d{3,4}$/.test(numeric)) {
    const hStr = numeric.length === 3 ? numeric.slice(0, 1) : numeric.slice(0, 2);
    const mStr = numeric.length === 3 ? numeric.slice(1) : numeric.slice(2);
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (m > 59) return null;
    h = applyMeridiem(h, meridiem);
    if (h < 0 || h > 23) return null;
    return fmt(h, m);
  }

  // "H" or "HH" — hour only
  if (/^\d{1,2}$/.test(numeric)) {
    let h = parseInt(numeric, 10);
    h = applyMeridiem(h, meridiem);
    if (h < 0 || h > 23) return null;
    return fmt(h, 0);
  }

  return null;
}

function applyMeridiem(h: number, meridiem: 'am' | 'pm' | null): number {
  if (!meridiem) return h;
  if (meridiem === 'am') {
    if (h === 12) return 0;
    return h;
  }
  // pm
  if (h === 12) return 12;
  if (h >= 1 && h <= 11) return h + 12;
  return h;
}

function fmt(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return fmt(newH, newM);
}

function computeDuration(start: string, end: string): string | null {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const DURATION_PRESETS = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TimeInputProps {
  startTime: string | null;
  endTime: string | null;
  onStartChange: (time: string | null) => void;
  onEndChange: (time: string | null) => void;
}

export function TimeInput({ startTime, endTime, onStartChange, onEndChange }: TimeInputProps) {
  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  // Display: show the committed value when not editing, draft when editing
  const startDisplay = startFocused ? startDraft : (startTime ?? '');
  const endDisplay = endFocused ? endDraft : (endTime ?? '');

  // Duration label
  const duration = startTime && endTime ? computeDuration(startTime, endTime) : null;

  const handleStartFocus = useCallback(() => {
    setStartDraft(startTime ?? '');
    setStartFocused(true);
  }, [startTime]);

  const handleEndFocus = useCallback(() => {
    setEndDraft(endTime ?? '');
    setEndFocused(true);
  }, [endTime]);

  const commitStart = useCallback((value: string) => {
    const parsed = parseTimeInput(value);
    onStartChange(parsed);
    setStartFocused(false);
  }, [onStartChange]);

  const commitEnd = useCallback((value: string) => {
    const parsed = parseTimeInput(value);
    onEndChange(parsed);
    setEndFocused(false);
  }, [onEndChange]);

  const handleStartKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitStart(startDraft);
      endRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = parseTimeInput(startDraft) ?? startTime;
      if (!base) return;
      const delta = e.key === 'ArrowUp' ? 15 : -15;
      const next = addMinutes(base, delta);
      onStartChange(next);
      setStartDraft(next);
    }
  }, [startDraft, startTime, commitStart, onStartChange]);

  const handleEndKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEnd(endDraft);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = parseTimeInput(endDraft) ?? endTime;
      if (!base) return;
      const delta = e.key === 'ArrowUp' ? 15 : -15;
      const next = addMinutes(base, delta);
      onEndChange(next);
      setEndDraft(next);
    }
  }, [endDraft, endTime, commitEnd, onEndChange]);

  const handlePreset = useCallback((minutes: number) => {
    if (!startTime) return;
    onEndChange(addMinutes(startTime, minutes));
  }, [startTime, onEndChange]);

  const inputClasses = 'w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 text-sm';

  return (
    <div className="space-y-2">
      {/* Labels + inputs row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="time-start" className="block text-sm font-medium text-slate-300 mb-2">
            Start Time
          </label>
          <input
            ref={startRef}
            id="time-start"
            type="text"
            inputMode="text"
            placeholder="e.g. 2pm, 9:30"
            value={startDisplay}
            onChange={(e) => setStartDraft(e.target.value)}
            onFocus={handleStartFocus}
            onBlur={() => commitStart(startDraft)}
            onKeyDown={handleStartKeyDown}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="time-end" className="block text-sm font-medium text-slate-300 mb-2">
            End Time
          </label>
          <input
            ref={endRef}
            id="time-end"
            type="text"
            inputMode="text"
            placeholder="e.g. 3:30pm"
            value={endDisplay}
            onChange={(e) => setEndDraft(e.target.value)}
            onFocus={handleEndFocus}
            onBlur={() => commitEnd(endDraft)}
            onKeyDown={handleEndKeyDown}
            className={inputClasses}
          />
        </div>
      </div>

      {/* Duration presets + duration label */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {DURATION_PRESETS.map(({ label, minutes }) => (
            <button
              key={label}
              type="button"
              disabled={!startTime}
              onClick={() => handlePreset(minutes)}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-slate-600"
            >
              {label}
            </button>
          ))}
        </div>
        {duration && (
          <span className="text-xs text-cyan-400 font-medium">{duration}</span>
        )}
      </div>
    </div>
  );
}
