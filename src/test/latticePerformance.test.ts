/**
 * Lattice Performance Regression Tests
 *
 * Codifies GPU performance budgets so future changes can't regress.
 * These test the JS-side contracts (step counts, DPR, frame throttling).
 *
 * KEY INSIGHT: GPU at 96% is NOT from shader cost — it's from continuous
 * rendering at vsync. The fix is frame throttling, NOT reducing visual quality.
 */

import { describe, it, expect } from 'vitest';
import { TIER_MAX_STEPS, type RenderTier } from '@/hooks/useRenderTier';
import { LATTICE_DEFAULTS } from '@/components/finance/radial/utils/latticeShader';

// ── Step Budget Contracts ──────────────────────────────────────────────────
// Steps MUST be high enough for surface mode zero-crossing detection.
// Too few steps = missed walls = visual noise/stippling.

describe('TIER_MAX_STEPS — raymarching step budget', () => {
  it('tier 0 should render no steps (CSS fallback)', () => {
    expect(TIER_MAX_STEPS[0]).toBe(0);
  });

  it('tier 1 (integrated GPU) should use ≥24 and ≤48 steps', () => {
    expect(TIER_MAX_STEPS[1]).toBeGreaterThanOrEqual(24);
    expect(TIER_MAX_STEPS[1]).toBeLessThanOrEqual(48);
  });

  it('tier 2 (mid-range) should use ≥48 and ≤80 steps', () => {
    expect(TIER_MAX_STEPS[2]).toBeGreaterThanOrEqual(48);
    expect(TIER_MAX_STEPS[2]).toBeLessThanOrEqual(80);
  });

  it('tier 3 (high-end) should use ≥80 and ≤160 steps', () => {
    expect(TIER_MAX_STEPS[3]).toBeGreaterThanOrEqual(80);
    expect(TIER_MAX_STEPS[3]).toBeLessThanOrEqual(160);
  });

  it('should define exactly 4 tiers (0-3)', () => {
    const keys = Object.keys(TIER_MAX_STEPS).map(Number);
    expect(keys).toEqual([0, 1, 2, 3]);
  });

  it('tiers should be monotonically increasing', () => {
    const tiers: RenderTier[] = [0, 1, 2, 3];
    for (let i = 1; i < tiers.length; i++) {
      expect(TIER_MAX_STEPS[tiers[i]]).toBeGreaterThanOrEqual(TIER_MAX_STEPS[tiers[i - 1]]);
    }
  });
});

// ── Shader Defaults Contracts ──────────────────────────────────────────────
// These are initial values only — useFrame overwrites them from prefs every frame.
// But they define the visual baseline before prefs load.

describe('LATTICE_DEFAULTS — shader baseline values', () => {
  // LATTICE_DEFAULTS are flat values (unwrapped from SHADER_LAB_DEFAULTS { value: X } format)
  it('default maxSteps should be ≥64', () => {
    expect(LATTICE_DEFAULTS.uMaxSteps as number).toBeGreaterThanOrEqual(64);
  });

  it('default domain frequencies should be reasonable (3-20)', () => {
    const freqs = LATTICE_DEFAULTS.uDomainFreq as number[];
    for (const f of freqs) {
      expect(f).toBeGreaterThanOrEqual(3);
      expect(f).toBeLessThanOrEqual(20);
    }
  });

  it('has 4 domain types configured', () => {
    const types = LATTICE_DEFAULTS.uDomainType as number[];
    expect(types).toHaveLength(4);
  });
});

// ── Frame Throttle Contract ────────────────────────────────────────────────
// The REAL perf fix: throttle rendering to ~30fps, not reduce visual quality.

describe('Frame throttling — TARGET_FPS export', () => {
  it('TARGET_FPS should be exported and between 24-30', async () => {
    const mod = await import('@/components/finance/radial/BackgroundLattice');
    expect(mod.TARGET_FPS).toBeDefined();
    expect(mod.TARGET_FPS).toBeGreaterThanOrEqual(24);
    expect(mod.TARGET_FPS).toBeLessThanOrEqual(30);
  });
});

// ── DPR Contract ───────────────────────────────────────────────────────────
// DPR must be ≥0.75 — lower causes aliasing noise on thin TPMS walls.

describe('DPR capping — visual quality floor', () => {
  it('LATTICE_DPR should be exported and ≥0.75', async () => {
    const mod = await import('@/components/finance/radial/BackgroundLattice');
    expect(mod.LATTICE_DPR).toBeDefined();
    expect(mod.LATTICE_DPR).toBeGreaterThanOrEqual(0.75);
  });
});

// ── Finance Hook staleTime Contracts ───────────────────────────────────────

describe('Finance hooks — staleTime prevents refetch spam', () => {
  it('FINANCE_STALE_TIME should be exported and ≥60 seconds', async () => {
    const mod = await import('@/hooks/useFinanceV2');
    expect(mod.FINANCE_STALE_TIME).toBeDefined();
    expect(mod.FINANCE_STALE_TIME).toBeGreaterThanOrEqual(60_000);
  });
});
