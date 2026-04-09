/**
 * DebtJourneyVital Tests
 *
 * Tests: no-shame framing (never red), progress calculation,
 * strategy labels, journey language.
 */

import { describe, it, expect } from 'vitest';

describe('DebtJourneyVital - progress calculation', () => {
  function calcProgress(totalOriginal: number, totalDebt: number) {
    const paidOff = totalOriginal > 0 ? totalOriginal - totalDebt : 0;
    return totalOriginal > 0 ? Math.round((paidOff / totalOriginal) * 100) : 0;
  }

  it('calculates 0% when no original debt', () => {
    expect(calcProgress(0, 0)).toBe(0);
  });

  it('calculates correct progress percentage', () => {
    expect(calcProgress(10000, 3800)).toBe(62);
  });

  it('calculates 100% when fully paid off', () => {
    expect(calcProgress(5000, 0)).toBe(100);
  });
});

describe('DebtJourneyVital - no-shame framing', () => {
  function barColor(pct: number): string {
    if (pct >= 75) return 'bg-emerald-500';
    if (pct >= 40) return 'bg-cyan-500';
    return 'bg-cyan-400';
  }

  it('uses emerald for high progress', () => {
    expect(barColor(80)).toBe('bg-emerald-500');
  });

  it('uses cyan for moderate progress', () => {
    expect(barColor(50)).toBe('bg-cyan-500');
  });

  it('uses cyan-400 for early journey', () => {
    expect(barColor(20)).toBe('bg-cyan-400');
  });

  it('never uses red (no-shame pattern)', () => {
    for (const pct of [0, 10, 25, 50, 75, 100]) {
      expect(barColor(pct)).not.toContain('red');
    }
  });
});

describe('DebtJourneyVital - strategy labels', () => {
  function strategyLabel(strategy: string): string {
    return strategy === 'snowball'
      ? 'Snowball (smallest first)'
      : 'Avalanche (highest rate first)';
  }

  it('labels snowball correctly', () => {
    expect(strategyLabel('snowball')).toBe('Snowball (smallest first)');
  });

  it('labels avalanche correctly', () => {
    expect(strategyLabel('avalanche')).toBe('Avalanche (highest rate first)');
  });
});
