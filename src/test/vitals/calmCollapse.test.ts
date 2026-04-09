/**
 * Calm Collapse Tests
 *
 * Tests: healthy finances trigger collapse, anomaly prevents,
 * urgent bill prevents, threshold boundary.
 */

import { describe, it, expect } from 'vitest';
import { shouldCalmCollapse } from '@/components/finance/vitals/FinanceLivingView';

describe('Calm Collapse - shouldCalmCollapse', () => {
  it('triggers when healthScore >= 70, no urgent bills, no anomalies', () => {
    expect(shouldCalmCollapse(75, false, false)).toBe(true);
  });

  it('triggers at exactly 70 health score', () => {
    expect(shouldCalmCollapse(70, false, false)).toBe(true);
  });

  it('does NOT trigger when health score < 70', () => {
    expect(shouldCalmCollapse(65, false, false)).toBe(false);
  });

  it('does NOT trigger when urgent bill exists', () => {
    expect(shouldCalmCollapse(80, true, false)).toBe(false);
  });

  it('does NOT trigger when anomaly exists', () => {
    expect(shouldCalmCollapse(85, false, true)).toBe(false);
  });

  it('does NOT trigger when both urgent bill and anomaly exist', () => {
    expect(shouldCalmCollapse(90, true, true)).toBe(false);
  });

  it('does NOT trigger when health is 0 (no data)', () => {
    expect(shouldCalmCollapse(0, false, false)).toBe(false);
  });

  it('triggers at high health score (100)', () => {
    expect(shouldCalmCollapse(100, false, false)).toBe(true);
  });
});
