/**
 * Interruption Calculus — Core surfacing decision engine.
 *
 * Implements: Score = (Confidence x Benefit) - Annoyance Cost
 * With context gates checked FIRST (Gating beats Guessing).
 *
 * Also includes the Escalation Ladder:
 * - Ambient: Badge, subtle color shift, status indicator (lowest interruption)
 * - Passive Card: Visible only when app is opened
 * - Notification: Only for critical bills (the single exception)
 */

import type { Insight } from '@/api/client';
import type { SurfacingDecision, SurfacingContext, DismissalRecord, EscalationLevel } from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

// Priority to benefit mapping
const PRIORITY_BENEFIT: Record<number, number> = {
  1: 1.0, // Critical - highest benefit
  2: 0.8, // High
  3: 0.5, // Medium
  4: 0.3, // Low
  5: 0.1, // Minimal
};

// Annoyance cost per dismissal (increases with each dismissal)
const BASE_ANNOYANCE_COST = 0.1;
const DISMISSAL_MULTIPLIER = 0.15;

// Threshold for showing insights
const SURFACING_THRESHOLD = 0.3;

// Decay periods for dismissals
const DISMISSAL_DECAY_PERMANENT = 30 * 24 * 60 * 60 * 1000; // 30 days for "don't ask again"
const DISMISSAL_DECAY_REGULAR = 24 * 60 * 60 * 1000;        // 1 day for regular dismissal

// =============================================================================
// DISMISSAL HELPERS (internal to calculus)
// =============================================================================

/**
 * Get the decay period for a dismissal record.
 * - Permanent dismissals: 30 days
 * - Regular dismissals: 1 day (to prevent "whack-a-mole" with persistent insights)
 */
function getDecayPeriod(record: DismissalRecord): number {
  return record.permanent ? DISMISSAL_DECAY_PERMANENT : DISMISSAL_DECAY_REGULAR;
}

/**
 * Check if a dismissal is still active (not yet decayed).
 */
function isDismissalActive(record: DismissalRecord): boolean {
  const timeSinceDismissal = Date.now() - new Date(record.lastDismissed).getTime();
  return timeSinceDismissal < getDecayPeriod(record);
}

// =============================================================================
// ESCALATION LADDER
// =============================================================================

/**
 * Escalation level mapping for all insight types.
 *
 * From the Intelligence Boundary Analysis:
 * - Day health coloring -> Ambient (always visible, no interruption)
 * - Spending alert -> Passive Card (shows when app opened)
 * - Bill due tomorrow -> Notification (only allowed push)
 * - Conflict detected -> Passive Card (not urgent enough for push)
 * - Anomaly flagged -> Ambient (color shift, not alert)
 * - Planning time -> Passive Card (informational)
 * - Pattern detected -> Ambient (subtle indicator)
 * - Busy week -> Passive Card (needs attention)
 * - Meal gap -> Ambient (low urgency)
 */
const INSIGHT_ESCALATION_MAP: Record<string, EscalationLevel> = {
  // Notification tier (only truly urgent items)
  bill_due_soon: 'notification', // Only when priority 1 (due within 24h)
  bill_overdue: 'notification',

  // Passive tier (shown as cards when app opened)
  spending_high: 'passive',
  spending_low: 'passive',
  busy_day: 'passive',
  busy_week: 'passive',
  conflict: 'passive',
  conflicts: 'passive',
  bills_due: 'passive',
  planning_time: 'passive',

  // V2 Financial intelligence
  spending_velocity_high: 'passive',
  budget_nearly_depleted: 'passive',
  savings_behind_pace: 'passive',
  savings_milestone: 'passive',

  // Ambient tier (subtle visual indicators)
  day_health: 'ambient',
  anomaly: 'ambient',
  anomaly_flagged: 'ambient',
  pattern_detected: 'ambient',
  meal_gap: 'ambient',
  insufficient_data: 'ambient',
};

/**
 * Determine the appropriate escalation level for an insight.
 *
 * Escalation Ladder (from Intelligence Principles):
 * 1. Ambient - Badge, subtle color shift, status indicator (lowest interruption)
 * 2. Passive Card - Visible only when app is opened
 * 3. Notification - Only for critical bills (the single exception)
 *
 * The mapping considers:
 * - Insight type (some types are inherently more/less urgent)
 * - Priority (1 = critical can escalate)
 * - Confidence (high confidence enables higher escalation)
 */
export function getEscalationLevel(
  insight: Insight,
  overallConfidence: number
): EscalationLevel {
  // Look up the default escalation for this insight type
  const defaultLevel = INSIGHT_ESCALATION_MAP[insight.type] ?? 'ambient';

  // Special case: bills due soon only get notification if priority 1 (within 24h)
  if (insight.type === 'bill_due_soon' || insight.type === 'bill_overdue') {
    if (insight.priority === 1) {
      return 'notification';
    }
    // Lower priority bills are passive cards, not notifications
    return 'passive';
  }

  // If the default is notification, keep it
  if (defaultLevel === 'notification') {
    return 'notification';
  }

  // Escalate ambient -> passive if high priority AND high confidence
  if (defaultLevel === 'ambient' && insight.priority <= 2 && overallConfidence >= 0.7) {
    return 'passive';
  }

  // Demote passive -> ambient if confidence is too low
  if (defaultLevel === 'passive' && overallConfidence < 0.5) {
    return 'ambient';
  }

  return defaultLevel;
}

/**
 * Get human-readable description of escalation level.
 */
