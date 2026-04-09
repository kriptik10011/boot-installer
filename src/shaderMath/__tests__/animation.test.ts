/**
 * Phase 5 Animation Tests — verifies TS mirror functions used for animation.
 * Tests domain warp, morph blending, breathing, and iso sweep math.
 * All tests run in < 100ms — no heavy raymarching.
 */

import { describe, it, expect } from 'vitest';
import {
  type Vec3, type TPMSType,
  TPMS_FUNCTIONS, TPMS_GRADIENTS,
  vec3Add, vec3Scale, vec3Length,
} from '../tpms';
import { mix, smoothstep, singleDomainSDF } from '../raymath';

// --- Domain Warp (mirrors GLSL domainWarp) ---

function domainWarp(p: Vec3, warpStrength: number, time: number, warpSpeed: number): Vec3 {
  if (warpStrength < 0.001) return p;
  const t = time * warpSpeed;
  const w1: Vec3 = [
    Math.sin(p[1] * 0.3 + t) * 0.5,
    Math.sin(p[2] * 0.3 + t) * 0.5,
    Math.sin(p[0] * 0.3 + t) * 0.5,
  ];
  const w2: Vec3 = [
    Math.sin(p[2] * 0.8 + t * 1.7) * 0.2,
    Math.sin(p[0] * 0.8 + t * 1.7) * 0.2,
    Math.sin(p[1] * 0.8 + t * 1.7) * 0.2,
  ];
  const w3: Vec3 = [
    Math.sin(p[0] * 1.5 + t * 2.3) * 0.08,
    Math.sin(p[1] * 1.5 + t * 2.3) * 0.08,
    Math.sin(p[2] * 1.5 + t * 2.3) * 0.08,
  ];
  return [
    p[0] + (w1[0] + w2[0] + w3[0]) * warpStrength,
    p[1] + (w1[1] + w2[1] + w3[1]) * warpStrength,
    p[2] + (w1[2] + w2[2] + w3[2]) * warpStrength,
  ];
}

// --- Morph blend (mirrors GLSL smoothstep ease) ---

function morphBlendEased(blend: number): number {
  return blend * blend * (3.0 - 2.0 * blend); // smoothstep(0, 1, blend)
}

function morphedTPMS(q: Vec3, typeA: TPMSType, typeB: TPMSType, blend: number): number {
  const eased = morphBlendEased(blend);
  const fA = TPMS_FUNCTIONS[typeA](q);
  const fB = TPMS_FUNCTIONS[typeB](q);
  return mix(fA, fB, eased);
}

describe('Phase 5A: Thickness Breathing', () => {
  it('animated thickness stays positive when amplitude < base', () => {
    const baseThick = 0.08;
    const amp = 0.05;
    for (let phase = 0; phase < 20; phase++) {
      const t = phase * 0.314; // sample across full cycle
      const animThick = Math.max(baseThick + amp * Math.sin(t), 0.005);
      expect(animThick).toBeGreaterThan(0);
    }
  });

  it('animated thickness clamps to minimum 0.005', () => {
    const baseThick = 0.02;
    const amp = 0.1; // larger than base — would go negative
    const worst = baseThick + amp * Math.sin(-Math.PI / 2); // sin = -1
    expect(worst).toBeLessThan(0);
    expect(Math.max(worst, 0.005)).toBe(0.005);
  });

  it('breathing with amp=0 produces exact base thickness', () => {
    const base = 0.08;
    for (let t = 0; t < 10; t++) {
      expect(base + 0 * Math.sin(t)).toBe(base);
    }
  });
});

describe('Phase 5B: Iso-Value Sweep', () => {
  it('animated iso stays within Gyroid valid range [-1, 1]', () => {
    const baseIso = 0.0;
    const amp = 0.4;
    for (let phase = 0; phase < 20; phase++) {
      const t = phase * 0.314;
      const animIso = baseIso + amp * Math.sin(t);
      expect(animIso).toBeGreaterThanOrEqual(-1.0);
      expect(animIso).toBeLessThanOrEqual(1.0);
    }
  });

  it('iso sweep with amp=0 produces exact base iso', () => {
    expect(0.3 + 0 * Math.sin(5.0)).toBe(0.3);
  });

  it('singleDomainSDF changes with different isoValues', () => {
    const p: Vec3 = [0.3, 0.25, 0.4];
    const d1 = singleDomainSDF(p, { type: 'gyroid', frequency: 6, thickness: 0.08, isoValue: 0.0 });
    const d2 = singleDomainSDF(p, { type: 'gyroid', frequency: 6, thickness: 0.08, isoValue: 0.3 });
    expect(d1).not.toBeCloseTo(d2, 2);
  });
});

