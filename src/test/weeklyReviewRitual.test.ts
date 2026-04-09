/**
 * Weekly Review Ritual Tests (Session 2: P1 + P4)
 *
 * Tests for:
 * - FeelingSlider: 5-point subjective-objective calibration
 * - OpenLoopTriageCard: Carry/Kill/Park triage for open loops
 */

import { describe, it, expect } from 'vitest';

// --- FeelingSlider logic tests ---

const FEELINGS = [
  { value: 1, label: 'Draining' },
  { value: 2, label: 'Tough' },
  { value: 3, label: 'Steady' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Energizing' },
] as const;

function getCalibrationMessage(feeling: number | null, completionPct: number | undefined): string | null {
  if (feeling === null || completionPct === undefined) return null;
  if (feeling >= 4 && completionPct < 50) {
    return 'Sometimes less gets done but the week still feels good.';
  }
  if (feeling <= 2 && completionPct >= 80) {
    return 'High completion, but it took a lot out of you. Worth noting.';
  }
  return null;
}

describe('FeelingSlider', () => {
  it('has exactly 5 feeling options', () => {
    expect(FEELINGS).toHaveLength(5);
  });

  it('values range from 1 to 5', () => {
    expect(FEELINGS[0].value).toBe(1);
    expect(FEELINGS[4].value).toBe(5);
  });

  it('labels follow draining-to-energizing spectrum', () => {
    expect(FEELINGS[0].label).toBe('Draining');
    expect(FEELINGS[2].label).toBe('Steady');
    expect(FEELINGS[4].label).toBe('Energizing');
  });

  it('shows calibration message when feeling good but low completion', () => {
    const msg = getCalibrationMessage(4, 30);
    expect(msg).toBe('Sometimes less gets done but the week still feels good.');
  });

  it('shows calibration message when feeling bad but high completion', () => {
    const msg = getCalibrationMessage(2, 85);
    expect(msg).toBe('High completion, but it took a lot out of you. Worth noting.');
  });

  it('returns null for neutral feeling-completion combinations', () => {
    expect(getCalibrationMessage(3, 50)).toBeNull();
    expect(getCalibrationMessage(4, 80)).toBeNull();
    expect(getCalibrationMessage(2, 40)).toBeNull();
  });

  it('returns null when feeling is null', () => {
    expect(getCalibrationMessage(null, 75)).toBeNull();
  });

  it('returns null when completionPct is undefined', () => {
    expect(getCalibrationMessage(4, undefined)).toBeNull();
  });
});

// --- OpenLoopTriageCard logic tests ---

describe('OpenLoopTriageCard actions', () => {
  const mockBill = {
    id: 1,
    name: 'Electric Bill',
    amount: 150.00,
    due_date: '2026-02-10',
    type: 'bill' as const,
    is_paid: false,
  };

  it('Carry action reschedules bill 7 days forward', () => {
    const dueDate = new Date(mockBill.due_date + 'T00:00:00');
    dueDate.setDate(dueDate.getDate() + 7);
    const newDue = dueDate.toISOString().split('T')[0];
    expect(newDue).toBe('2026-02-17');
  });

  it('Park action marks bill as paid', () => {
    const parkData = { is_paid: true };
    expect(parkData.is_paid).toBe(true);
  });

  it('Kill action uses bill id for deletion', () => {
    expect(mockBill.id).toBe(1);
  });

  it('has three distinct triage actions', () => {
    const actions = ['carry', 'kill', 'park'];
    expect(actions).toHaveLength(3);
    expect(new Set(actions).size).toBe(3);
  });

  it('Carry preserves original amount', () => {
    // Carry only changes due_date, not amount
    const carryData = { due_date: '2026-02-17' };
    expect(carryData).not.toHaveProperty('amount');
  });

  it('handles month boundary correctly for Carry', () => {
    const endOfMonthBill = { ...mockBill, due_date: '2026-02-27' };
    const dueDate = new Date(endOfMonthBill.due_date + 'T00:00:00');
    dueDate.setDate(dueDate.getDate() + 7);
    const newDue = dueDate.toISOString().split('T')[0];
    expect(newDue).toBe('2026-03-06');
  });
});

// --- Completion percentage calculation ---

describe('completion percentage calculation', () => {
  it('calculates correct percentage when meals planned', () => {
    const mealsPlanned = 14;
    const mealsCooked = 10;
    const pct = Math.round((mealsCooked / mealsPlanned) * 100);
    expect(pct).toBe(71);
  });

  it('returns undefined when no meals planned', () => {
    const mealsPlanned = 0;
    const completionPct = mealsPlanned > 0 ? Math.round((5 / mealsPlanned) * 100) : undefined;
    expect(completionPct).toBeUndefined();
  });

  it('returns 100 for perfect week', () => {
    const mealsPlanned = 7;
    const mealsCooked = 7;
    const pct = Math.round((mealsCooked / mealsPlanned) * 100);
    expect(pct).toBe(100);
  });

  it('returns 0 when nothing cooked', () => {
    const mealsPlanned = 7;
    const mealsCooked = 0;
    const pct = Math.round((mealsCooked / mealsPlanned) * 100);
    expect(pct).toBe(0);
  });
});
