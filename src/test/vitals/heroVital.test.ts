/**
 * HeroVital Tests
 *
 * Tests: amount rendering, pace narrative, health gradient, null fallback.
 */

import { describe, it, expect } from 'vitest';
import { getNarrativeSentence } from '@/utils/auroraTheme';
import { getAuroraPaletteFromHealth } from '@/utils/auroraTheme';

describe('HeroVital - narrative logic', () => {
  it('returns comfortable narrative for low pace ratio', () => {
    const narrative = getNarrativeSentence(0.6, 12);
    expect(narrative).toContain('Comfortable');
    expect(narrative).toContain('12 days');
  });

  it('returns on track narrative for moderate pace', () => {
    const narrative = getNarrativeSentence(0.85, 10);
    expect(narrative).toContain('On track');
  });

  it('returns over pace for high ratio', () => {
    const narrative = getNarrativeSentence(1.5, 5);
    expect(narrative).toContain('Over pace');
  });

  it('returns period ended when daysLeft is 0', () => {
    expect(getNarrativeSentence(0.8, 0)).toBe('Period ended');
  });
});

describe('HeroVital - health palette', () => {
  it('maps healthy score to healthy palette', () => {
    const palette = getAuroraPaletteFromHealth(80);
    expect(palette.id).toBe('healthy');
  });

  it('maps low score to tight palette', () => {
    const palette = getAuroraPaletteFromHealth(35);
    expect(palette.id).toBe('tight');
  });

  it('maps very low score to over palette', () => {
    const palette = getAuroraPaletteFromHealth(20);
    expect(palette.id).toBe('over');
  });

  it('palette has heroGradient for gradient text', () => {
    const palette = getAuroraPaletteFromHealth(75);
    expect(palette.heroGradient).toContain('linear-gradient');
  });
});
