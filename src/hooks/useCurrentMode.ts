/**
 * useCurrentMode - Planning vs Living Mode Detection
 *
 * Determines whether the user is in "Planning Mode" (comprehensive week planning)
 * or "Living Mode" (quick daily check-in).
 *
 * Detection priority (pull, don't push):
 * 0. Manual Override - User explicitly set the mode → Use that mode
 * 1. Session Duration Trigger - Current session > 10min with 3+ views → Planning
 * 2. Temporal Pattern Match - Today is detected planning day within ±2 hours → Planning
 * 3. Day-of-Week Heuristic - Sunday 5pm-10pm fallback → Planning
 * 4. Default - Everything else → Living
 *
 * Key principle: Default to Living Mode. User must explicitly choose Planning Mode.
 * The system suggests modes, it never forces them.
 *
 * This is detection only - consumers decide how to adjust behavior.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTemporalPatterns, usePatternConfidence } from './usePatterns';
import { useAppStore } from '@/stores/appStore';

// =============================================================================
// TYPES
// =============================================================================

export interface PlanningTime {
  day: number;  // 0-6 (Sunday-Saturday)
  hour: number; // 0-23
}

export interface CurrentModeResult {
  /** The current detected mode */
  mode: 'planning' | 'living';
  /** Convenience boolean for Planning Mode */
  isPlanningMode: boolean;
  /** Convenience boolean for Living Mode */
  isLivingMode: boolean;
  /** How confident we are in this detection (0-1) */
  confidence: number;
  /** Human-readable explanation of why this mode was chosen */
  reason: string;
  /** The learned planning time pattern (if any) */
  detectedPlanningTime: PlanningTime | null;
  /** Minutes until the next planning window opens (null if no pattern) */
  timeUntilPlanningWindow: number | null;
  /** For session tracking: register a view visit */
  registerViewVisit: (viewName: string) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Confidence scores for each detection method
const CONFIDENCE = {
  MANUAL_OVERRIDE: 1.0,        // User explicitly chose the mode (Priority 0)
  SESSION_DURATION: 0.9,       // User is clearly doing a planning session right now
  TEMPORAL_PATTERN_HIGH: 0.8,  // Pattern match with high pattern confidence
  TEMPORAL_PATTERN_LOW: 0.5,   // Pattern match with low pattern confidence
  DAY_HEURISTIC: 0.4,          // Sunday evening fallback
  DEFAULT_LIVING: 0.3,         // Default living mode
};

// Session thresholds for Planning Mode trigger
const SESSION_DURATION_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_VIEWS_THRESHOLD = 3;

// Temporal pattern match window (±2 hours)
const PATTERN_HOUR_TOLERANCE = 2;

// Default heuristic: Sunday 5pm-10pm
const DEFAULT_PLANNING_DAY = 0;   // Sunday
const DEFAULT_PLANNING_START = 17; // 5pm
const DEFAULT_PLANNING_END = 22;   // 10pm

// Session storage key for tracking current session
const SESSION_START_KEY = 'weekly-review-session-start';
const SESSION_VIEWS_KEY = 'weekly-review-session-views';

// =============================================================================
// SESSION TRACKING HELPERS
// =============================================================================

