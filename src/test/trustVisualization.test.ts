/**
 * Trust Visualization Utility Tests
 *
 * Verifies Glass Box principle: solid borders for high confidence,
 * dashed borders for low confidence, across all AI-generated content.
 */

import { describe, it, expect } from 'vitest';
import {
  getTrustBorderClasses,
  getTrustOpacity,
  paceRatioToConfidence,
} from '@/utils/trustVisualization';

describe('getTrustBorderClasses', () => {
  it('returns solid border for high confidence (>=0.7)', () => {
    const result = getTrustBorderClasses(0.7, 'border-cyan-500/30');
    expect(result).toBe('border border-cyan-500/30');
    expect(result).not.toContain('dashed');
  });

  it('returns solid border for 100% confidence', () => {
    const result = getTrustBorderClasses(1.0, 'border-emerald-500/20');
    expect(result).toBe('border border-emerald-500/20');
    expect(result).not.toContain('dashed');
  });

  it('returns dashed border for low confidence (<0.7)', () => {
    const result = getTrustBorderClasses(0.6, 'border-slate-700/50');
    expect(result).toContain('border-dashed');
    expect(result).toContain('opacity-90');
    expect(result).toContain('border-slate-700/50');
  });

  it('returns dashed border at minimum threshold (0.5)', () => {
    const result = getTrustBorderClasses(0.5, 'border-amber-500/30');
    expect(result).toContain('border-dashed');
  });

  it('works with empty base color', () => {
    const solid = getTrustBorderClasses(0.8, '');
    expect(solid).toBe('border ');

    const dashed = getTrustBorderClasses(0.4, '');
    expect(dashed).toContain('border-dashed');
  });
});

describe('getTrustOpacity', () => {
  it('returns empty string for high confidence', () => {
    expect(getTrustOpacity(0.7)).toBe('');
    expect(getTrustOpacity(1.0)).toBe('');
  });

  it('returns opacity-90 for medium confidence', () => {
    expect(getTrustOpacity(0.5)).toBe('opacity-90');
    expect(getTrustOpacity(0.65)).toBe('opacity-90');
  });

  it('returns opacity-80 for low confidence', () => {
    expect(getTrustOpacity(0.3)).toBe('opacity-80');
    expect(getTrustOpacity(0.49)).toBe('opacity-80');
  });
});

describe('paceRatioToConfidence', () => {
  it('returns 1.0 for perfect pace (1.0)', () => {
    expect(paceRatioToConfidence(1.0)).toBe(1);
  });

  it('returns lower confidence for over-pace', () => {
    const result = paceRatioToConfidence(1.5);
    expect(result).toBeLessThan(1);
    expect(result).toBeGreaterThan(0);
  });

  it('returns lower confidence for under-pace', () => {
    const result = paceRatioToConfidence(0.5);
    expect(result).toBeLessThan(1);
    expect(result).toBeGreaterThan(0);
  });

  it('clamps to 0 for extreme over-pace', () => {
    expect(paceRatioToConfidence(3.0)).toBe(0);
  });

  it('symmetric around 1.0', () => {
    const over = paceRatioToConfidence(1.4);
    const under = paceRatioToConfidence(0.6);
    expect(over).toBe(under);
  });
});
