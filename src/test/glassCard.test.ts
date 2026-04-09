/**
 * GlassCard Unit Tests
 *
 * Tests the data transformation logic used by GlassCard — gradient fills,
 * trust borders, velocity labels. Does NOT test rendering (no DOM needed).
 */

import { describe, it, expect } from 'vitest';
import { getGradientFillClasses, getGradientFillWidth, getVelocityLabel } from '@/utils/auroraTheme';
import { getTrustBorderClasses, paceRatioToConfidence } from '@/utils/trustVisualization';

describe('GlassCard gradient fill logic', () => {
  it('returns cool gradient for under-budget categories', () => {
    const classes = getGradientFillClasses(0.3);
    expect(classes).toContain('cyan');
  });

  it('returns warm gradient for near-budget categories', () => {
    const classes = getGradientFillClasses(0.75);
    expect(classes).toContain('amber');
  });

  it('returns hot fill for over-budget categories', () => {
    const classes = getGradientFillClasses(1.1);
    expect(classes).toContain('rose');
  });

  it('returns correct fill width from spend ratio', () => {
    expect(getGradientFillWidth(0.65)).toBe('65%');
    expect(getGradientFillWidth(0)).toBe('0%');
    expect(getGradientFillWidth(1.5)).toBe('100%');
  });
});

describe('GlassCard trust border logic', () => {
  it('uses solid border for high-confidence velocity', () => {
    const confidence = paceRatioToConfidence(1.0); // perfect pace = 1.0 confidence
    const classes = getTrustBorderClasses(confidence, 'border-white/10');
    expect(classes).not.toContain('dashed');
  });

  it('uses dashed border for low-confidence velocity', () => {
    const confidence = paceRatioToConfidence(2.0); // extreme pace = low confidence
    const classes = getTrustBorderClasses(confidence, 'border-white/10');
    expect(classes).toContain('dashed');
  });
});

describe('GlassCard velocity labels', () => {
  it('maps pace ratios to human-readable labels', () => {
    expect(getVelocityLabel(0.5)).toBe('lots of room');
    expect(getVelocityLabel(0.85)).toBe('on track');
    expect(getVelocityLabel(1.0)).toBe('close to pace');
    expect(getVelocityLabel(1.2)).toBe('above average');
    expect(getVelocityLabel(1.5)).toBe('over pace');
  });
});
