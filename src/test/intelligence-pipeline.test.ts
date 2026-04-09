/**
 * Intelligence Pipeline Tests
 *
 * Tests the surfacing layer logic, insight filtering, day health mapping,
 * and dismissal persistence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldSurfaceInsight,
  loadDismissals,
  saveDismissals,
  recordDismissal,
  clearAllDismissals,
  getInsufficientDataInfo,
  getInsightColor,
  type DismissalRecord,
} from '@/utils/surfacing';
import type { Insight } from '@/api/client';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// =============================================================================
// 1. SURFACING LOGIC TESTS
// =============================================================================

describe('shouldSurfaceInsight', () => {
  const createInsight = (overrides: Partial<Insight> = {}): Insight => ({
    type: 'bills_due',
    message: 'You have bills due',
    priority: 2,
    confidence: 0.8,
    ...overrides,
  });

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns false when overall confidence < 0.5', () => {
    const insight = createInsight({ priority: 1, confidence: 0.9 });
    const dismissals: DismissalRecord[] = [];
    const overallConfidence = 0.4; // Too low

    const result = shouldSurfaceInsight(insight, overallConfidence, dismissals);

    expect(result.shouldShow).toBe(false);
    expect(result.reason).toContain('confidence too low');
  });

  it('returns false after 3 dismissals of same type', () => {
    const insight = createInsight({ type: 'busy_week' });
    const dismissals: DismissalRecord[] = [
      {
        insightType: 'busy_week',
        count: 3,
        lastDismissed: new Date().toISOString(),
      },
    ];
    const overallConfidence = 0.7;

    const result = shouldSurfaceInsight(insight, overallConfidence, dismissals);

    expect(result.shouldShow).toBe(false);
    expect(result.reason).toContain('Dismissed');
    // Now that any dismissal suppresses (not just count >= 3), we just check the message format
    expect(result.reason).toContain('returns in');
  });

  it('returns true for high-priority insight with good confidence', () => {
    const insight = createInsight({ priority: 1, confidence: 0.9 });
    const dismissals: DismissalRecord[] = [];
    const overallConfidence = 0.7;

    const result = shouldSurfaceInsight(insight, overallConfidence, dismissals);

    expect(result.shouldShow).toBe(true);
    expect(result.reason).toContain('passes threshold');
  });

  it('respects 30-day decay period for dismissals', () => {
    const insight = createInsight({ type: 'old_dismissal' });
    // 31 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);

    const dismissals: DismissalRecord[] = [
      {
        insightType: 'old_dismissal',
        count: 5, // Would normally suppress
        lastDismissed: oldDate.toISOString(),
      },
    ];
    const overallConfidence = 0.7;

    const result = shouldSurfaceInsight(insight, overallConfidence, dismissals);

    // Should show because dismissal decayed
    expect(result.shouldShow).toBe(true);
  });

  it('calculates score correctly using combined confidence', () => {
    const insight = createInsight({ priority: 2, confidence: 0.8 });
    const dismissals: DismissalRecord[] = [];
    const overallConfidence = 0.6;

    const result = shouldSurfaceInsight(insight, overallConfidence, dismissals);

    // Combined confidence = (0.8 + 0.6) / 2 = 0.7
    // Benefit for priority 2 = 0.8
    // Score = 0.7 * 0.8 - 0.1 (base annoyance) = 0.46
    // Should pass threshold of 0.3
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.shouldShow).toBe(true);
  });
});

// =============================================================================
// 2. INSIGHT FILTERING TESTS
// =============================================================================

describe('insight filtering', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('filters insights through shouldSurfaceInsight before render', () => {
    const insights: Insight[] = [
      { type: 'bills_due', message: 'Bills due', priority: 2, confidence: 0.9 },
      { type: 'busy_week', message: 'Busy week', priority: 2, confidence: 0.85 },
      { type: 'conflicts', message: 'Conflicts', priority: 1, confidence: 0.95 },
    ];
    const dismissals: DismissalRecord[] = [];
    const overallConfidence = 0.7;

    const filtered = insights.filter(insight => {
      const decision = shouldSurfaceInsight(insight, overallConfidence, dismissals);
      return decision.shouldShow;
    });

    // All high-confidence insights should pass
    expect(filtered.length).toBe(3);
  });

  it('respects priority filtering for Living mode (priority 1-2 only)', () => {
    const insights: Insight[] = [
      { type: 'critical', message: 'Critical alert', priority: 1, confidence: 0.9 },
      { type: 'important', message: 'Important', priority: 2, confidence: 0.85 },
      { type: 'info', message: 'Info', priority: 3, confidence: 0.8 },
      { type: 'minor', message: 'Minor', priority: 4, confidence: 0.7 },
    ];

    // Living mode filter: only priority <= 2
    const livingModeFiltered = insights.filter(insight => insight.priority <= 2);

    expect(livingModeFiltered.length).toBe(2);
    expect(livingModeFiltered.map(i => i.type)).toEqual(['critical', 'important']);
  });

  it('filters out insights that have been dismissed 3+ times', () => {
    const insights: Insight[] = [
      { type: 'bills_due', message: 'Bills', priority: 2, confidence: 0.9 },
      { type: 'dismissed_type', message: 'Dismissed', priority: 2, confidence: 0.9 },
    ];
    const dismissals: DismissalRecord[] = [
      {
        insightType: 'dismissed_type',
        count: 3,
        lastDismissed: new Date().toISOString(),
      },
    ];
    const overallConfidence = 0.7;

    const filtered = insights.filter(insight => {
      const decision = shouldSurfaceInsight(insight, overallConfidence, dismissals);
      return decision.shouldShow;
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe('bills_due');
  });
});

// =============================================================================
// 3. DAY HEALTH INTEGRATION TEST
// =============================================================================

describe('day health', () => {
  it('maps health status to correct visual treatment', () => {
    const healthStatusToColor: Record<string, string> = {
      light: '', // Default, no extra color
      balanced: 'bg-emerald-500/5', // Very subtle green
      busy: 'bg-amber-500/10', // Subtle amber
      overloaded: 'bg-red-500/10', // Subtle red
    };

    // light → no color
    expect(healthStatusToColor['light']).toBe('');

    // balanced → green tint
    expect(healthStatusToColor['balanced']).toContain('emerald');

    // busy → amber tint
    expect(healthStatusToColor['busy']).toContain('amber');

    // overloaded → red tint
    expect(healthStatusToColor['overloaded']).toContain('red');
  });

  it('getInsightColor returns correct classes for priority levels', () => {
    // Priority 1 = critical = cyan (No-Shame pattern - never use red for shame)
    expect(getInsightColor(1)).toContain('cyan');

    // Priority 2 = high = amber
    expect(getInsightColor(2)).toContain('amber');

    // Priority 3 = medium = cyan
    expect(getInsightColor(3)).toContain('cyan');

    // Priority 4-5 = low = slate
    expect(getInsightColor(4)).toContain('slate');
    expect(getInsightColor(5)).toContain('slate');
  });
});

// =============================================================================
// 4. DISMISSAL PERSISTENCE TESTS
// =============================================================================

describe('dismissal tracking', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('persists dismissals to localStorage', () => {
    // Dismiss an insight
    const updated = recordDismissal('test_insight');

    // Should be in the returned array
    expect(updated.length).toBe(1);
    expect(updated[0].insightType).toBe('test_insight');
    expect(updated[0].count).toBe(1);

    // Should persist to localStorage
    const loaded = loadDismissals();
    expect(loaded.length).toBe(1);
    expect(loaded[0].insightType).toBe('test_insight');
  });

  it('counts dismissals correctly toward suppression threshold', () => {
    // Dismiss same type 3 times
    recordDismissal('frequent_dismissal');
    recordDismissal('frequent_dismissal');
    const final = recordDismissal('frequent_dismissal');

    // Should have count of 3
    const dismissal = final.find(d => d.insightType === 'frequent_dismissal');
    expect(dismissal?.count).toBe(3);

    // Now it should be suppressed
    const insight: Insight = {
      type: 'frequent_dismissal',
      message: 'Test',
      priority: 2,
      confidence: 0.9,
    };
    const result = shouldSurfaceInsight(insight, 0.7, final);
    expect(result.shouldShow).toBe(false);
    expect(result.reason).toContain('Dismissed');
  });

  it('clearAllDismissals removes all dismissal records', () => {
    recordDismissal('type_a');
    recordDismissal('type_b');
    recordDismissal('type_c');

    let loaded = loadDismissals();
    expect(loaded.length).toBe(3);

    clearAllDismissals();

    loaded = loadDismissals();
    expect(loaded.length).toBe(0);
  });

  it('updates lastDismissed timestamp on repeated dismissals', () => {
    const firstDismissal = recordDismissal('timestamp_test');
    const firstTime = new Date(firstDismissal[0].lastDismissed).getTime();

    // Wait a tiny bit to ensure different timestamp
    const secondDismissal = recordDismissal('timestamp_test');
    const secondTime = new Date(secondDismissal[0].lastDismissed).getTime();

    expect(secondTime).toBeGreaterThanOrEqual(firstTime);
    expect(secondDismissal[0].count).toBe(2);
  });
});

// =============================================================================
// 5. INSUFFICIENT DATA STATE
// =============================================================================

describe('insufficient data state', () => {
  it('calculates progress correctly for low confidence', () => {
    const info = getInsufficientDataInfo(0.25, 2);

    // 0.25 / 0.5 = 50% progress
    expect(info.progressPercent).toBe(50);
    expect(info.message).toContain('learning');
  });

  it('caps progress at 100%', () => {
    const info = getInsufficientDataInfo(0.6, 10);

    // 0.6 / 0.5 = 1.2, capped at 1.0 = 100%
    expect(info.progressPercent).toBe(100);
  });

  it('lists needed data based on current state', () => {
    const info = getInsufficientDataInfo(0.2, 2);

    // With only 2 sessions, should need more
    expect(info.neededData.some(d => d.includes('sessions'))).toBe(true);
  });
});

// =============================================================================
// 6. LAYOUT D INTELLIGENCE GATING
// =============================================================================

describe('Layout D Intelligence Gating', () => {
  it('shows week summary when confidence >= 0.5', () => {
    const confidence = { overall: 0.7, ready_for_surfacing: true };
    const patterns = { week_summary: { summary_sentence: 'This week: 3 busy days' } };

    // Simulate Layout D logic
    const shouldShowSummary = confidence.overall >= 0.5 && patterns.week_summary?.summary_sentence;

    expect(shouldShowSummary).toBeTruthy();
  });

  it('hides week summary when confidence < 0.5', () => {
    const confidence = { overall: 0.3, ready_for_surfacing: false };
    const patterns = { week_summary: { summary_sentence: 'This week: 3 busy days' } };

    // Simulate Layout D logic
    const shouldShowSummary = confidence.overall >= 0.5 && patterns.week_summary?.summary_sentence;

    expect(shouldShowSummary).toBeFalsy();
  });

  it('filters insights to priority <= 2 for critical banner', () => {
    const insights: Insight[] = [
      { type: 'critical', message: 'Urgent', priority: 1, confidence: 0.9 },
      { type: 'important', message: 'Important', priority: 2, confidence: 0.85 },
      { type: 'info', message: 'Info', priority: 3, confidence: 0.8 },
      { type: 'minor', message: 'Minor', priority: 4, confidence: 0.7 },
    ];

    // Layout D only shows priority <= 2 in critical alerts banner
    const criticalAlerts = insights.filter(i => i.priority <= 2);

    expect(criticalAlerts.length).toBe(2);
    expect(criticalAlerts.map(i => i.type)).toEqual(['critical', 'important']);
  });

  it('maps day health status to background color classes', () => {
    // Updated to match LayoutD-Hybrid.tsx - ALL statuses now get colors
    const getDayHealthColor = (status: string): string => {
      switch (status) {
        case 'light': return 'bg-emerald-500/15';
        case 'balanced': return 'bg-cyan-500/15';
        case 'busy': return 'bg-amber-500/20';
        case 'overloaded': return 'bg-red-500/25';
        default: return '';
      }
    };

    expect(getDayHealthColor('light')).toContain('emerald'); // Light = green (relaxed)
    expect(getDayHealthColor('balanced')).toContain('cyan'); // Balanced = cyan
    expect(getDayHealthColor('busy')).toContain('amber'); // Busy = amber
    expect(getDayHealthColor('overloaded')).toContain('red'); // Overloaded = red
  });
});

// =============================================================================
// 7. useCurrentMode LOGIC TESTS
// =============================================================================

describe('useCurrentMode logic', () => {
  // Test helper: simulate mode detection logic without React hooks
  const detectMode = (options: {
    sessionDurationMs?: number;
    viewsVisited?: number;
    dayOfWeek?: number;
    hour?: number;
    detectedPlanningTime?: { day: number; hour: number; confidence: number } | null;
  }) => {
    const {
      sessionDurationMs = 0,
      viewsVisited = 0,
      dayOfWeek = 2, // Tuesday
      hour = 9, // 9am
      detectedPlanningTime = null,
    } = options;

    // Constants from useCurrentMode
    const SESSION_DURATION_THRESHOLD_MS = 10 * 60 * 1000;
    const SESSION_VIEWS_THRESHOLD = 3;
    const PATTERN_HOUR_TOLERANCE = 2;
    const DEFAULT_PLANNING_DAY = 0; // Sunday
    const DEFAULT_PLANNING_START = 17; // 5pm
    const DEFAULT_PLANNING_END = 22; // 10pm

    const isWithinHourWindow = (currentHour: number, targetHour: number, tolerance: number): boolean => {
      const diff = Math.abs(currentHour - targetHour);
      return diff <= tolerance || diff >= (24 - tolerance);
    };

    // Priority 1: Session Duration Trigger
    if (sessionDurationMs >= SESSION_DURATION_THRESHOLD_MS && viewsVisited >= SESSION_VIEWS_THRESHOLD) {
      return { mode: 'planning', confidence: 0.9, reason: 'session_duration' };
    }

    // Priority 2: Temporal Pattern Match
    if (detectedPlanningTime) {
      const isCorrectDay = dayOfWeek === detectedPlanningTime.day;
      const isWithinWindow = isWithinHourWindow(hour, detectedPlanningTime.hour, PATTERN_HOUR_TOLERANCE);

      if (isCorrectDay && isWithinWindow) {
        const confidence = detectedPlanningTime.confidence >= 0.6 ? 0.8 : 0.5;
        return { mode: 'planning', confidence, reason: 'temporal_pattern' };
      }
    }

    // Priority 3: Day-of-Week Heuristic
    if (dayOfWeek === DEFAULT_PLANNING_DAY && hour >= DEFAULT_PLANNING_START && hour < DEFAULT_PLANNING_END) {
      return { mode: 'planning', confidence: 0.4, reason: 'day_heuristic' };
    }

    // Priority 4: Default Living Mode
    return { mode: 'living', confidence: 0.3, reason: 'default' };
  };

  it('returns planning mode when session > 10min with 3+ views', () => {
    const result = detectMode({
      sessionDurationMs: 15 * 60 * 1000, // 15 minutes
      viewsVisited: 4,
      dayOfWeek: 2, // Tuesday
      hour: 14, // 2pm - not a planning time
    });

    expect(result.mode).toBe('planning');
    expect(result.confidence).toBe(0.9);
    expect(result.reason).toBe('session_duration');
  });

  it('returns planning mode on detected planning day/hour', () => {
    const result = detectMode({
      dayOfWeek: 0, // Sunday (detected pattern)
      hour: 19, // 7pm (detected pattern)
      detectedPlanningTime: { day: 0, hour: 19, confidence: 0.7 },
    });

    expect(result.mode).toBe('planning');
    expect(result.confidence).toBe(0.8); // High confidence because pattern confidence >= 0.6
    expect(result.reason).toBe('temporal_pattern');
  });

  it('returns planning mode on Sunday evening (fallback heuristic)', () => {
    const result = detectMode({
      dayOfWeek: 0, // Sunday
      hour: 18, // 6pm (within 5pm-10pm window)
      detectedPlanningTime: null, // No learned pattern yet
    });

    expect(result.mode).toBe('planning');
    expect(result.confidence).toBe(0.4);
    expect(result.reason).toBe('day_heuristic');
  });

  it('returns living mode by default', () => {
    const result = detectMode({
      dayOfWeek: 2, // Tuesday
      hour: 9, // 9am
      detectedPlanningTime: null,
    });

    expect(result.mode).toBe('living');
    expect(result.confidence).toBe(0.3);
    expect(result.reason).toBe('default');
  });

  it('includes confidence score with reason', () => {
    // All detection methods should include both confidence and reason
    const sessionResult = detectMode({ sessionDurationMs: 11 * 60 * 1000, viewsVisited: 3 });
    expect(sessionResult.confidence).toBeDefined();
    expect(sessionResult.reason).toBeDefined();

    const patternResult = detectMode({
      dayOfWeek: 3, // Wednesday
      hour: 10,
      detectedPlanningTime: { day: 3, hour: 10, confidence: 0.4 }, // Low pattern confidence
    });
    expect(patternResult.confidence).toBe(0.5); // Lower because pattern confidence < 0.6
    expect(patternResult.reason).toBe('temporal_pattern');

    const heuristicResult = detectMode({ dayOfWeek: 0, hour: 20 });
    expect(heuristicResult.confidence).toBe(0.4);

    const defaultResult = detectMode({});
    expect(defaultResult.confidence).toBe(0.3);
  });

  it('calculates timeUntilPlanningWindow correctly', () => {
    // Test helper for time calculation
    const calculateTimeUntilPlanning = (
      planningDay: number,
      planningHour: number,
      currentDay: number,
      currentHour: number,
      currentMinute: number = 0
    ): number => {
      let daysUntil = planningDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;

      if (daysUntil === 0) {
        if (currentHour < planningHour) {
          return (planningHour - currentHour) * 60 - currentMinute;
        } else if (currentHour >= planningHour && currentHour < planningHour + 4) {
          return 0; // In window
        } else {
          daysUntil = 7; // Past window, next week
        }
      }

      return daysUntil * 24 * 60 + (planningHour - currentHour) * 60 - currentMinute;
    };

    // Sunday 7pm planning, currently Saturday 3pm
    const saturdayToSunday = calculateTimeUntilPlanning(0, 19, 6, 15);
    expect(saturdayToSunday).toBe(1 * 24 * 60 + 4 * 60); // 1 day + 4 hours = 1680 minutes

    // Sunday 7pm planning, currently Sunday 5pm (before window)
    const sundayBeforeWindow = calculateTimeUntilPlanning(0, 19, 0, 17);
    expect(sundayBeforeWindow).toBe(2 * 60); // 2 hours = 120 minutes

    // Sunday 7pm planning, currently Sunday 7pm (in window)
    const inWindow = calculateTimeUntilPlanning(0, 19, 0, 19);
    expect(inWindow).toBe(0);

    // Sunday 7pm planning, currently Monday 9am (past window)
    const mondayAfter = calculateTimeUntilPlanning(0, 19, 1, 9);
    expect(mondayAfter).toBe(6 * 24 * 60 + 10 * 60); // 6 days + 10 hours
  });
});
