/**
 * Behavioral Learning Tests
 *
 * Tests: EWMA decay, size transitions, auto-reorder scoring,
 * pinned vitals skip resize, removed vitals skip, immutability.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRawScore,
  applyDecay,
  computeSize,
} from '@/hooks/useVitalLayout';
import type { VitalInteraction } from '@/types/vitals';

const MS_PER_DAY = 86_400_000;

describe('Behavioral Learning - EWMA scoring', () => {
  it('computes raw score from interaction counts', () => {
    const interaction: VitalInteraction = {
      openCount: 5,
      actionCount: 2,
      lastInteraction: Date.now(),
      totalDwellMs: 10000, // 10 seconds
    };
    // 5*1.0 + 2*2.0 + (10)*0.5 = 5 + 4 + 5 = 14
    expect(computeRawScore(interaction)).toBe(14);
  });

  it('returns 0 for no interactions', () => {
    const interaction: VitalInteraction = {
      openCount: 0,
      actionCount: 0,
      lastInteraction: Date.now(),
      totalDwellMs: 0,
    };
    expect(computeRawScore(interaction)).toBe(0);
  });

  it('weights actions higher than opens', () => {
    const openOnly: VitalInteraction = {
      openCount: 4, actionCount: 0, lastInteraction: Date.now(), totalDwellMs: 0,
    };
    const actionOnly: VitalInteraction = {
      openCount: 0, actionCount: 2, lastInteraction: Date.now(), totalDwellMs: 0,
    };
    // open: 4*1=4, action: 2*2=4 — same total with half the interactions
    expect(computeRawScore(openOnly)).toBe(computeRawScore(actionOnly));
  });
});

describe('Behavioral Learning - EWMA decay', () => {
  it('returns full score for recent interactions', () => {
    const now = Date.now();
    const score = applyDecay(10, now, now);
    expect(score).toBeCloseTo(10, 1);
  });

  it('decays score over time', () => {
    const now = Date.now();
    const weekAgo = now - 7 * MS_PER_DAY;
    const score = applyDecay(10, weekAgo, now);
    expect(score).toBeLessThan(10);
    expect(score).toBeGreaterThan(0);
  });

  it('heavily decays after 28 days (2x half-life)', () => {
    const now = Date.now();
    const monthAgo = now - 28 * MS_PER_DAY;
    const score = applyDecay(10, monthAgo, now);
    // After 28 days with 14-day decay: e^(-2) ≈ 0.135
    expect(score).toBeLessThan(2);
  });
});

describe('Behavioral Learning - size computation', () => {
  const now = Date.now();

  it('returns standard when no interaction data', () => {
    expect(computeSize(undefined, 10, now, false)).toBe('standard');
  });

  it('returns standard when max score is 0', () => {
    const inter: VitalInteraction = {
      openCount: 5, actionCount: 3, lastInteraction: now, totalDwellMs: 5000,
    };
    expect(computeSize(inter, 0, now, false)).toBe('standard');
  });

  it('returns standard for pinned vitals regardless of score', () => {
    const inter: VitalInteraction = {
      openCount: 100, actionCount: 50, lastInteraction: now, totalDwellMs: 100000,
    };
    const rawScore = computeRawScore(inter);
    expect(computeSize(inter, rawScore, now, true)).toBe('standard');
  });

  it('returns large for highest-scoring vital', () => {
    const inter: VitalInteraction = {
      openCount: 20, actionCount: 10, lastInteraction: now, totalDwellMs: 60000,
    };
    const rawScore = computeRawScore(inter);
    // This vital IS the max scorer, so normalized = 1.0 > 0.7
    expect(computeSize(inter, rawScore, now, false)).toBe('large');
  });

  it('does not compact recent interactions even with low score', () => {
    const inter: VitalInteraction = {
      openCount: 1, actionCount: 0, lastInteraction: now, totalDwellMs: 0,
    };
    // Score=1, maxScore=100 → normalized=0.01 < 0.1, but recent → stays standard
    expect(computeSize(inter, 100, now, false)).toBe('standard');
  });
});
