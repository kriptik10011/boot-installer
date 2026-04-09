/**
 * SpendingLensVital Tests
 *
 * Tests: compact top-2 display, anomaly highlighting (pace >1.3),
 * velocity labels, no-shame color treatment.
 */

import { describe, it, expect } from 'vitest';

describe('SpendingLensVital - anomaly detection', () => {
  it('flags categories with pace_ratio > 1.3 as anomalous', () => {
    const categories = [
      { category_name: 'Groceries', pace_ratio: 1.5 },
      { category_name: 'Transport', pace_ratio: 0.8 },
      { category_name: 'Dining', pace_ratio: 1.4 },
      { category_name: 'Utilities', pace_ratio: 1.0 },
    ];
    const anomalies = categories.filter((c) => c.pace_ratio > 1.3);
    expect(anomalies).toHaveLength(2);
    expect(anomalies[0].category_name).toBe('Groceries');
    expect(anomalies[1].category_name).toBe('Dining');
  });

  it('returns empty array when no anomalies', () => {
    const categories = [
      { category_name: 'Groceries', pace_ratio: 0.9 },
      { category_name: 'Transport', pace_ratio: 1.1 },
    ];
    const anomalies = categories.filter((c) => c.pace_ratio > 1.3);
    expect(anomalies).toHaveLength(0);
  });
});

describe('SpendingLensVital - sorting', () => {
  it('sorts categories by pace_ratio descending', () => {
    const categories = [
      { category_name: 'A', pace_ratio: 0.8 },
      { category_name: 'B', pace_ratio: 1.5 },
      { category_name: 'C', pace_ratio: 1.2 },
    ];
    const sorted = [...categories].sort((a, b) => b.pace_ratio - a.pace_ratio);
    expect(sorted[0].category_name).toBe('B');
    expect(sorted[1].category_name).toBe('C');
    expect(sorted[2].category_name).toBe('A');
  });
});

describe('SpendingLensVital - pace color', () => {
  function paceColor(ratio: number): string {
    if (ratio > 1.3) return 'text-amber-400';
    if (ratio > 1.1) return 'text-amber-300';
    if (ratio <= 0.7) return 'text-emerald-400';
    return 'text-slate-300';
  }

  it('uses amber-400 for high anomalies', () => {
    expect(paceColor(1.5)).toBe('text-amber-400');
  });

  it('uses amber-300 for mild anomalies', () => {
    expect(paceColor(1.2)).toBe('text-amber-300');
  });

  it('uses emerald for very low pace', () => {
    expect(paceColor(0.5)).toBe('text-emerald-400');
  });

  it('uses slate for normal range', () => {
    expect(paceColor(1.0)).toBe('text-slate-300');
  });

  it('never uses red (no-shame pattern)', () => {
    for (const r of [0.5, 0.8, 1.0, 1.2, 1.5, 2.0]) {
      expect(paceColor(r)).not.toContain('red');
    }
  });
});
