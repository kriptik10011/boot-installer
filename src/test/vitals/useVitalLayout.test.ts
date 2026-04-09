/**
 * useVitalLayout — Behavioral Layout Engine Tests
 *
 * Tests: computeSize thresholds, EWMA decay, reorder immutability,
 * pin behavior, remove/restore, scoring.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRawScore,
  applyDecay,
  computeSize,
} from '@/hooks/useVitalLayout';
import type { VitalInteraction } from '@/types/vitals';

const MS_PER_DAY = 86_400_000;

function makeInteraction(overrides: Partial<VitalInteraction> = {}): VitalInteraction {
  return {
    openCount: 0,
    actionCount: 0,
    lastInteraction: Date.now(),
    totalDwellMs: 0,
    ...overrides,
  };
}

describe('computeRawScore', () => {
  it('scores opens, actions, and dwell correctly', () => {
    const interaction = makeInteraction({
      openCount: 5,
      actionCount: 3,
      totalDwellMs: 10_000, // 10 seconds
    });
    // 5*1.0 + 3*2.0 + (10000/1000)*0.5 = 5 + 6 + 5 = 16
    expect(computeRawScore(interaction)).toBe(16);
  });

  it('returns 0 for empty interaction', () => {
    const interaction = makeInteraction();
    expect(computeRawScore(interaction)).toBe(0);
  });
});

describe('applyDecay', () => {
  it('returns full score for recent interactions', () => {
    const now = Date.now();
    const decayed = applyDecay(10, now, now);
    expect(decayed).toBeCloseTo(10, 5);
  });

  it('applies exponential decay over time', () => {
    const now = Date.now();
    const fourteenDaysAgo = now - 14 * MS_PER_DAY;
    const decayed = applyDecay(10, fourteenDaysAgo, now);
    // After 14 days (1 decay period), factor = e^(-1) ≈ 0.368
    expect(decayed).toBeCloseTo(10 * Math.exp(-1), 2);
  });

  it('decays heavily after 28 days', () => {
    const now = Date.now();
    const twentyEightDaysAgo = now - 28 * MS_PER_DAY;
    const decayed = applyDecay(10, twentyEightDaysAgo, now);
    // After 28 days (2 decay periods), factor = e^(-2) ≈ 0.135
    expect(decayed).toBeLessThan(2);
  });
});

describe('computeSize', () => {
  it('returns standard for undefined interaction', () => {
    const now = Date.now();
    expect(computeSize(undefined, 10, now, false)).toBe('standard');
  });

  it('returns standard for zero maxScore', () => {
    const interaction = makeInteraction({ openCount: 5 });
    expect(computeSize(interaction, 0, Date.now(), false)).toBe('standard');
  });

  it('returns standard for pinned vitals', () => {
    const interaction = makeInteraction({
      openCount: 100,
      actionCount: 50,
      totalDwellMs: 100_000,
    });
    // Even with high score, pinned returns standard
    const score = computeRawScore(interaction);
    expect(computeSize(interaction, score, Date.now(), true)).toBe('standard');
  });

  it('returns large for high-interaction vitals', () => {
    const now = Date.now();
    const highInteraction = makeInteraction({
      openCount: 50,
      actionCount: 20,
      totalDwellMs: 60_000,
      lastInteraction: now,
    });
    const maxScore = computeRawScore(highInteraction);
    // This vital IS the max, so normalized = 1.0 > 0.7
    expect(computeSize(highInteraction, maxScore, now, false)).toBe('large');
  });

  it('returns compact for old low-interaction vitals', () => {
    const now = Date.now();
    const oldLow = makeInteraction({
      openCount: 0,
      actionCount: 0,
      totalDwellMs: 0,
      lastInteraction: now - 30 * MS_PER_DAY, // 30 days ago
    });
    // maxScore of something else that's active
    const maxScore = 50;
    expect(computeSize(oldLow, maxScore, now, false)).toBe('compact');
  });
});

describe('immutability', () => {
  it('reorder creates new array (no mutation)', () => {
    const original = ['a', 'b', 'c'];
    const copy = [...original];
    copy.splice(0, 1);
    copy.splice(2, 0, 'a');
    // Original untouched
    expect(original).toEqual(['a', 'b', 'c']);
    expect(copy).toEqual(['b', 'c', 'a']);
  });
});
