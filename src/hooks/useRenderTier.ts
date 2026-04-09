/**
 * useRenderTier — GPU capability detection for adaptive rendering.
 *
 * Detects GPU class at mount time and returns a rendering tier:
 *   0 = CSS only (no WebGL context available)
 *   1 = minimal (MAX_STEPS=32, no post-processing) — integrated GPUs
 *   2 = standard (MAX_STEPS=64, animation enabled) — mid-range discrete
 *   3 = full fidelity (MAX_STEPS=128, bloom + SSAO) — high-end discrete
 *
 * Detection runs once on mount via a throwaway canvas context.
 * The tier value is stable for the lifetime of the component.
 */

import { useState, useEffect } from 'react';

export type RenderTier = 0 | 1 | 2 | 3;

/** Max raymarching steps per tier — surface mode needs enough steps for
 *  zero-crossing detection. Too few = missed TPMS walls = stippling/noise.
 *  GPU cost is NOT from step count — it's from continuous vsync rendering. */
export const TIER_MAX_STEPS: Record<RenderTier, number> = {
  0: 0,
  1: 32,
  2: 64,
  3: 128,
};

export function useRenderTier(): RenderTier {
  const [tier, setTier] = useState<RenderTier>(2); // safe default while detecting

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (!gl) {
      setTier(0);
      return;
    }

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';

    // Integrated graphics: conservative tier — avoid heavy SDF raymarching
    const isIntegrated = /intel|mali|adreno|apple m[12]/i.test(renderer);
    if (isIntegrated) {
      setTier(1);
      // Clean up throwaway context
      const loseExt = gl.getExtension('WEBGL_lose_context');
      loseExt?.loseContext();
      return;
    }

    // Discrete GPU benchmark: simple clear loop, measure frame budget
    const start = performance.now();
    for (let i = 0; i < 100; i++) gl.clear(gl.COLOR_BUFFER_BIT);
    gl.finish(); // force GPU sync
    const elapsed = performance.now() - start;

    // RTX 4080/3080 class: <5ms → tier 3
    // Mid-range discrete: 5–12ms → tier 2
    // Low-end discrete: >12ms → tier 1
    if (elapsed < 5) setTier(3);
    else if (elapsed < 12) setTier(2);
    else setTier(1);

    // Clean up throwaway context
    const loseExt = gl.getExtension('WEBGL_lose_context');
    loseExt?.loseContext();
  }, []);

  return tier;
}
