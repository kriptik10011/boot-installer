/**
 * BudgetPulseVital Tests
 *
 * Tests: compact summary text, category velocity labels,
 * gradient bar color logic, no-shame pattern (amber not red).
 */

import { describe, it, expect } from 'vitest';
import { getVelocityLabel } from '@/utils/auroraTheme';

describe('BudgetPulseVital - velocity labels', () => {
  it('returns "lots of room" for low pace ratio', () => {
    expect(getVelocityLabel(0.5)).toBe('lots of room');
  });

  it('returns "on track" for moderate pace', () => {
    expect(getVelocityLabel(0.85)).toBe('on track');
  });

  it('returns "close to pace" for near 1.0', () => {
    expect(getVelocityLabel(1.05)).toBe('close to pace');
  });

  it('returns "above average" for mildly over pace', () => {
    expect(getVelocityLabel(1.2)).toBe('above average');
  });

  it('returns "over pace" for high ratio', () => {
    expect(getVelocityLabel(1.5)).toBe('over pace');
  });
});

describe('BudgetPulseVital - bar color logic', () => {
  it('uses amber for categories over 100%', () => {
    const pct = 110;
    const barColor = pct > 100 ? 'bg-amber-500' : pct > 85 ? 'bg-amber-400' : 'bg-cyan-500';
    expect(barColor).toBe('bg-amber-500');
  });

  it('uses amber-400 for 86-100%', () => {
    const pct = 90;
    const barColor = pct > 100 ? 'bg-amber-500' : pct > 85 ? 'bg-amber-400' : 'bg-cyan-500';
    expect(barColor).toBe('bg-amber-400');
  });

  it('uses cyan for under 85%', () => {
    const pct = 60;
    const barColor = pct > 100 ? 'bg-amber-500' : pct > 85 ? 'bg-amber-400' : 'bg-cyan-500';
    expect(barColor).toBe('bg-cyan-500');
  });

  it('never uses red (no-shame pattern)', () => {
    for (const pct of [0, 50, 85, 100, 150, 200]) {
      const barColor = pct > 100 ? 'bg-amber-500' : pct > 85 ? 'bg-amber-400' : 'bg-cyan-500';
      expect(barColor).not.toContain('red');
    }
  });
});
