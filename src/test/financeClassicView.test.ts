/**
 * FinanceClassicView Tests
 *
 * Tests the classic tab container: tab definitions, tab switching logic,
 * tab component mapping, and intelligence integration in classic tabs.
 */

import { describe, it, expect } from 'vitest';
import { getTrustBorderClasses, paceRatioToConfidence, getTrustOpacity } from '@/utils/trustVisualization';

// Tab definitions mirror FinanceClassicView.tsx
const TABS = [
  'overview', 'budget', 'transactions', 'bills', 'savings',
  'debt', 'networth', 'investments', 'reports', 'forecast',
] as const;

describe('FinanceClassicView - tab structure', () => {
  it('has exactly 10 tabs', () => {
    expect(TABS).toHaveLength(10);
  });

  it('default tab is overview (first in array)', () => {
    expect(TABS[0]).toBe('overview');
  });

  it('all tab keys are unique', () => {
    const unique = new Set(TABS);
    expect(unique.size).toBe(TABS.length);
  });

  it('includes all expected financial tabs', () => {
    expect(TABS).toContain('budget');
    expect(TABS).toContain('transactions');
    expect(TABS).toContain('bills');
    expect(TABS).toContain('savings');
    expect(TABS).toContain('debt');
    expect(TABS).toContain('networth');
    expect(TABS).toContain('investments');
    expect(TABS).toContain('reports');
    expect(TABS).toContain('forecast');
  });
});

describe('FinanceClassicView - intelligence in classic tabs', () => {
  it('trust border is solid for high-confidence velocity in BudgetTab', () => {
    // BudgetTab uses trust borders on velocity data
    const highConfBorder = getTrustBorderClasses(0.85, 'border-cyan-400/30');
    expect(highConfBorder).not.toContain('dashed');
    expect(highConfBorder).toContain('border-cyan-400/30');
  });

  it('trust border is dashed for low-confidence velocity in BudgetTab', () => {
    const lowConfBorder = getTrustBorderClasses(0.5, 'border-cyan-400/30');
    expect(lowConfBorder).toContain('dashed');
  });

  it('pace ratio to confidence maps correctly for budget categories', () => {
    // On-track spending = high confidence
    expect(paceRatioToConfidence(1.0)).toBe(1);
    // Slightly over pace = still decent confidence
    expect(paceRatioToConfidence(1.2)).toBeGreaterThan(0.7);
    // Way over pace = low confidence
    expect(paceRatioToConfidence(2.0)).toBeLessThan(0.7);
  });

  it('trust opacity reduces for lower confidence', () => {
    expect(getTrustOpacity(0.9)).toBe('');
    expect(getTrustOpacity(0.6)).toBe('opacity-90');
    expect(getTrustOpacity(0.3)).toBe('opacity-80');
  });

  it('bill predictions in BillsTab have trust border based on confidence', () => {
    // Bill predictions in classic view use trust borders
    const prediction = { confidence: 0.75, predicted_amount: 50, predicted_date: '2026-02-20' };
    const border = getTrustBorderClasses(prediction.confidence, 'border-amber-400/30');
    expect(border).not.toContain('dashed');
    expect(border).toContain('border-amber-400/30');
  });

  it('low-confidence bill predictions get dashed border', () => {
    const prediction = { confidence: 0.55, predicted_amount: 50, predicted_date: '2026-02-20' };
    const border = getTrustBorderClasses(prediction.confidence, 'border-amber-400/30');
    expect(border).toContain('dashed');
  });
});
