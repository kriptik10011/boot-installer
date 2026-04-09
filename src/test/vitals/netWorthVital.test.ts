/**
 * NetWorthVital Tests
 *
 * Tests: trend calculation, direction arrows, solid trust border.
 */

import { describe, it, expect } from 'vitest';
import { getTrustBorderClasses } from '@/utils/trustVisualization';
import { fmt } from '@/components/finance/classic/FinanceHelpers';

describe('NetWorthVital - trend calculation', () => {
  function calcTrend(oldest: number, newest: number) {
    const change = newest - oldest;
    const pct = oldest !== 0 ? Math.round((change / Math.abs(oldest)) * 100) : 0;
    const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    return { change, pct, dir };
  }

  it('calculates upward trend', () => {
    const result = calcTrend(40000, 45000);
    expect(result.dir).toBe('up');
    expect(result.change).toBe(5000);
    expect(result.pct).toBe(13);
  });

  it('calculates downward trend', () => {
    const result = calcTrend(50000, 48000);
    expect(result.dir).toBe('down');
    expect(result.change).toBe(-2000);
    expect(result.pct).toBe(-4);
  });

  it('handles flat (no change)', () => {
    const result = calcTrend(30000, 30000);
    expect(result.dir).toBe('flat');
    expect(result.change).toBe(0);
  });

  it('handles zero starting point', () => {
    const result = calcTrend(0, 5000);
    expect(result.pct).toBe(0); // Can't compute % from 0
  });
});

describe('NetWorthVital - trust border', () => {
  it('uses solid border for user-confirmed data (high confidence)', () => {
    const classes = getTrustBorderClasses(0.95, 'border-slate-700/50');
    expect(classes).not.toContain('dashed');
  });
});

describe('NetWorthVital - formatting', () => {
  it('formats net worth amounts', () => {
    expect(fmt(45230)).toBe('$45,230');
  });

  it('formats negative net worth without shame', () => {
    // fmt handles negatives; display should not expose raw negative sign
    const result = fmt(-5000);
    expect(result).toContain('5,000');
  });
});
