/**
 * Date Utilities
 *
 * CRITICAL: All date formatting uses LOCAL timezone, not UTC.
 *
 * The previous bug used toISOString().split('T')[0] which returns UTC dates,
 * causing off-by-one-day errors depending on the user's timezone.
 *
 * These utilities use getFullYear(), getMonth(), getDate() which return
 * LOCAL date components, ensuring the app shows the correct day regardless
 * of timezone.
 */

/**
 * Format a Date object as ISO date string (YYYY-MM-DD) in LOCAL timezone.
 *
 * IMPORTANT: Do NOT use date.toISOString().split('T')[0] - that returns UTC!
 *
 * @example
 * // User in EST (UTC-5) at 7pm Saturday local time (which is midnight Sunday UTC)
 * formatDateLocal(new Date()) // Returns "2025-02-01" (Saturday, correct!)
 * date.toISOString().split('T')[0] // Would return "2025-02-02" (Sunday, WRONG!)
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date object at midnight LOCAL time.
 *
 * IMPORTANT: new Date("2025-02-01") parses as midnight UTC, which can be
 * the previous day in negative-offset timezones. This function creates
 * a date at midnight LOCAL time.
 *
 * @example
 * // In EST (UTC-5):
 * new Date("2025-02-01") // Creates Jan 31 7pm EST (midnight UTC)
 * parseDateLocal("2025-02-01") // Creates Feb 1 midnight EST (correct!)
 */
export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Get today's date as ISO string (YYYY-MM-DD) in LOCAL timezone.
 */
export function getTodayLocal(): string {
  return formatDateLocal(new Date());
}

/**
 * Get the Monday of the week containing the given date.
 * Returns ISO date string (YYYY-MM-DD) in LOCAL timezone.
 *
 * @param date - Date to get week start for (defaults to today)
 */
export function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  // Set to midnight local time to avoid any time-based edge cases
  d.setHours(0, 0, 0, 0);

  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Calculate days to subtract to get to Monday
  // If Sunday (0), go back 6 days
  // If Monday (1), go back 0 days
  // If Tuesday (2), go back 1 day, etc.
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  d.setDate(d.getDate() - daysToSubtract);

  return formatDateLocal(d);
}

/**
 * Add (or subtract) weeks from a date string.
 * Returns ISO date string (YYYY-MM-DD) in LOCAL timezone.
 *
 * @param dateStr - Starting date in YYYY-MM-DD format
 * @param weeks - Number of weeks to add (negative to subtract)
 */
export function addWeeks(dateStr: string, weeks: number): string {
  const date = parseDateLocal(dateStr);
  date.setDate(date.getDate() + weeks * 7);
  return formatDateLocal(date);
}

/**
 * Add (or subtract) days from a date string.
 * Returns ISO date string (YYYY-MM-DD) in LOCAL timezone.
 *
 * @param dateStr - Starting date in YYYY-MM-DD format
 * @param days - Number of days to add (negative to subtract)
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseDateLocal(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateLocal(date);
}

/**
 * Get array of date strings for a week starting from the given Monday.
 * Returns 7 ISO date strings (YYYY-MM-DD) in LOCAL timezone.
 *
 * @param weekStart - Monday date string in YYYY-MM-DD format
 */
export function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = parseDateLocal(weekStart);

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    dates.push(formatDateLocal(date));
  }

  return dates;
}

/**
 * Check if two date strings represent the same day.
 * Compares the string values directly (both should be YYYY-MM-DD format).
 */
export function isSameDay(dateStr1: string, dateStr2: string): boolean {
  return dateStr1 === dateStr2;
}

/**
 * Check if dateStr1 is before dateStr2.
 * Works with YYYY-MM-DD format strings (lexicographic comparison is valid).
 */
export function isBefore(dateStr1: string, dateStr2: string): boolean {
  return dateStr1 < dateStr2;
}

/**
 * Check if dateStr1 is after dateStr2.
 * Works with YYYY-MM-DD format strings (lexicographic comparison is valid).
 */
export function isAfter(dateStr1: string, dateStr2: string): boolean {
  return dateStr1 > dateStr2;
}

/**
 * Get day name from a date string.
 *
 * @param dateStr - Date in YYYY-MM-DD format
 * @param format - 'long' for full name, 'short' for 3-letter abbreviation
 */
export function getDayName(dateStr: string, format: 'long' | 'short' = 'long'): string {
  const date = parseDateLocal(dateStr);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return format === 'long' ? dayNames[date.getDay()] : shortNames[date.getDay()];
}

/**
 * Get the day of month (1-31) from a date string.
 */
export function getDayOfMonth(dateStr: string): number {
  const date = parseDateLocal(dateStr);
  return date.getDate();
}

/**
 * Get the day of week (0-6, Sunday = 0) from a date string.
 */
export function getDayOfWeek(dateStr: string): number {
  const date = parseDateLocal(dateStr);
  return date.getDay();
}
