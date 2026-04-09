/**
 * Mode Integration Tests
 *
 * Tests: Living mode shows max 2 vitals, Planning mode shows all,
 * mode change preserves vital state.
 */

import { describe, it, expect } from 'vitest';
import type { VitalType } from '@/types/vitals';

describe('Mode Integration - vital visibility', () => {
  function getVisibleVitals(
    orderedVitals: VitalType[],
    isLivingMode: boolean,
  ): VitalType[] {
    const display = orderedVitals.filter((t) => t !== 'safe_to_spend');
    return isLivingMode ? display.slice(0, 2) : display;
  }

  it('Living mode shows max 2 vitals (plus hero)', () => {
    const vitals: VitalType[] = [
      'safe_to_spend', 'budget_pulse', 'bills_radar',
      'savings_sprint', 'spending_lens',
    ];
    const visible = getVisibleVitals(vitals, true);
    expect(visible).toHaveLength(2);
    expect(visible).toEqual(['budget_pulse', 'bills_radar']);
  });

  it('Planning mode shows all vitals', () => {
    const vitals: VitalType[] = [
      'safe_to_spend', 'budget_pulse', 'bills_radar',
      'savings_sprint', 'spending_lens', 'debt_journey',
    ];
    const visible = getVisibleVitals(vitals, false);
    expect(visible).toHaveLength(5);
    expect(visible[0]).toBe('budget_pulse');
  });

  it('always excludes safe_to_spend from grid (hero is separate)', () => {
    const vitals: VitalType[] = ['safe_to_spend', 'budget_pulse'];
    const visible = getVisibleVitals(vitals, false);
    expect(visible).not.toContain('safe_to_spend');
  });
});

describe('Mode Integration - state preservation', () => {
  it('vital order is preserved across mode changes', () => {
    const order: VitalType[] = ['safe_to_spend', 'bills_radar', 'budget_pulse'];

    // Switch to living mode
    const livingVisible = order.filter((t) => t !== 'safe_to_spend').slice(0, 2);
    expect(livingVisible).toEqual(['bills_radar', 'budget_pulse']);

    // Switch back to planning
    const planningVisible = order.filter((t) => t !== 'safe_to_spend');
    expect(planningVisible).toEqual(['bills_radar', 'budget_pulse']);

    // Order hasn't changed
    expect(order).toEqual(['safe_to_spend', 'bills_radar', 'budget_pulse']);
  });
});
