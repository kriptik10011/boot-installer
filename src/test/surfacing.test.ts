/**
 * Surfacing Layer Tests
 *
 * Tests the Interruption Calculus engine, escalation ladder,
 * dismissal management, and deferral queue.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldSurfaceInsight,
  getEscalationLevel,
  getEscalationDescription,
  getInsightColor,
  getInsightIcon,
  getInsufficientDataInfo,
  recordDismissal,
  clearDismissal,
  clearAllDismissals,
  loadDismissals,
  recordAcceptance,
  loadAcceptances,
  clearAllAcceptances,
  getTrustScoreData,
  deferInsight,
  checkOpportuneMoment,
  clearAllDeferredInsights,
  loadDeferredInsights,
} from '../utils/surfacing';
import type { Insight } from '../api/client';
import type { DismissalRecord, SurfacingContext } from '../utils/surfacing';

// ---------------------------------------------------------------------------
// Mock Insight factory
// ---------------------------------------------------------------------------

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    type: 'spending_high',
    message: 'Spending is above average this week',
    priority: 2,
    confidence: 0.8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup: clear localStorage before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// =============================================================================
// shouldSurfaceInsight
// =============================================================================

describe('shouldSurfaceInsight', () => {
  it('surfaces high-confidence, high-priority insight with no dismissals', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 1, confidence: 0.9 }),
      0.8, // overall confidence
      []   // no dismissals
    );
    expect(decision.shouldShow).toBe(true);
    expect(decision.score).toBeGreaterThan(0.3);
    expect(decision.failedGates).toEqual([]);
  });

  it('rejects when overall confidence < 0.5', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 1, confidence: 0.9 }),
      0.3, // too low
      []
    );
    expect(decision.shouldShow).toBe(false);
    expect(decision.reason).toContain('confidence too low');
  });

  it('rejects when DND mode is active (non-urgent)', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 2 }),
      0.8,
      [],
      { isDndMode: true }
    );
    expect(decision.shouldShow).toBe(false);
    expect(decision.failedGates).toContain('DND mode is active');
  });

  it('allows urgent insight through DND gate', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 1, type: 'bill_due_soon', confidence: 0.9 }),
      0.8,
      [],
      { isDndMode: true, isUrgent: true }
    );
    expect(decision.shouldShow).toBe(true);
  });

  it('rejects mid-task non-urgent insights', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 3 }),
      0.8,
      [],
      { isMidTask: true }
    );
    expect(decision.shouldShow).toBe(false);
    expect(decision.failedGates).toContain('User appears mid-task');
  });

  it('rejects low-priority in Living Mode', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 3, confidence: 0.8 }),
      0.8,
      [],
      { isPlanningMode: false }
    );
    expect(decision.shouldShow).toBe(false);
    expect(decision.failedGates[0]).toContain('Living Mode');
  });

  it('allows priority 1-2 in Living Mode', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 2, confidence: 0.8 }),
      0.8,
      [],
      { isPlanningMode: false }
    );
    expect(decision.shouldShow).toBe(true);
  });

  it('suppresses recently dismissed insight', () => {
    const dismissals: DismissalRecord[] = [{
      insightType: 'spending_high',
      count: 1,
      lastDismissed: new Date().toISOString(),
    }];
    const decision = shouldSurfaceInsight(
      makeInsight({ type: 'spending_high' }),
      0.8,
      dismissals
    );
    expect(decision.shouldShow).toBe(false);
    expect(decision.reason).toContain('Dismissed');
  });

  it('allows insight after dismissal decays (>24h)', () => {
    const dismissals: DismissalRecord[] = [{
      insightType: 'spending_high',
      count: 1,
      lastDismissed: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
    }];
    const decision = shouldSurfaceInsight(
      makeInsight({ type: 'spending_high', confidence: 0.8 }),
      0.8,
      dismissals
    );
    expect(decision.shouldShow).toBe(true);
  });

  it('permanent dismissal lasts 30 days', () => {
    const dismissals: DismissalRecord[] = [{
      insightType: 'spending_high',
      count: 1,
      lastDismissed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      permanent: true,
    }];
    const decision = shouldSurfaceInsight(
      makeInsight({ type: 'spending_high' }),
      0.8,
      dismissals
    );
    expect(decision.shouldShow).toBe(false);
    expect(decision.reason).toContain('Dismissed');
  });

  it('rejects very low score insight', () => {
    const decision = shouldSurfaceInsight(
      makeInsight({ priority: 5, confidence: 0.5 }),
      0.5,
      []
    );
    expect(decision.shouldShow).toBe(false);
    expect(decision.reason).toContain('Score too low');
  });
});

// =============================================================================
// getEscalationLevel
// =============================================================================

describe('getEscalationLevel', () => {
  it('returns notification for bill_due_soon priority 1', () => {
    const level = getEscalationLevel(makeInsight({ type: 'bill_due_soon', priority: 1 }), 0.8);
    expect(level).toBe('notification');
  });

  it('returns passive for bill_due_soon lower priority', () => {
    const level = getEscalationLevel(makeInsight({ type: 'bill_due_soon', priority: 2 }), 0.8);
    expect(level).toBe('passive');
  });

  it('returns ambient for meal_gap', () => {
    const level = getEscalationLevel(makeInsight({ type: 'meal_gap', priority: 3 }), 0.8);
    expect(level).toBe('ambient');
  });

  it('escalates ambient to passive when high priority + high confidence', () => {
    const level = getEscalationLevel(makeInsight({ type: 'meal_gap', priority: 1 }), 0.8);
    expect(level).toBe('passive');
  });

  it('demotes passive to ambient when confidence < 0.5', () => {
    const level = getEscalationLevel(makeInsight({ type: 'spending_high', priority: 2 }), 0.3);
    expect(level).toBe('ambient');
  });

  it('defaults to ambient for unknown type', () => {
    const level = getEscalationLevel(makeInsight({ type: 'unknown_type', priority: 3 }), 0.6);
    expect(level).toBe('ambient');
  });
});

// =============================================================================
// getEscalationDescription
// =============================================================================

describe('getEscalationDescription', () => {
  it('returns description for ambient', () => {
    expect(getEscalationDescription('ambient')).toContain('indicator');
  });

  it('returns description for passive', () => {
    expect(getEscalationDescription('passive')).toContain('Card');
  });

  it('returns description for notification', () => {
    expect(getEscalationDescription('notification')).toContain('notification');
  });
});

// =============================================================================
// getInsufficientDataInfo
// =============================================================================

describe('getInsufficientDataInfo', () => {
  it('returns learning message at low confidence', () => {
    const info = getInsufficientDataInfo(0.1, 2);
    expect(info.message).toBeTruthy();
    expect(info.progressPercent).toBeLessThan(100);
    expect(info.neededData.length).toBeGreaterThan(0);
  });

  it('returns higher progress at moderate confidence', () => {
    const lowInfo = getInsufficientDataInfo(0.1, 2);
    const highInfo = getInsufficientDataInfo(0.4, 10);
    expect(highInfo.progressPercent).toBeGreaterThan(lowInfo.progressPercent);
  });
});

// =============================================================================
// Dismissal management (localStorage)
// =============================================================================

describe('dismissal management', () => {
  it('records and loads dismissals', () => {
    recordDismissal('spending_high');
    const dismissals = loadDismissals();
    expect(dismissals).toHaveLength(1);
    expect(dismissals[0].insightType).toBe('spending_high');
    expect(dismissals[0].count).toBe(1);
  });

  it('increments count on repeat dismissal', () => {
    recordDismissal('spending_high');
    recordDismissal('spending_high');
    const dismissals = loadDismissals();
    expect(dismissals).toHaveLength(1);
    expect(dismissals[0].count).toBe(2);
  });

  it('upgrades to permanent on request', () => {
    recordDismissal('spending_high', false);
    recordDismissal('spending_high', true);
    const dismissals = loadDismissals();
    expect(dismissals[0].permanent).toBe(true);
  });

  it('clears specific dismissal', () => {
    recordDismissal('spending_high');
    recordDismissal('meal_gap');
    clearDismissal('spending_high');
    const dismissals = loadDismissals();
    expect(dismissals).toHaveLength(1);
    expect(dismissals[0].insightType).toBe('meal_gap');
  });

  it('clears all dismissals', () => {
    recordDismissal('spending_high');
    recordDismissal('meal_gap');
    clearAllDismissals();
    expect(loadDismissals()).toEqual([]);
  });
});

// =============================================================================
// Acceptance tracking
// =============================================================================

describe('acceptance tracking', () => {
  it('records and loads acceptances', () => {
    recordAcceptance('spending_high');
    const acceptances = loadAcceptances();
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0].insightType).toBe('spending_high');
  });

  it('calculates trust score data', () => {
    recordAcceptance('spending_high');
    recordAcceptance('meal_gap');
    recordDismissal('conflict');
    const trust = getTrustScoreData();
    expect(trust.acceptedCount).toBe(2);
    expect(trust.dismissedCount).toBe(1);
    expect(trust.totalInteractions).toBe(3);
    expect(trust.acceptanceRate).toBeCloseTo(2 / 3, 1);
  });

  it('clears all acceptances', () => {
    recordAcceptance('spending_high');
    clearAllAcceptances();
    expect(loadAcceptances()).toEqual([]);
  });
});

// =============================================================================
// Deferral queue
// =============================================================================

describe('deferral queue', () => {
  it('defers and retrieves insight at idle', () => {
    const insight = makeInsight({ type: 'conflict' });
    deferInsight(insight, 0.5, 'passive', 5 * 60 * 1000);
    // Not idle enough
    const notReady = checkOpportuneMoment(10000); // 10s idle
    expect(notReady).toHaveLength(0);
    // Idle for 30s+
    const ready = checkOpportuneMoment(31000);
    expect(ready).toHaveLength(1);
    expect(ready[0].insight.type).toBe('conflict');
  });

  it('does not duplicate deferred insights', () => {
    const insight = makeInsight({ type: 'conflict' });
    deferInsight(insight, 0.5, 'passive');
    deferInsight(insight, 0.5, 'passive');
    const deferred = loadDeferredInsights();
    expect(deferred).toHaveLength(1);
  });

  it('clears all deferred insights', () => {
    deferInsight(makeInsight({ type: 'a' }), 0.5, 'passive');
    deferInsight(makeInsight({ type: 'b' }), 0.5, 'passive');
    clearAllDeferredInsights();
    expect(loadDeferredInsights()).toEqual([]);
  });
});
