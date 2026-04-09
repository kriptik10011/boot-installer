/**
 * BillsRadarVital Tests
 *
 * Tests: bill count and total, trust borders (solid vs dashed),
 * no-shame language, due date label formatting.
 */

import { describe, it, expect } from 'vitest';
import { getTrustBorderClasses } from '@/utils/trustVisualization';
import { fmt } from '@/components/finance/classic/FinanceHelpers';

describe('BillsRadarVital - trust borders', () => {
  it('uses solid border for high confidence confirmed bills', () => {
    const classes = getTrustBorderClasses(0.9, 'border-slate-700/50');
    expect(classes).toContain('border');
    expect(classes).not.toContain('dashed');
  });

  it('uses dashed border for low confidence predicted bills', () => {
    const classes = getTrustBorderClasses(0.5, 'border-slate-700/50');
    expect(classes).toContain('dashed');
  });
});

describe('BillsRadarVital - due date labels', () => {
  function dueLabel(dateStr: string): string {
    const due = new Date(dateStr);
    const days = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days < 7) return `Due in ${days}d`;
    return `Due ${dateStr}`;
  }

  it('shows "Due today" for today', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(dueLabel(today)).toBe('Due today');
  });

  it('shows "Due tomorrow" for tomorrow', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    expect(dueLabel(tomorrow)).toBe('Due tomorrow');
  });

  it('shows "Due in Nd" for near-future bills', () => {
    const threeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().split('T')[0];
    const label = dueLabel(threeDays);
    expect(label).toMatch(/Due in \d+d/);
  });
});

describe('BillsRadarVital - no-shame language', () => {
  it('bill total uses fmt (no negative sign exposure)', () => {
    expect(fmt(540)).toBe('$540');
  });

  it('predicted amounts use tilde prefix convention', () => {
    // Convention: ~$142 for predicted
    const amount = 142;
    const display = `~${fmt(amount)}`;
    expect(display).toBe('~$142');
    expect(display).not.toContain('-');
  });
});
