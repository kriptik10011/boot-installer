/**
 * TimeSlider — Time range selector for the comprehensive dashboard.
 * Allows switching between week/month/quarter/year views.
 * Future: will connect to audit log for time-travel snapshots.
 */

import { useState, useCallback } from 'react';

type TimeRange = 'week' | 'month' | 'quarter' | 'year';

interface TimeSliderProps {
  onRangeChange: (range: TimeRange) => void;
}

const RANGES: Array<{ value: TimeRange; label: string; shortLabel: string }> = [
  { value: 'week', label: 'This Week', shortLabel: '1W' },
  { value: 'month', label: 'This Month', shortLabel: '1M' },
  { value: 'quarter', label: 'This Quarter', shortLabel: '3M' },
  { value: 'year', label: 'This Year', shortLabel: '1Y' },
];

export function TimeSlider({ onRangeChange }: TimeSliderProps) {
  const [activeRange, setActiveRange] = useState<TimeRange>('month');

  const handleSelect = useCallback(
    (range: TimeRange) => {
      setActiveRange(range);
      onRangeChange(range);
    },
    [onRangeChange]
  );

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'rgba(15, 23, 42, 0.6)' }}>
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => handleSelect(r.value)}
          className="px-3 py-1 text-xs font-medium rounded-md transition-all duration-200"
          style={{
            background: activeRange === r.value ? 'rgba(34, 211, 238, 0.15)' : 'transparent',
            color: activeRange === r.value ? '#22d3ee' : '#64748b',
            border: activeRange === r.value ? '1px solid rgba(34, 211, 238, 0.3)' : '1px solid transparent',
          }}
          title={r.label}
        >
          {r.shortLabel}
        </button>
      ))}
    </div>
  );
}
