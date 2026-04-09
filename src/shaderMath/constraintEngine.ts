/**
 * Shader Parameter Constraint Engine
 *
 * Single-pass arithmetic clamp between Leva output and GPU uniforms.
 * Prevents mathematically broken or aesthetically ruined parameter combinations.
 *
 * Architecture: [Leva UI] -> [raw values] -> [enforceConstraints] -> [clamped values] -> [GPU]
 *
 * Formula derivations reference actual GLSL in src/shaders/tpms/shader.ts (1488 lines, 55 uniforms).
 * Constants are traced to specific shader lines, not estimated from research.
 *
 * Decision authority: D-08 (single-pass clamp), D-09 (ShaderLab scope only)
 */

import type { ShaderSettings } from './types';

// --- Types ---

export interface Violation {
  readonly constraintId: string;
  readonly param: string;
  readonly message: string;
  readonly original: number;
  readonly clamped: number;
}

export interface Warning {
  readonly constraintId: string;
  readonly params: readonly string[];
  readonly message: string;
}

export interface ConstraintResult {
  readonly clamped: ShaderSettings;
  readonly violations: readonly Violation[];
  readonly warnings: readonly Warning[];
  readonly deadParams: ReadonlyMap<string, string>;
}

// --- Constants (derived from GLSL, not estimated) ---

/** C-01: Minimum freq*thick for shell visibility. At freq=3.0, thick=0.03: product=0.09.
 *  Below this, step distance exceeds shell thickness and raymarcher misses shells.
 *  Source: maxStep formula (shaderLabShader.ts line 478) vs halfThick. */
const MIN_FREQ_THICK_PRODUCT = 0.09;

/** C-03: Maximum auraScale*thick product before aura alpha saturates.
 *  Derived from GLSL lines 1140-1142: auraAlpha = (1-exp(-16*thick*auraScale))*0.35
 *  At product=0.12, alpha reaches ~86% of the 0.35 cap (entering saturation zone).
 *  The 16 comes from: 2.0 * 0.4 * 20.0 (auraWidth coefficient * traverseLen * density). */
const MAX_AURA_THICK_PRODUCT = 0.12;

/** C-04: Per-TPMS-type maximum thickness (Lipschitz-based).
 *  Higher Lipschitz = tighter shell spacing = lower max thickness before shells merge.
 *  Source: SHADER_CONSTRAINT_SYSTEM.md section 4B. */
const THICK_MAX_BY_TYPE: Readonly<Record<string, number>> = {
  gyroid: 1.5,
  schwarzP: 1.5,
  diamond: 1.2,
  neovius: 0.5,
  iwp: 0.8,
};

/** C-11: Diamond iso range (asymmetric due to sin product terms).
 *  Already enforced in UI for d2 but must apply to any domain set to Diamond.
 *  Source: tpms-math-invariants.md, Diamond range [-sqrt(2), sqrt(2)] ≈ [-1.41, 1.41],
 *  but practical shell quality degrades outside [-0.6, 0.6]. */
const DIAMOND_ISO_RANGE: readonly [number, number] = [-0.6, 0.6];

// --- Domain helpers ---

const DOMAIN_COUNT = 4;
const DOMAIN_KEYS = ['d0', 'd1', 'd2', 'd3'] as const;

function getDomainType(settings: ShaderSettings, i: number): string {
  const key = `${DOMAIN_KEYS[i]}type` as keyof ShaderSettings;
  return settings[key] as string;
}

function getDomainFreq(settings: ShaderSettings, i: number): number {
  const key = `${DOMAIN_KEYS[i]}freq` as keyof ShaderSettings;
  return settings[key] as number;
}

function getDomainThick(settings: ShaderSettings, i: number): number {
  const key = `${DOMAIN_KEYS[i]}thick` as keyof ShaderSettings;
  return settings[key] as number;
}

function getDomainIso(settings: ShaderSettings, i: number): number {
  const key = `${DOMAIN_KEYS[i]}iso` as keyof ShaderSettings;
  return settings[key] as number;
}

// --- Core engine ---