export function getEscalationDescription(level: EscalationLevel): string {
  switch (level) {
    case 'ambient':
      return 'Subtle indicator (badge, color shift)';
    case 'passive':
      return 'Card shown when app opened';
    case 'notification':
      return 'Push notification allowed';
    default:
      return 'Unknown';
  }
}

// =============================================================================
// INTERRUPTION CALCULUS
// =============================================================================

/**
 * Determines whether an insight should be surfaced to the user.
 *
 * IMPORTANT: This function now enforces CONTEXT GATES FIRST.
 * Gates are binary - if ANY gate fails, the insight is NOT shown,
 * regardless of confidence score. "Gating beats Guessing."
 *
 * After gates pass, applies the Interruption Calculus:
 * Score = (Confidence x Benefit) - Annoyance Cost
 *
 * @param insight - The insight to evaluate
 * @param overallConfidence - System's overall pattern confidence (0-1)
 * @param dismissals - Record of previously dismissed insight types
 * @param context - Optional surfacing context (gates)
 * @returns SurfacingDecision with shouldShow, reason, score, and failedGates
 */
export function shouldSurfaceInsight(
  insight: Insight,
  overallConfidence: number,
  dismissals: DismissalRecord[],
  context?: SurfacingContext
): SurfacingDecision {
  const failedGates: string[] = [];

  // Determine if this insight is urgent (priority 1 = critical)
  const isUrgent = context?.isUrgent ?? insight.priority === 1;

  // Get escalation level early (needed for decision)
  const escalationLevel = getEscalationLevel(insight, overallConfidence);

  // ==========================================================================
  // CONTEXT GATES (checked FIRST, before any scoring)
  // These are hard gates - if they fail, insight is NOT shown
  // ==========================================================================

  // Gate 1: DND/Focus Mode (only urgent overrides)
  if (context?.isDndMode && !isUrgent) {
    failedGates.push('DND mode is active');
  }

  // Gate 2: Mid-Task Detection (only urgent overrides)
  // User appears to be actively working if activity in last 30s
  if (context?.isMidTask && !isUrgent) {
    failedGates.push('User appears mid-task');
  }

  // Gate 3: Idle Check - If user is idle, they may have left
  // Only apply to ambient/passive, notifications can interrupt
  if (context?.lastActivityTimestamp && escalationLevel !== 'notification') {
    const timeSinceActivity = Date.now() - context.lastActivityTimestamp;

    // If idle for too long (> 5 minutes), defer non-urgent insights
    if (timeSinceActivity > 5 * 60 * 1000 && !isUrgent) {
      failedGates.push('User idle too long - deferring insight');
    }
  }

  // Gate 4: Mode-based filtering (Living Mode = critical only)
  // Non-urgent insights in Living Mode must be priority 1-2
  if (context?.isPlanningMode === false && insight.priority > 2 && !isUrgent) {
    failedGates.push('Living Mode - only critical insights shown');
  }

  // If ANY gate failed, return early (no score calculation needed)
  if (failedGates.length > 0) {
    return {
      shouldShow: false,
      reason: `Gate(s) failed: ${failedGates.join(', ')}`,
      score: 0,
      escalationLevel,
      failedGates,
    };
  }

  // ==========================================================================
  // INTERRUPTION CALCULUS (only if gates pass)
  // ==========================================================================

  // Get benefit from priority (default to medium if unknown)
  const benefit = PRIORITY_BENEFIT[insight.priority] ?? 0.5;

  // Calculate annoyance cost based on dismissals
  const dismissalRecord = dismissals.find((d) => d.insightType === insight.type);
  let annoyanceCost = BASE_ANNOYANCE_COST;

  if (dismissalRecord && isDismissalActive(dismissalRecord)) {
    // Dismissal is still active - add to annoyance cost
    annoyanceCost += dismissalRecord.count * DISMISSAL_MULTIPLIER;
  }

  // Calculate final score
  // Use both insight's confidence AND overall system confidence
  const combinedConfidence = (insight.confidence + overallConfidence) / 2;
  const score = combinedConfidence * benefit - annoyanceCost;

  // Decision logic
  if (overallConfidence < 0.5) {
    return {
      shouldShow: false,
      reason: 'System confidence too low (still learning patterns)',
      score,
      escalationLevel,
      failedGates,
    };
  }

  // Any active dismissal suppresses the insight until decay
  // This fixes the bug where dismissed insights reappear after refresh
  if (dismissalRecord && isDismissalActive(dismissalRecord)) {
    const timeSinceDismissal = Date.now() - new Date(dismissalRecord.lastDismissed).getTime();
    const decayPeriod = getDecayPeriod(dismissalRecord);
    const hoursRemaining = Math.ceil((decayPeriod - timeSinceDismissal) / (60 * 60 * 1000));
    const timeRemaining = hoursRemaining >= 24
      ? `${Math.ceil(hoursRemaining / 24)} day${Math.ceil(hoursRemaining / 24) > 1 ? 's' : ''}`
      : `${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}`;

    return {
      shouldShow: false,
      reason: `Dismissed (returns in ${timeRemaining})`,
      score,
      escalationLevel,
      failedGates,
    };
  }

  if (score < SURFACING_THRESHOLD) {
    return {
      shouldShow: false,
      reason: `Score too low: ${score.toFixed(2)} < ${SURFACING_THRESHOLD}`,
      score,
      escalationLevel,
      failedGates,
    };
  }

  return {
    shouldShow: true,
    reason: `Score ${score.toFixed(2)} passes threshold`,
    score,
    escalationLevel,
    failedGates,
  };
}

// =============================================================================
// DEPRECATED — kept for debug panel backward compat
// =============================================================================