function getSessionStart(): number {
  try {
    const stored = sessionStorage.getItem(SESSION_START_KEY);
    if (stored) {
      return parseInt(stored, 10);
    }
    // Start new session
    const now = Date.now();
    sessionStorage.setItem(SESSION_START_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function getSessionViews(): Set<string> {
  try {
    const stored = sessionStorage.getItem(SESSION_VIEWS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function saveSessionViews(views: Set<string>): void {
  try {
    sessionStorage.setItem(SESSION_VIEWS_KEY, JSON.stringify([...views]));
  } catch {
    // Ignore storage errors
  }
}

// =============================================================================
// TIME CALCULATION HELPERS
// =============================================================================

/**
 * Check if current time is within ±tolerance hours of target hour.
 */
function isWithinHourWindow(currentHour: number, targetHour: number, tolerance: number): boolean {
  // Handle wrapping around midnight
  const diff = Math.abs(currentHour - targetHour);
  return diff <= tolerance || diff >= (24 - tolerance);
}

/**
 * Calculate minutes until the next planning window.
 * Returns null if no planning time is set.
 */
function calculateTimeUntilPlanningWindow(
  planningTime: PlanningTime | null,
  now: Date
): number | null {
  if (!planningTime) return null;

  const currentDay = now.getDay();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Calculate days until planning day
  let daysUntil = planningTime.day - currentDay;
  if (daysUntil < 0) {
    daysUntil += 7; // Wrap to next week
  }

  // If it's the planning day, check if we're before or after the window
  if (daysUntil === 0) {
    if (currentHour < planningTime.hour) {
      // Today, haven't reached the hour yet
      const hoursUntil = planningTime.hour - currentHour;
      return (hoursUntil * 60) - currentMinute;
    } else if (currentHour >= planningTime.hour && currentHour < planningTime.hour + PATTERN_HOUR_TOLERANCE * 2) {
      // We're in the window!
      return 0;
    } else {
      // Past the window, next week
      daysUntil = 7;
    }
  }

  // Calculate total minutes
  const daysInMinutes = daysUntil * 24 * 60;
  const hoursInMinutes = (planningTime.hour - currentHour) * 60;
  const minuteAdjustment = -currentMinute;

  return daysInMinutes + hoursInMinutes + minuteAdjustment;
}

/**
 * Get day name for human-readable reason.
 */
function getDayName(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day] || 'Unknown';
}

/**
 * Format hour for human-readable reason.
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useCurrentMode(): CurrentModeResult {
  // Get manual mode override from app store (Priority 0)
  // Default to 'living' if undefined (can happen with old localStorage data)
  const planningLivingMode = useAppStore((state) => state.planningLivingMode) ?? 'living';

  // Get pattern data from existing hooks (only used when mode is 'auto')
  const { data: temporalPatterns } = useTemporalPatterns();
  const { data: patternConfidence } = usePatternConfidence();

  // Session tracking state
  const sessionStartRef = useRef<number>(getSessionStart());
  const [sessionViews, setSessionViews] = useState<Set<string>>(() => getSessionViews());
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Update current time periodically for reactive mode detection
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Register a view visit (for session duration trigger)
  const registerViewVisit = useCallback((viewName: string) => {
    setSessionViews(prev => {
      const updated = new Set(prev);
      updated.add(viewName);
      saveSessionViews(updated);
      return updated;
    });
  }, []);

  // Extract detected planning time from patterns
  const detectedPlanningTime = useMemo((): PlanningTime | null => {
    if (!temporalPatterns?.planning_time) return null;
    return {
      day: temporalPatterns.planning_time.day,
      hour: temporalPatterns.planning_time.hour,
    };
  }, [temporalPatterns]);

  // Pattern confidence (how confident is the system in the detected planning time)
  const planningTimeConfidence = temporalPatterns?.planning_time?.confidence ?? 0;

  // Calculate mode and reasoning
  const modeResult = useMemo(() => {
    // Priority 0: Manual Override — pull, don't push
    // User explicitly chose the mode - respect their choice completely
    if (planningLivingMode === 'planning') {
      return {
        mode: 'planning' as const,
        confidence: CONFIDENCE.MANUAL_OVERRIDE,
        reason: 'Manual override: Planning Mode selected',
      };
    }
    if (planningLivingMode === 'living') {
      return {
        mode: 'living' as const,
        confidence: CONFIDENCE.MANUAL_OVERRIDE,
        reason: 'Manual override: Living Mode selected',
      };
    }

    // Auto-detection mode (planningLivingMode === 'auto')
    // Legacy behavior - only used if user explicitly enables auto-detection
    const now = currentTime;
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    // Session duration calculation
    const sessionDurationMs = Date.now() - sessionStartRef.current;
    const sessionViewCount = sessionViews.size;

    // Priority 1: Session Duration Trigger
    // Current session > 10 minutes AND 3+ views visited
    if (sessionDurationMs >= SESSION_DURATION_THRESHOLD_MS && sessionViewCount >= SESSION_VIEWS_THRESHOLD) {
      return {
        mode: 'planning' as const,
        confidence: CONFIDENCE.SESSION_DURATION,
        reason: `Active planning session detected: ${Math.round(sessionDurationMs / 60000)}min, ${sessionViewCount} views visited`,
      };
    }

    // Priority 2: Temporal Pattern Match
    // Is today the detected planning day within ±2 hours?
    if (detectedPlanningTime) {
      const isCorrectDay = dayOfWeek === detectedPlanningTime.day;
      const isWithinWindow = isWithinHourWindow(hour, detectedPlanningTime.hour, PATTERN_HOUR_TOLERANCE);

      if (isCorrectDay && isWithinWindow) {
        // Use high or low confidence based on pattern strength
        const confidence = planningTimeConfidence >= 0.6
          ? CONFIDENCE.TEMPORAL_PATTERN_HIGH
          : CONFIDENCE.TEMPORAL_PATTERN_LOW;

        return {
          mode: 'planning' as const,
          confidence,
          reason: `Detected planning time: ${getDayName(detectedPlanningTime.day)} around ${formatHour(detectedPlanningTime.hour)} (pattern confidence: ${Math.round(planningTimeConfidence * 100)}%)`,
        };
      }
    }

    // Priority 3: Day-of-Week Heuristic (Sunday 5pm-10pm fallback)
    // This works even before patterns are learned
    if (dayOfWeek === DEFAULT_PLANNING_DAY && hour >= DEFAULT_PLANNING_START && hour < DEFAULT_PLANNING_END) {
      return {
        mode: 'planning' as const,
        confidence: CONFIDENCE.DAY_HEURISTIC,
        reason: `Sunday evening (default planning time assumption)`,
      };
    }

    // Priority 4: Default Living Mode
    return {
      mode: 'living' as const,
      confidence: CONFIDENCE.DEFAULT_LIVING,
      reason: `Outside detected planning windows`,
    };
  }, [planningLivingMode, currentTime, sessionViews, detectedPlanningTime, planningTimeConfidence]);

  // Calculate time until next planning window
  const timeUntilPlanningWindow = useMemo(() => {
    // Use detected pattern if available, otherwise use default heuristic
    const planningTime = detectedPlanningTime ?? {
      day: DEFAULT_PLANNING_DAY,
      hour: DEFAULT_PLANNING_START,
    };
    return calculateTimeUntilPlanningWindow(planningTime, currentTime);
  }, [detectedPlanningTime, currentTime]);

  return {
    mode: modeResult.mode,
    isPlanningMode: modeResult.mode === 'planning',
    isLivingMode: modeResult.mode === 'living',
    confidence: modeResult.confidence,
    reason: modeResult.reason,
    detectedPlanningTime,
    timeUntilPlanningWindow,
    registerViewVisit,
  };
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Format time until planning window for display.
 */
export function formatTimeUntilPlanning(minutes: number | null): string {
  if (minutes === null) return 'Unknown';
  if (minutes === 0) return 'Now';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) { // Less than a day
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * Reset session tracking (for testing or manual reset).
 */
export function resetSessionTracking(): void {
  try {
    sessionStorage.removeItem(SESSION_START_KEY);
    sessionStorage.removeItem(SESSION_VIEWS_KEY);
  } catch {
    // Ignore storage errors
  }
}
