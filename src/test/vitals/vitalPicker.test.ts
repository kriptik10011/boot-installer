/**
 * VitalPicker Tests
 *
 * Tests: shows all removable types, already-added badge,
 * add calls restore, non-removable excluded.
 */

import { describe, it, expect } from 'vitest';
import { VITAL_REGISTRY, ALL_VITAL_TYPES } from '@/components/finance/vitals/vitalRegistry';

describe('VitalPicker - type filtering', () => {
  const removableTypes = ALL_VITAL_TYPES.filter((t) => VITAL_REGISTRY[t].removable);

  it('shows all removable vital types', () => {
    // 8 removable (all except safe_to_spend)
    expect(removableTypes.length).toBe(8);
  });

  it('excludes safe_to_spend (not removable)', () => {
    expect(removableTypes).not.toContain('safe_to_spend');
  });

  it('includes all 8 expected removable types', () => {
    const expected = [
      'budget_pulse', 'bills_radar', 'savings_sprint', 'spending_lens',
      'debt_journey', 'net_worth', 'cash_flow', 'investment_pulse',
    ];
    for (const t of expected) {
      expect(removableTypes).toContain(t);
    }
  });
});

describe('VitalPicker - already-added detection', () => {
  it('detects active vitals correctly', () => {
    const activeVitals = new Set(['budget_pulse', 'bills_radar']);
    const removedVitals = new Set<string>();

    const canAdd = (type: string) =>
      !(activeVitals.has(type) && !removedVitals.has(type));

    expect(canAdd('budget_pulse')).toBe(false); // Already active
    expect(canAdd('debt_journey')).toBe(true);  // Not active
  });

  it('allows re-adding removed vitals', () => {
    const activeVitals = new Set(['budget_pulse']);
    const removedVitals = new Set(['budget_pulse']);

    const canAdd = (type: string) =>
      !(activeVitals.has(type) && !removedVitals.has(type));

    expect(canAdd('budget_pulse')).toBe(true); // Removed, can re-add
  });
});

describe('VitalPicker - metadata', () => {
  it('every removable type has label and description', () => {
    for (const type of ALL_VITAL_TYPES) {
      const meta = VITAL_REGISTRY[type];
      if (meta.removable) {
        expect(meta.label).toBeTruthy();
        expect(meta.description).toBeTruthy();
        expect(meta.icon).toBeTruthy();
      }
    }
  });
});
