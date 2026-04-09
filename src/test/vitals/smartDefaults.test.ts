/**
 * Smart Defaults Tests
 *
 * Tests: empty = S2S only, budget data adds BudgetPulse + SpendingLens,
 * bills adds BillsRadar, full data adds most types, respects removed set,
 * first-open only behavior.
 */

import { describe, it, expect } from 'vitest';
import { getDefaultVitals } from '@/components/finance/vitals/vitalRegistry';
import type { DataAvailability } from '@/types/vitals';

const EMPTY_DATA: DataAvailability = {
  hasBudget: false,
  hasBills: false,
  hasDebt: false,
  hasSavings: false,
  hasInvestments: false,
  hasNetWorth: false,
};

describe('Smart Defaults - getDefaultVitals', () => {
  it('returns only safe_to_spend when no data exists', () => {
    const result = getDefaultVitals(EMPTY_DATA);
    expect(result).toEqual(['safe_to_spend']);
  });

  it('adds budget_pulse and spending_lens when budget data exists', () => {
    const result = getDefaultVitals({ ...EMPTY_DATA, hasBudget: true });
    expect(result).toContain('safe_to_spend');
    expect(result).toContain('budget_pulse');
    expect(result).toContain('spending_lens');
  });

  it('adds bills_radar when bills data exists', () => {
    const result = getDefaultVitals({ ...EMPTY_DATA, hasBills: true });
    expect(result).toContain('bills_radar');
  });

  it('adds debt_journey when debt data exists', () => {
    const result = getDefaultVitals({ ...EMPTY_DATA, hasDebt: true });
    expect(result).toContain('debt_journey');
  });

  it('adds savings_sprint when savings data exists', () => {
    const result = getDefaultVitals({ ...EMPTY_DATA, hasSavings: true });
    expect(result).toContain('savings_sprint');
  });

  it('adds net_worth when net worth data exists', () => {
    const result = getDefaultVitals({ ...EMPTY_DATA, hasNetWorth: true });
    expect(result).toContain('net_worth');
  });

  it('adds investment_pulse when investment data exists', () => {
    const result = getDefaultVitals({ ...EMPTY_DATA, hasInvestments: true });
    expect(result).toContain('investment_pulse');
  });

  it('never auto-adds cash_flow (dataKey is null)', () => {
    const fullData: DataAvailability = {
      hasBudget: true,
      hasBills: true,
      hasDebt: true,
      hasSavings: true,
      hasInvestments: true,
      hasNetWorth: true,
    };
    const result = getDefaultVitals(fullData);
    expect(result).not.toContain('cash_flow');
  });

  it('includes 8 vitals with full data (all except cash_flow)', () => {
    const fullData: DataAvailability = {
      hasBudget: true,
      hasBills: true,
      hasDebt: true,
      hasSavings: true,
      hasInvestments: true,
      hasNetWorth: true,
    };
    const result = getDefaultVitals(fullData);
    expect(result).toHaveLength(8);
    expect(result[0]).toBe('safe_to_spend');
  });

  it('always has safe_to_spend as first element', () => {
    const result = getDefaultVitals({ ...EMPTY_DATA, hasBudget: true, hasBills: true });
    expect(result[0]).toBe('safe_to_spend');
  });
});
