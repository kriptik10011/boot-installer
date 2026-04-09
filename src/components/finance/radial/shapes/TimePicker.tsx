/**
 * TimePicker — Composes WheelPicker with hour/minute/AM-PM columns.
 * Minutes in 5-minute steps. Follows card design system.
 * Pure props, cqi-responsive.
 */

import { WheelPicker, type WheelColumn } from './WheelPicker';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const AMPM = ['AM', 'PM'] as const;

interface TimePickerProps {
  hour: number;       // 1-12
  minute: number;     // 0-55 step 5
  ampm: 'AM' | 'PM';
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onAmpmChange: (v: 'AM' | 'PM') => void;
  accentColor?: string;
  className?: string;
}

export function TimePicker({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  ampm,
  onAmpmChange,
  accentColor,
  className,
}: TimePickerProps) {
  const columns: WheelColumn[] = [
    {
      values: HOURS,
      selectedIndex: Math.max(0, hour - 1),
      onChange: (i) => onHourChange(i + 1),
    },
    {
      values: MINUTES,
      selectedIndex: Math.max(0, Math.round(minute / 5)),
      onChange: (i) => onMinuteChange(i * 5),
    },
    {
      values: AMPM as unknown as string[],
      selectedIndex: ampm === 'AM' ? 0 : 1,
      onChange: (i) => onAmpmChange(i === 0 ? 'AM' : 'PM'),
      flex: 0.7,
    },
  ];

  return <WheelPicker columns={columns} accentColor={accentColor} className={className} />;
}
