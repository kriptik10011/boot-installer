/** Shared formatting utilities extracted from radial cards for cross-view use. */

export function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

/** Category colors — 8-color palette. Slice to 6 for compact displays. */
export const CATEGORY_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#22d3ee', '#10b981', '#d97706', '#a78bfa', '#fbbf24',
] as const;

/** Budget utilization bar color: emerald < 75%, amber 75-100%, amber > 100% (never red). */
export function budgetBarColor(pctUsed: number): string {
  if (pctUsed > 100) return '#d97706';
  if (pctUsed > 75) return '#f59e0b';
  return '#34d399';
}

/** Days from today to a due date string (YYYY-MM-DD). Uses floor (0 = due today). */
export function daysUntilDue(dueDateStr: string): number {
  const todayMs = new Date(new Date().toISOString().split('T')[0]).getTime();
  const dueMs = new Date(dueDateStr.split('T')[0]).getTime();
  return Math.floor((dueMs - todayMs) / (1000 * 60 * 60 * 24));
}
