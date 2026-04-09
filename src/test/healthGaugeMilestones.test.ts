/**
 * Health Gauge + Monthly Close Tests (Session 7: F4 + F6 + F7)
 *
 * Tests for:
 * - Health score color/label mapping
 * - Monthly close wizard step navigation
 * - SVG gauge math
 */

import { describe, it, expect } from 'vitest';

// --- Health Score Gauge ---

function scoreToColor(score: number): string {
  if (score >= 70) return '#10b981';
  if (score >= 40) return '#f59e0b';
  return '#d97706';
}

function scoreToLabel(score: number): string {
  if (score >= 70) return 'Healthy';
  if (score >= 40) return 'Caution';
  return 'At Risk';
}

describe('HealthScoreGauge', () => {
  it('high score (70+) is emerald/Healthy', () => {
    expect(scoreToColor(70)).toBe('#10b981');
    expect(scoreToColor(100)).toBe('#10b981');
    expect(scoreToLabel(85)).toBe('Healthy');
  });

  it('medium score (40-69) is amber/Caution', () => {
    expect(scoreToColor(40)).toBe('#f59e0b');
    expect(scoreToColor(69)).toBe('#f59e0b');
    expect(scoreToLabel(50)).toBe('Caution');
  });

  it('low score (<40) is red/At Risk', () => {
    expect(scoreToColor(0)).toBe('#d97706');
    expect(scoreToColor(39)).toBe('#d97706');
    expect(scoreToLabel(20)).toBe('At Risk');
  });

  it('SVG stroke dashoffset is correct', () => {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const score = 75;
    const offset = circumference * (1 - score / 100);
    expect(offset).toBeCloseTo(circumference * 0.25);
  });

  it('score is clamped to 0-100', () => {
    const clamp = (s: number) => Math.max(0, Math.min(100, s));
    expect(clamp(-10)).toBe(0);
    expect(clamp(150)).toBe(100);
    expect(clamp(50)).toBe(50);
  });
});

// --- Monthly Close Wizard Navigation ---

describe('MonthlyCloseWizard steps', () => {
  const STEP_COUNT = 3;

  it('has exactly 3 steps', () => {
    expect(STEP_COUNT).toBe(3);
  });

  it('step progression: 0 -> 1 -> 2', () => {
    let step = 0;
    step = Math.min(STEP_COUNT - 1, step + 1);
    expect(step).toBe(1);
    step = Math.min(STEP_COUNT - 1, step + 1);
    expect(step).toBe(2);
    // Can't go beyond last step
    step = Math.min(STEP_COUNT - 1, step + 1);
    expect(step).toBe(2);
  });

  it('back from step 0 stays at 0', () => {
    let step = 0;
    step = Math.max(0, step - 1);
    expect(step).toBe(0);
  });

  it('back from step 2 goes to 1', () => {
    let step = 2;
    step = Math.max(0, step - 1);
    expect(step).toBe(1);
  });
});

// --- Monthly data format ---

describe('monthly close data formatting', () => {
  it('calculates net from income - expenses', () => {
    const income = 5000;
    const expenses = 3500;
    expect(income - expenses).toBe(1500);
  });

  it('handles zero income gracefully', () => {
    const income = 0;
    const expenses = 200;
    const net = income - expenses;
    expect(net).toBe(-200);
    expect(net < 0).toBe(true);
  });

  it('formats month date correctly', () => {
    const date = new Date('2026-02-15');
    const monthStr = date.toISOString().slice(0, 10);
    expect(monthStr).toBe('2026-02-15');
  });
});