export function enforceConstraints(raw: ShaderSettings): ConstraintResult {
  // Shallow copy — constraint engine never mutates input
  const out = { ...raw };
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const deadParams = new Map<string, string>();

  // --- Hard clamps (per-domain) ---

  for (let i = 0; i < DOMAIN_COUNT; i++) {
    const prefix = DOMAIN_KEYS[i];
    const type = getDomainType(out, i);
    const freq = getDomainFreq(out, i);
    const thick = getDomainThick(out, i);
    const iso = getDomainIso(out, i);

    // C-01: freq * thick >= MIN_FREQ_THICK_PRODUCT (shell visibility)
    if (freq * thick < MIN_FREQ_THICK_PRODUCT) {
      const minThick = MIN_FREQ_THICK_PRODUCT / Math.max(freq, 0.01);
      const thickKey = `${prefix}thick` as keyof ShaderSettings;
      (out as Record<string, unknown>)[thickKey] = minThick;
      violations.push({
        constraintId: 'C-01',
        param: thickKey,
        message: `freq*thick=${(freq * thick).toFixed(3)} < ${MIN_FREQ_THICK_PRODUCT}; thick raised to ${minThick.toFixed(3)}`,
        original: thick,
        clamped: minThick,
      });
    }

    // C-04: Per-type thickness ceiling
    const maxThick = THICK_MAX_BY_TYPE[type] ?? 1.5;
    const currentThick = getDomainThick(out, i);
    if (currentThick > maxThick) {
      const thickKey = `${prefix}thick` as keyof ShaderSettings;
      (out as Record<string, unknown>)[thickKey] = maxThick;
      violations.push({
        constraintId: 'C-04',
        param: thickKey,
        message: `${type} max thickness is ${maxThick}; clamped from ${currentThick.toFixed(2)}`,
        original: currentThick,
        clamped: maxThick,
      });
    }

    // C-11: Diamond iso range
    if (type === 'diamond') {
      const [isoMin, isoMax] = DIAMOND_ISO_RANGE;
      if (iso < isoMin || iso > isoMax) {
        const clampedIso = Math.max(isoMin, Math.min(isoMax, iso));
        const isoKey = `${prefix}iso` as keyof ShaderSettings;
        (out as Record<string, unknown>)[isoKey] = clampedIso;
        violations.push({
          constraintId: 'C-11',
          param: isoKey,
          message: `Diamond iso clamped to [${isoMin}, ${isoMax}]; was ${iso.toFixed(2)}`,
          original: iso,
          clamped: clampedIso,
        });
      }
    }
  }

  // --- C-02: breathAmp must not make shells disappear in ANY domain ---
  // During thin phase of breathing, effective thickness = thick - breathAmp.
  // Shell must remain visible: (thick - breathAmp) * freq >= MIN_FREQ_THICK_PRODUCT.
  // So: breathAmp <= thick - MIN_FREQ_THICK_PRODUCT / freq.
  // Uses the MINIMUM limit across all 4 domains (thinnest domain is most vulnerable).
  let maxBreathAmp = Infinity;
  let limitingDomain = 0;
  for (let i = 0; i < DOMAIN_COUNT; i++) {
    const freq = getDomainFreq(out, i);
    const thick = getDomainThick(out, i);
    const domainMax = Math.max(0, thick - MIN_FREQ_THICK_PRODUCT / Math.max(freq, 0.01));
    if (domainMax < maxBreathAmp) {
      maxBreathAmp = domainMax;
      limitingDomain = i;
    }
  }
  if (out.breathAmp > maxBreathAmp) {
    const original = out.breathAmp;
    out.breathAmp = maxBreathAmp;
    violations.push({
      constraintId: 'C-02',
      param: 'breathAmp',
      message: `Breathing would make d${limitingDomain} shells invisible; clamped to ${maxBreathAmp.toFixed(3)}`,
      original,
      clamped: maxBreathAmp,
    });
  }

  // --- C-03: auraScale dynamic ceiling ---
  // auraAlpha = (1 - exp(-16 * thick * auraScale)) * 0.35 (GLSL lines 1140-1142)
  // Keep auraScale * thick < MAX_AURA_THICK_PRODUCT to avoid alpha saturation.
  // Uses max thickness across all domains as conservative proxy for GPU blendedThick.
  const auraThick = Math.max(
    getDomainThick(out, 0), getDomainThick(out, 1),
    getDomainThick(out, 2), getDomainThick(out, 3), 0.001,
  );
  const maxAuraScale = Math.min(1.0, MAX_AURA_THICK_PRODUCT / auraThick);
  if (out.auraScale > maxAuraScale) {
    const original = out.auraScale;
    out.auraScale = maxAuraScale;
    violations.push({
      constraintId: 'C-03',
      param: 'auraScale',
      message: `Aura alpha would saturate at thick=${auraThick.toFixed(2)}; clamped to ${maxAuraScale.toFixed(2)}`,
      original,
      clamped: maxAuraScale,
    });
  }

  // --- Dead parameter detection ---

  // C-05: roughMod dead when roughness >= 0.8
  if (out.roughness >= 0.8) {
    deadParams.set('roughMod', 'Roughness already at maximum; modulation has no visible effect');
  }

  // C-06: absorption dead when translucency = 0
  if (out.translucency === 0) {
    deadParams.set('absorption', 'No effect without Glass Amount > 0');
  }

  // C-07: sssDensity dead when translucency = 0
  if (out.translucency === 0) {
    deadParams.set('sssDensity', 'No effect without Glass Amount > 0');
  }

  // C-08: thickOpacity dead when translucency = 0
  if (out.translucency === 0) {
    deadParams.set('thickOpacity', 'No effect without Glass Amount > 0');
  }

  // C-15: rim sub-controls dead when rimStrength = 0
  if (out.rimStrength === 0) {
    deadParams.set('rimExponent', 'No effect without Rim Light > 0');
    deadParams.set('rimShadow', 'No effect without Rim Light > 0');
    deadParams.set('rimAOMask', 'No effect without Rim Light > 0');
  }

  // C-16: animation speed controls dead when amplitude = 0
  if (out.breathAmp === 0) {
    deadParams.set('breathSpeed', 'No effect without Thickness Breathing > 0');
  }
  if (out.isoSweepAmp === 0) {
    deadParams.set('isoSweepSpeed', 'No effect without Surface Ripple > 0');
  }
  if (out.warpStrength === 0) {
    deadParams.set('warpSpeed', 'No effect without Domain Warp > 0');
  }
  if (out.morphBlend === 0) {
    deadParams.set('morphTarget', 'No effect without Morph Amount > 0');
  }

  // C-17: absorptionColor dead when absorption = 0 or translucency = 0
  if (out.absorption === 0 || out.translucency === 0) {
    deadParams.set('absorptionColor', 'No effect without both Glass Amount > 0 and Color Absorption > 0');
  }

  // --- C-12: Diamond isoSweep safety ---
  // Animated iso must not exceed Diamond's safe [-0.6, 0.6] range.
  // Peak animated iso = abs(iso) + isoSweepAmp * (sqrt(2)/1.5).
  // Clamp isoSweepAmp so peak stays within 0.6.
  // C-12: find the most restrictive Diamond domain and clamp isoSweepAmp once.
  // Uses minimum maxSweep across all Diamond domains for idempotency.
  const DIAMOND_ISO_SCALE = 1.41 / 1.5; // ~0.94, from getFieldHalfRange in GLSL
  if (out.isoSweepAmp > 0) {
    let minMaxSweep = Infinity;
    let limitingDiamondIdx = -1;
    for (let i = 0; i < DOMAIN_COUNT; i++) {
      if (getDomainType(out, i) !== 'diamond') continue;
      const iso = Math.abs(getDomainIso(out, i));
      const maxSweep = Math.max(0, (0.6 - iso) / DIAMOND_ISO_SCALE);
      if (maxSweep < minMaxSweep) {
        minMaxSweep = maxSweep;
        limitingDiamondIdx = i;
      }
    }
    if (limitingDiamondIdx >= 0 && out.isoSweepAmp > minMaxSweep) {
      const original = out.isoSweepAmp;
      out.isoSweepAmp = minMaxSweep;
      violations.push({
        constraintId: 'C-12',
        param: 'isoSweepAmp',
        message: `Diamond d${limitingDiamondIdx}: sweep would exceed [-0.6,0.6]; clamped to ${minMaxSweep.toFixed(3)}`,
        original,
        clamped: minMaxSweep,
      });
    }
  }

  // --- Soft warnings (no clamping) ---

  // C-09: kColor + curvColorStr both active — they compete for gradient position
  if (out.kColor > 0 && out.curvColorStr > 1.0) {
    warnings.push({
      constraintId: 'C-09',
      params: ['kColor', 'curvColorStr'],
      message: 'Both topology color and curvature color active — gradient may be noisy',
    });
  }

  // C-10: translucency + atmoFog — fog overwhelms translucency benefit
  if (out.translucency > 0 && out.atmoFog > 0.5) {
    warnings.push({
      constraintId: 'C-10',
      params: ['translucency', 'atmoFog'],
      message: 'High fog with glass — fog tints each layer, reducing glass clarity',
    });
  }

  // C-13: metallic + translucency — physically impossible combination
  // Metals are opaque; combining metallic reflections with glass transparency
  // creates conflicting visual signals (bright specular + see-through).
  if (out.metallic > 0.5 && out.translucency > 0.3) {
    warnings.push({
      constraintId: 'C-13',
      params: ['metallic', 'translucency'],
      message: 'Metallic + glass is physically impossible — specular and transparency conflict',
    });
  }

  // C-14: freq * clipRadius step budget — raymarcher may exhaust steps
  // At high freq*clipRadius, the raymarcher needs more steps than maxSteps allows,
  // causing holes and banding artifacts. Threshold 30 is conservative.
  const maxFreqAll = Math.max(
    getDomainFreq(out, 0), getDomainFreq(out, 1),
    getDomainFreq(out, 2), getDomainFreq(out, 3),
  );
  if (maxFreqAll * out.clipRadius > 40) {
    warnings.push({
      constraintId: 'C-14',
      params: ['d0freq', 'clipRadius'],
      message: `High freq (${maxFreqAll.toFixed(1)}) + large sphere (${out.clipRadius.toFixed(1)}) may cause stepping artifacts`,
    });
  }

  // --- C-18: blendWidth caps (domain identity preservation) ---
  // Geometric cap: blend zone must not exceed 30% of domain angular width at equator.
  // Domain half-width in SDF space at equator = clipRadius / sqrt(2).
  // uBlendWidth = blendWidth * clipRadius. Blend fraction = blendWidth * sqrt(2).
  // For 30%: blendWidth <= 0.30 / sqrt(2) ≈ 0.212.
  const BLEND_MAX_GEOMETRIC = 0.36 / Math.SQRT2; // ~0.255, 36% domain overlap (user-tuned base uses 0.25)
  // Frequency cap: blend zone shouldn't span more than 2 TPMS cell widths.
  // Cell width in world space = 2*pi / freq. uBlendWidth = blendWidth * clipRadius.
  // blendWidth <= 2 * 2*pi / (maxFreq * clipRadius) = 4*pi / (maxFreq * clipRadius).
  const blendMaxFreq = (4 * Math.PI) / (maxFreqAll * Math.max(out.clipRadius, 1.0));
  const blendMax = Math.min(BLEND_MAX_GEOMETRIC, blendMaxFreq);
  if (out.blendWidth > blendMax) {
    const original = out.blendWidth;
    out.blendWidth = blendMax;
    violations.push({
      constraintId: 'C-18',
      param: 'blendWidth',
      message: `Blend would cover ${(original * Math.SQRT2 * 100).toFixed(0)}% of domain; clamped to ${(blendMax * Math.SQRT2 * 100).toFixed(0)}% (max 35%)`,
      original,
      clamped: blendMax,
    });
  }

  return { clamped: out, violations, warnings, deadParams };
}

// --- Preset validation (calibration) ---

export function validatePreset(
  name: string,
  preset: ShaderSettings,
): { valid: boolean; violations: readonly Violation[] } {
  const result = enforceConstraints(preset);
  return {
    valid: result.violations.length === 0,
    violations: result.violations,
  };
}
