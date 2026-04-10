/**
 * useActivityTracking Hook
 *
 * Tracks user activity for interruptibility detection using Fogarty signals.
 * Used by the intelligence layer to determine when to surface insights.
 *
 * Fogarty Signals (from research):
 * - Mouse velocity/hovering (still = available)
 * - Keyboard bursts (typing = busy)
 * - Inter-keystroke intervals (<100ms = flow state)
 * - 30-second debouncer threshold for idle detection
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type InterruptibilityReason =
  | 'idle'           // 30s+ of no activity - definitely interruptible
  | 'low_activity'   // Some recent activity but not intense
  | 'typing_burst'   // Active typing (<300ms intervals)
  | 'flow_state';    // Intense typing (<100ms intervals) - DO NOT interrupt

export interface InterruptibilityState {
  /** Whether it's safe to show new insights */
  isInterruptible: boolean;
  /** Confidence in the interruptibility assessment (0-1) */
  confidence: number;
  /** Why we determined this interruptibility state */
  reason: InterruptibilityReason;
}

export interface ActivityState {
  /** Milliseconds since last user activity */
  idleMs: number;
  /** Whether user is currently active (activity in last 30s) */
  isActive: boolean;
  /** Timestamp of last activity */
  lastActivity: number;
  /** Whether user appears mid-task (within 30s activity window) */
  isMidTask: boolean;
  /** Current interruptibility assessment */
  interruptibility: InterruptibilityState;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Threshold for considering user idle (30 seconds per Fogarty research) */
const IDLE_THRESHOLD_MS = 30_000;

/** Time window for keystroke analysis (5 seconds) */
const KEYSTROKE_WINDOW_MS = 5_000;

/** Maximum keystrokes to track for interval analysis */
const MAX_KEYSTROKE_BUFFER = 20;

/** Flow state threshold - average interval below this = don't interrupt */
const FLOW_STATE_INTERVAL_MS = 100;

/** Typing burst threshold - average interval below this = busy */
const TYPING_BURST_INTERVAL_MS = 300;

/** Update interval for idle time calculation */
const UPDATE_INTERVAL_MS = 1_000;

// =============================================================================
// HOOK
// =============================================================================

export function useActivityTracking(): ActivityState {
  const [idleMs, setIdleMs] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isMidTask, setIsMidTask] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const keystrokeTimesRef = useRef<number[]>([]);
  const midTaskTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate interruptibility based on current state
  const calculateInterruptibility = useCallback((): InterruptibilityState => {
    const now = Date.now();
    const idle = now - lastActivityRef.current;

    // 30s idle = definitely interruptible (per Fogarty research)
    if (idle > IDLE_THRESHOLD_MS) {
      return {
        isInterruptible: true,
        confidence: 1.0,
        reason: 'idle',
      };
    }

    // Analyze keystroke intervals for flow state detection
    const recentKeystrokes = keystrokeTimesRef.current.filter(
      (t) => now - t < KEYSTROKE_WINDOW_MS
    );

    if (recentKeystrokes.length >= 5) {
      // Calculate average interval between keystrokes
      const intervals: number[] = [];
      for (let i = 1; i < recentKeystrokes.length; i++) {
        intervals.push(recentKeystrokes[i] - recentKeystrokes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // <100ms average interval = flow state, DO NOT interrupt
      if (avgInterval < FLOW_STATE_INTERVAL_MS) {
        return {
          isInterruptible: false,
          confidence: 0.9,
          reason: 'flow_state',
        };
      }

      // <300ms average interval = typing burst, probably busy
      if (avgInterval < TYPING_BURST_INTERVAL_MS) {
        return {
          isInterruptible: false,
          confidence: 0.7,
          reason: 'typing_burst',
        };
      }
    }

    // Low activity - some recent activity but not intense typing
    // Can interrupt but with lower confidence
    return {
      isInterruptible: true,
      confidence: 0.6,
      reason: 'low_activity',
    };
  }, []);

  // Memoize interruptibility calculation
  const [interruptibility, setInterruptibility] = useState<InterruptibilityState>(
    () => calculateInterruptibility()
  );

  // Handle activity events
  useEffect(() => {
    const handleActivity = (event: Event) => {
      const now = Date.now();
      lastActivityRef.current = now;
      setIsActive(true);
      setIsMidTask(true);

      // Track keystrokes for flow state detection
      if (event.type === 'keydown') {
        keystrokeTimesRef.current.push(now);
        // Keep buffer bounded
        if (keystrokeTimesRef.current.length > MAX_KEYSTROKE_BUFFER) {
          keystrokeTimesRef.current = keystrokeTimesRef.current.slice(-MAX_KEYSTROKE_BUFFER);
        }
      }

      // Clear mid-task flag after timeout
      if (midTaskTimeoutRef.current) {
        clearTimeout(midTaskTimeoutRef.current);
      }
      midTaskTimeoutRef.current = setTimeout(() => {
        setIsMidTask(false);
      }, IDLE_THRESHOLD_MS);

      // Update interruptibility on activity
      setInterruptibility(calculateInterruptibility());
    };

    // Track various user activities
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) =>
      window.addEventListener(event, handleActivity, { passive: true })
    );

    // Update idle time periodically
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      setIdleMs(idle);

      // Update isActive based on threshold
      if (idle > IDLE_THRESHOLD_MS) {
        setIsActive(false);
      }

      // Prune old keystrokes
      const now = Date.now();
      keystrokeTimesRef.current = keystrokeTimesRef.current.filter(
        (t) => now - t < KEYSTROKE_WINDOW_MS * 2
      );

      // Recalculate interruptibility
      setInterruptibility(calculateInterruptibility());
    }, UPDATE_INTERVAL_MS);

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      clearInterval(interval);
      if (midTaskTimeoutRef.current) {
        clearTimeout(midTaskTimeoutRef.current);
      }
    };
  }, [calculateInterruptibility]);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      idleMs,
      isActive,
      lastActivity: lastActivityRef.current,
      isMidTask,
      interruptibility,
    }),
    [idleMs, isActive, isMidTask, interruptibility]
  );
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if it's a good moment to show an insight based on activity state.
 * Combines interruptibility with additional heuristics.
 */
export function isGoodMomentToSurface(activity: ActivityState): boolean {
  // If not interruptible, don't surface
  if (!activity.interruptibility.isInterruptible) {
    return false;
  }

  // If idle for 30s+, it's a great moment
  if (activity.idleMs >= IDLE_THRESHOLD_MS) {
    return true;
  }

  // If interruptible but low confidence, only surface if not mid-task
  if (activity.interruptibility.confidence < 0.7) {
    return !activity.isMidTask;
  }

  return true;
}

/**
 * Get a human-readable description of why we can/can't interrupt.
 * Useful for debug panel.
 */
export function getInterruptibilityDescription(state: InterruptibilityState): string {
  switch (state.reason) {
    case 'idle':
      return 'User idle (30s+) - safe to show insights';
    case 'low_activity':
      return 'Low activity - can show important insights';
    case 'typing_burst':
      return 'Active typing - deferring non-urgent insights';
    case 'flow_state':
      return 'Flow state detected - do not interrupt';
    default:
      return 'Unknown state';
  }
}
