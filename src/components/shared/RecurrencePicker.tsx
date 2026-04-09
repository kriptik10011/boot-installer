import { useCallback } from 'react';
import type { RecurrenceFrequency, RecurrenceEndType, RecurrenceRuleCreate } from '@/types';

interface RecurrencePickerProps {
  value: RecurrenceRuleCreate | null;
  onChange: (rule: RecurrenceRuleCreate | null) => void;
  showBillFrequencies?: boolean;
}

const BASE_FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const END_OPTIONS: { value: RecurrenceEndType; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'count', label: 'After' },
  { value: 'date', label: 'On date' },
];

function frequencyLabel(freq: RecurrenceFrequency): string {
  switch (freq) {
    case 'daily': return 'day(s)';
    case 'weekly': return 'week(s)';
    case 'monthly': return 'month(s)';
    case 'yearly': return 'year(s)';
  }
}

function defaultRule(): RecurrenceRuleCreate {
  const today = new Date();
  return {
    frequency: 'weekly',
    interval: 1,
    day_of_week: today.getDay(),
    day_of_month: null,
    end_type: 'never',
    end_count: null,
    end_date: null,
  };
}

export function RecurrencePicker({ value, onChange, showBillFrequencies = false }: RecurrencePickerProps) {
  const isEnabled = value !== null;

  const handleToggle = useCallback(() => {
    if (isEnabled) {
      onChange(null);
    } else {
      onChange(defaultRule());
    }
  }, [isEnabled, onChange]);

  const updateField = useCallback(<K extends keyof RecurrenceRuleCreate>(
    field: K,
    fieldValue: RecurrenceRuleCreate[K]
  ) => {
    if (!value) return;
    onChange({ ...value, [field]: fieldValue });
  }, [value, onChange]);

  const handleFrequencyChange = useCallback((freq: RecurrenceFrequency) => {
    if (!value) return;
    const today = new Date();
    const updated: RecurrenceRuleCreate = {
      ...value,
      frequency: freq,
      interval: 1,
      day_of_week: freq === 'weekly' ? today.getDay() : null,
      day_of_month: freq === 'monthly' ? today.getDate() : null,
    };
    onChange(updated);
  }, [value, onChange]);

  const handleEndTypeChange = useCallback((endType: RecurrenceEndType) => {
    if (!value) return;
    let endDate: string | null = null;
    if (endType === 'date') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 30);
      endDate = tomorrow.toISOString().split('T')[0];
    }
    onChange({
      ...value,
      end_type: endType,
      end_count: endType === 'count' ? 10 : null,
      end_date: endDate,
    });
  }, [value, onChange]);

  // Build frequency list — add bill-specific intervals as separate chips
  const frequencies = showBillFrequencies
    ? [
        ...BASE_FREQUENCIES.slice(0, 2),
        { value: 'weekly' as RecurrenceFrequency, label: 'Biweekly' },
        ...BASE_FREQUENCIES.slice(2),
        { value: 'monthly' as RecurrenceFrequency, label: 'Quarterly' },
      ]
    : BASE_FREQUENCIES;

  // Determine if current value matches a bill-specific frequency
  const isBiweekly = value?.frequency === 'weekly' && value?.interval === 2;
  const isQuarterly = value?.frequency === 'monthly' && value?.interval === 3;

  const handleBillFrequencyChip = useCallback((label: string) => {
    if (!value) return;
    if (label === 'Biweekly') {
      onChange({ ...value, frequency: 'weekly', interval: 2, day_of_week: new Date().getDay(), day_of_month: null });
    } else if (label === 'Quarterly') {
      onChange({ ...value, frequency: 'monthly', interval: 3, day_of_week: null, day_of_month: new Date().getDate() });
    }
  }, [value, onChange]);

  const isChipActive = (freq: RecurrenceFrequency, label: string): boolean => {
    if (!value) return false;
    if (label === 'Biweekly') return isBiweekly;
    if (label === 'Quarterly') return isQuarterly;
    if (showBillFrequencies && label === 'Weekly' && isBiweekly) return false;
    if (showBillFrequencies && label === 'Monthly' && isQuarterly) return false;
    return value.frequency === freq && !isBiweekly && !isQuarterly;
  };

  return (
    <div className="space-y-3">
      {/* Toggle Row */}
      <div className="flex items-center justify-between">
        <label htmlFor="recurrence-toggle" className="text-sm font-medium text-slate-300">
          Repeats
        </label>
        <button
          id="recurrence-toggle"
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isEnabled ? 'bg-cyan-500' : 'bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {isEnabled && value && (
        <div className="space-y-3 pl-0">
          {/* Frequency Chips */}
          <div role="radiogroup" aria-label="Recurrence frequency">
            <div className="flex flex-wrap gap-2">
              {frequencies.map(({ value: freq, label }) => {
                const active = isChipActive(freq, label);
                const chipId = `freq-${label.toLowerCase()}`;
                return (
                  <button
                    key={label}
                    id={chipId}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      if (label === 'Biweekly' || label === 'Quarterly') {
                        handleBillFrequencyChip(label);
                      } else {
                        handleFrequencyChange(freq);
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interval — hide for biweekly/quarterly since they encode interval */}
          {!isBiweekly && !isQuarterly && (
            <div className="flex items-center gap-2">
              <label htmlFor="recurrence-interval" className="text-sm text-slate-400">
                Every
              </label>
              <input
                id="recurrence-interval"
                type="number"
                min={1}
                max={365}
                value={value.interval ?? 1}
                onChange={(e) => updateField('interval', Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm text-center focus:outline-none focus:border-cyan-500"
              />
              <span className="text-sm text-slate-400">{frequencyLabel(value.frequency)}</span>
            </div>
          )}

          {/* Day of Week (weekly) */}
          {value.frequency === 'weekly' && !isBiweekly && (
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">On</label>
              <div role="radiogroup" aria-label="Day of week" className="flex gap-1.5">
                {DAY_LABELS.map((day, idx) => (
                  <button
                    key={day}
                    type="button"
                    role="radio"
                    aria-checked={value.day_of_week === idx}
                    aria-label={day}
                    onClick={() => updateField('day_of_week', idx)}
                    className={`w-9 h-9 text-xs rounded-full border transition-colors ${
                      value.day_of_week === idx
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day of Month (monthly) */}
          {value.frequency === 'monthly' && !isQuarterly && (
            <div className="flex items-center gap-2">
              <label htmlFor="recurrence-day-of-month" className="text-sm text-slate-400">
                On day
              </label>
              <input
                id="recurrence-day-of-month"
                type="number"
                min={1}
                max={31}
                value={value.day_of_month ?? 1}
                onChange={(e) => updateField('day_of_month', Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-16 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm text-center focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* End Condition */}
          <div className="space-y-2">
            <label className="block text-sm text-slate-400">Ends</label>
            <div className="flex gap-2">
              {END_OPTIONS.map(({ value: endVal, label }) => (
                <button
                  key={endVal}
                  type="button"
                  onClick={() => handleEndTypeChange(endVal)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    value.end_type === endVal
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Count input */}
            {value.end_type === 'count' && (
              <div className="flex items-center gap-2">
                <input
                  id="recurrence-end-count"
                  type="number"
                  min={1}
                  max={1000}
                  value={value.end_count ?? 10}
                  onChange={(e) => updateField('end_count', Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm text-center focus:outline-none focus:border-cyan-500"
                />
                <label htmlFor="recurrence-end-count" className="text-sm text-slate-400">
                  times
                </label>
              </div>
            )}

            {/* Date input */}
            {value.end_type === 'date' && (
              <input
                id="recurrence-end-date"
                type="date"
                aria-label="End date"
                value={value.end_date ?? ''}
                onChange={(e) => updateField('end_date', e.target.value || null)}
                className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
