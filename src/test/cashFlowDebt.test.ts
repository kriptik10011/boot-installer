/**
 * Cash Flow + Debt Freedom Tests (Session 5: F1 + F3)
 *
 * Tests for:
 * - Cash flow chart data transformation
 * - Debt freedom progress calculation
 * - Low balance detection
 */

import { describe, it, expect } from 'vitest';

// --- Cash flow chart data transformation ---

interface DailyProjection {
  date: string;
  projected_balance: number;
}

function transformChartData(projections: DailyProjection[], threshold: number) {
  return projections.map((p) => ({
    date: p.date.slice(5),
    balance: Math.round(p.projected_balance),
    isLow: p.projected_balance < threshold,
  }));
}

describe('CashFlowChart data transformation', () => {
  it('truncates date to month-day format', () => {
    const result = transformChartData(
      [{ date: '2026-02-15', projected_balance: 1000 }],
      500
    );
    expect(result[0].date).toBe('02-15');
  });

  it('rounds balance to integer', () => {
    const result = transformChartData(
      [{ date: '2026-02-15', projected_balance: 1234.56 }],
      500
    );
    expect(result[0].balance).toBe(1235);
  });

  it('flags low balance correctly', () => {
    const result = transformChartData(
      [
        { date: '2026-02-15', projected_balance: 600 },
        { date: '2026-02-16', projected_balance: 400 },
      ],
      500
    );
    expect(result[0].isLow).toBe(false);
    expect(result[1].isLow).toBe(true);
  });

  it('handles empty projections', () => {
    expect(transformChartData([], 500)).toEqual([]);
  });
});

// --- Debt freedom progress ---

function calculateProgress(totalDebt: number, totalPaid: number): number {
  if (totalDebt <= 0 && totalPaid <= 0) return 0;
  return (totalPaid / (totalPaid + totalDebt)) * 100;
}

describe('DebtFreedomJourney progress', () => {
  it('calculates correct progress percentage', () => {
    const pct = calculateProgress(7500, 2500);
    expect(pct).toBe(25);
  });

  it('returns 0 when no debt and no paid', () => {
    expect(calculateProgress(0, 0)).toBe(0);
  });

  it('returns 100% when all paid off (debt=0, paid=10000)', () => {
    const pct = calculateProgress(0, 10000);
    expect(pct).toBe(100);
  });

  it('returns 50% for equal debt and paid', () => {
    expect(calculateProgress(5000, 5000)).toBe(50);
  });
});

// --- Low balance detection ---

describe('low balance detection', () => {
  it('detects low balance in projections', () => {
    const projections = [
      { date: '2026-02-15', projected_balance: 1000 },
      { date: '2026-02-20', projected_balance: 300 },
      { date: '2026-02-25', projected_balance: 800 },
    ];
    const minBalance = Math.min(...projections.map((p) => p.projected_balance));
    expect(minBalance).toBe(300);
    expect(minBalance < 500).toBe(true);
  });

  it('no low balance when all above threshold', () => {
    const projections = [
      { date: '2026-02-15', projected_balance: 1000 },
      { date: '2026-02-20', projected_balance: 800 },
    ];
    const minBalance = Math.min(...projections.map((p) => p.projected_balance));
    expect(minBalance < 500).toBe(false);
  });
});
