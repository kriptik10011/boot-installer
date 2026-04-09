/**
 * LayoutD Helpers — pure utility functions for time and duration formatting.
 */

import type { MealType } from '@/types';

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function formatTimeShort(time: string): string {
  const [hours] = time.split(':');
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 || 12;
  return `${hour12}${suffix}`;
}

export function getDuration(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function isTimePast(time: string, current: Date): boolean {
  const [h, m] = time.split(':').map(Number);
  return h < current.getHours() || (h === current.getHours() && m <= current.getMinutes());
}

export function isTimeCurrent(start: string, end: string, current: Date): boolean {
  const nowMins = current.getHours() * 60 + current.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export type MealTimeStatus = 'past' | 'current' | 'next' | 'later';

export function getMealTimeStatus(mealType: MealType, isToday: boolean, currentTime: Date): MealTimeStatus {
  if (!isToday) return 'later';

  const hour = currentTime.getHours();

  if (mealType === 'breakfast') {
    if (hour < 5) return 'later';
    if (hour < 11) return 'current';
    return 'past';
  }
  if (mealType === 'lunch') {
    if (hour < 11) return 'next';
    if (hour < 15) return 'current';
    return 'past';
  }
  if (mealType === 'dinner') {
    if (hour < 15) return 'later';
    if (hour < 17) return 'next';
    if (hour < 22) return 'current';
    return 'past';
  }
  return 'later';
}
