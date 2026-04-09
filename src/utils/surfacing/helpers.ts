/**
 * Surfacing Helpers — UI utilities for insight display.
 *
 * Icons, colors, descriptions, and insufficient data state.
 */

import type { InsufficientDataInfo } from './types';

// =============================================================================
// INSUFFICIENT DATA STATE
// =============================================================================

/**
 * Generate friendly message for insufficient data state.
 *
 * @param confidence - Current confidence (0-1)
 * @param sessionsCount - Number of sessions recorded
 */
export function getInsufficientDataInfo(
  confidence: number,
  sessionsCount: number = 0
): InsufficientDataInfo {
  // Map 0-0.5 confidence to 0-100% progress
  const progressPercent = Math.round(Math.min(confidence / 0.5, 1) * 100);

  const neededData: string[] = [];

  if (sessionsCount < 5) {
    neededData.push(`${5 - sessionsCount} more app sessions`);
  }

  if (confidence < 0.3) {
    neededData.push('More usage patterns to detect');
  }

  if (confidence < 0.4) {
    neededData.push('A few more days of data');
  }

  return {
    message: "I'm still learning your patterns...",
    progressPercent,
    neededData: neededData.length > 0 ? neededData : ['Continue using the app normally'],
  };
}

// =============================================================================
// INSIGHT ICONS
// =============================================================================

/**
 * Get icon name for insight type.
 */
export function getInsightIcon(insightType: string): string {
  const iconMap: Record<string, string> = {
    bill_due_soon: 'currency-dollar',
    bill_overdue: 'exclamation-circle',
    spending_high: 'trending-up',
    spending_low: 'trending-down',
    busy_day: 'calendar',
    conflict: 'exclamation-triangle',
    meal_gap: 'utensils',
    planning_time: 'clock',
    pattern_detected: 'lightbulb',
    spending_velocity_high: 'trending-up',
    budget_nearly_depleted: 'currency-dollar',
    savings_behind_pace: 'chart-bar',
    savings_milestone: 'star',
  };

  return iconMap[insightType] || 'information-circle';
}

/**
 * Get color class for insight priority.
 *
 * UX PRINCIPLE: NEVER use red for user data - red is reserved for system errors only.
 * Per ux-decisions.md: "No-Shame" design pattern uses amber/cyan for all states.
 * - Priority 1 (urgent): Cyan - draws attention without shame
 * - Priority 2 (high): Amber - warm attention-grabbing
 * - Priority 3 (medium): Cyan - standard actionable
 * - Priority 4-5 (low): Slate - subdued, informational
 */
export function getInsightColor(priority: number): string {
  switch (priority) {
    case 1:
      // CRITICAL: Use cyan, NOT red (No-Shame pattern)
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    case 2:
      return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 3:
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    case 4:
    case 5:
    default:
      return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  }
}