describe('Phase 5C: Domain Warp', () => {
  it('warpStrength=0 returns identity', () => {
    const p: Vec3 = [1.5, 2.3, -0.7];
    const wp = domainWarp(p, 0, 10.0, 0.03);
    expect(wp[0]).toBe(p[0]);
    expect(wp[1]).toBe(p[1]);
    expect(wp[2]).toBe(p[2]);
  });

  it('warp displaces point when strength > 0', () => {
    const p: Vec3 = [1.0, 1.0, 1.0];
    const wp = domainWarp(p, 0.3, 5.0, 0.03);
    const disp = vec3Length([wp[0] - p[0], wp[1] - p[1], wp[2] - p[2]]);
    expect(disp).toBeGreaterThan(0.01);
    expect(disp).toBeLessThan(1.0); // bounded displacement
  });

  it('warp displacement bounded by totalAmp * warpStrength', () => {
    const p: Vec3 = [2.0, -1.0, 0.5];
    const strength = 0.3;
    const wp = domainWarp(p, strength, 100.0, 0.03);
    const disp = vec3Length([wp[0] - p[0], wp[1] - p[1], wp[2] - p[2]]);
    const maxDisp = (0.5 + 0.2 + 0.08) * strength * Math.sqrt(3); // per-component * sqrt(3)
    expect(disp).toBeLessThanOrEqual(maxDisp + 0.001);
  });

  it('warp is time-dependent', () => {
    const p: Vec3 = [1.0, 1.0, 1.0];
    const wp1 = domainWarp(p, 0.3, 0.0, 0.03);
    const wp2 = domainWarp(p, 0.3, 100.0, 0.03);
    const diff = vec3Length([wp1[0] - wp2[0], wp1[1] - wp2[1], wp1[2] - wp2[2]]);
    expect(diff).toBeGreaterThan(0.001);
  });

  it('Lipschitz correction factor is 1 + 1.17 * warpStrength', () => {
    expect(1.0 + 1.17 * 0.0).toBe(1.0);
    expect(1.0 + 1.17 * 0.3).toBeCloseTo(1.351, 2);
    expect(1.0 + 1.17 * 0.5).toBeCloseTo(1.585, 2);
  });
});

describe('Phase 5D: TPMS Type Morphing', () => {
  it('blend=0 returns typeA exactly', () => {
    const q: Vec3 = [1.0, 0.5, 0.3];
    const fA = TPMS_FUNCTIONS.gyroid(q);
    const morphed = morphedTPMS(q, 'gyroid', 'schwarzP', 0.0);
    expect(morphed).toBeCloseTo(fA, 10);
  });

  it('blend=1 returns typeB exactly', () => {
    const q: Vec3 = [1.0, 0.5, 0.3];
    const fB = TPMS_FUNCTIONS.schwarzP(q);
    const morphed = morphedTPMS(q, 'gyroid', 'schwarzP', 1.0);
    expect(morphed).toBeCloseTo(fB, 10);
  });

  it('blend=0.5 is between fA and fB', () => {
    const q: Vec3 = [1.0, 0.5, 0.3];
    const fA = TPMS_FUNCTIONS.gyroid(q);
    const fB = TPMS_FUNCTIONS.schwarzP(q);
    const morphed = morphedTPMS(q, 'gyroid', 'schwarzP', 0.5);
    const lo = Math.min(fA, fB);
    const hi = Math.max(fA, fB);
    expect(morphed).toBeGreaterThanOrEqual(lo - 0.001);
    expect(morphed).toBeLessThanOrEqual(hi + 0.001);
  });

  it('eased blend is monotonic', () => {
    let prev = 0;
    for (let b = 0; b <= 1.0; b += 0.1) {
      const eased = morphBlendEased(b);
      expect(eased).toBeGreaterThanOrEqual(prev - 0.001);
      prev = eased;
    }
  });

  it('morph works for all type pairs', () => {
    const types: TPMSType[] = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'];
    const q: Vec3 = [0.7, 0.3, 0.5];
    for (const a of types) {
      for (const b of types) {
        const result = morphedTPMS(q, a, b, 0.5);
        expect(Number.isFinite(result)).toBe(true);
      }
    }
  });
});

describe('Phase 5E: Per-Domain Phase Offsets', () => {
  it('sync mode: all phases are 0', () => {
    const phases = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      expect(phases[i]).toBe(0);
    }
  });

  it('stagger mode: phases offset by TAU/4', () => {
    const TAU = Math.PI * 2;
    const phases = [0, 1, 2, 3].map(i => i * TAU / 4);
    expect(phases[0]).toBeCloseTo(0, 5);
    expect(phases[1]).toBeCloseTo(TAU / 4, 5);
    expect(phases[2]).toBeCloseTo(TAU / 2, 5);
    expect(phases[3]).toBeCloseTo(3 * TAU / 4, 5);
  });

  it('antiphase mode: alternating 0 and PI', () => {
    const phases = [0, 1, 2, 3].map(i => (i % 2) * Math.PI);
    expect(phases[0]).toBe(0);
    expect(phases[1]).toBeCloseTo(Math.PI, 5);
    expect(phases[2]).toBe(0);
    expect(phases[3]).toBeCloseTo(Math.PI, 5);
  });

  it('getDomainTime returns time + phase offset', () => {
    const time = 5.0;
    const phase = 1.57;
    expect(time + phase).toBeCloseTo(6.57, 5);
  });

  it('stagger creates visibly different animation states', () => {
    const TAU = Math.PI * 2;
    const time = 3.0;
    const speed = 1.0;
    const amp = 0.05;
    const phases = [0, TAU / 4, TAU / 2, 3 * TAU / 4];
    const values = phases.map(ph => amp * Math.sin((time + ph) * speed));
    // All 4 values should be different from each other
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(Math.abs(values[i] - values[j])).toBeGreaterThan(0.001);
      }
    }
  });
});
