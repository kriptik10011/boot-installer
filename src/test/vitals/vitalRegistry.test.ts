/**
 * Vital Registry Tests
 *
 * Verifies: all 9 types registered, smart defaults, labels/descriptions,
 * metadata completeness, safe_to_spend non-removable, data key mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  VITAL_REGISTRY,
  ALL_VITAL_TYPES,
  getDefaultVitals,
  getVitalMetadata,
} from '@/components/finance/vitals/vitalRegistry';
import type { DataAvailability } from '@/types/vitals';

describe('vitalRegistry', () => {
  it('registers all 9 vital types', () => {
    expect(ALL_VITAL_TYPES).toHaveLength(9);
    for (const type of ALL_VITAL_TYPES) {
      expect(VITAL_REGISTRY[type]).toBeDefined();
    }
  });

  it('every vital has label and description', () => {
    for (const type of ALL_VITAL_TYPES) {
      const meta = VITAL_REGISTRY[type];
      expect(meta.label).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.label.length).toBeGreaterThan(2);
      expect(meta.description.length).toBeGreaterThan(5);
    }
  });

  it('safe_to_spend is not removable', () => {
    const s2s = VITAL_REGISTRY.safe_to_spend;
    expect(s2s.removable).toBe(false);
  });

  it('smart defaults: empty data returns only safe_to_spend', () => {
    const emptyData: DataAvailability = {
      hasBudget: false,
      hasBills: false,
      hasDebt: false,
      hasSavings: false,
      hasInvestments: false,
      hasNetWorth: false,
    };
    const defaults = getDefaultVitals(emptyData);
    expect(defaults).toEqual(['safe_to_spend']);
  });

  it('smart defaults: budget data adds budget_pulse and spending_lens', () => {
    const data: DataAvailability = {
      hasBudget: true,
      hasBills: false,
      hasDebt: false,
      hasSavings: false,
      hasInvestments: false,
      hasNetWorth: false,
    };
    const defaults = getDefaultVitals(data);
    expect(defaults).toContain('safe_to_spend');
    expect(defaults).toContain('budget_pulse');
    expect(defaults).toContain('spending_lens');
  });

  it('smart defaults: full data includes all except cash_flow', () => {
    const data: DataAvailability = {
      hasBudget: true,
      hasBills: true,
      hasDebt: true,
      hasSavings: true,
      hasInvestments: true,
      hasNetWorth: true,
    };
    const defaults = getDefaultVitals(data);
    expect(defaults).toContain('safe_to_spend');
    expect(defaults).toContain('budget_pulse');
    expect(defaults).toContain('bills_radar');
    expect(defaults).toContain('savings_sprint');
    expect(defaults).toContain('debt_journey');
    expect(defaults).toContain('net_worth');
    expect(defaults).toContain('investment_pulse');
    // cash_flow has null dataKey — not auto-added
    expect(defaults).not.toContain('cash_flow');
  });

  it('getVitalMetadata returns correct type', () => {
    const meta = getVitalMetadata('bills_radar');
    expect(meta.type).toBe('bills_radar');
    expect(meta.label).toBe('Bills Radar');
  });
});
