// Raymarching algorithm for TPMS SDF — CPU mirror of GLSL sphere tracing.
// Uses sign-change detection, bisection refinement, and confidence-weighted stepping.
//
// This is the TEST ORACLE for the GLSL raymarcher. If TS and GLSL disagree,
// the GLSL is wrong.
//
// Scope: gyroid is primary target. Other types supported but not profiled.

import {
  type Vec3, type TPMSType, type TPMSMode,
  vec3Add, vec3Scale, vec3Length, vec3Normalize, vec3Dot,
  TPMS_FUNCTIONS, TPMS_GRADIENTS, modeSDF,
} from './tpms';

// --- GLSL-equivalent helpers ---

/** GLSL smoothstep: Hermite interpolation between edge0 and edge1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** GLSL mix: linear interpolation. */
export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// --- Configuration ---

/** Per-domain TPMS parameters. */
export interface DomainConfig {
  readonly type: TPMSType;
  readonly frequency: number;
  readonly thickness: number;
  readonly isoValue: number;
  readonly mode?: TPMSMode; // default 'sheet'
}

export interface RaymarchConfig {
  type: TPMSType;         // TPMS surface type
  frequency: number;      // spatial frequency (cell density), default 8.0
  thickness: number;      // shell half-thickness, default 0.08
  isoValue: number;       // iso-value offset from zero-level set, default 0.0
  maxSteps: number;       // iteration limit, default 128
  maxDist: number;        // max ray travel distance, default 50.0
  surfDist: number;       // convergence threshold, default 0.001
  stepMult: number;       // base safety factor (0.6 for gyroid, 0.35 for neovius)
  minStep: number;        // minimum step to prevent infinite loops, default 0.0005
  bisectionSteps: number; // bisection refinement iterations, default 8
  mode?: TPMSMode;        // TPMS representation mode, default 'sheet'
  // Multi-domain (optional — undefined = single domain)
  domains?: readonly DomainConfig[];
  blendWidth?: number;
}

export const DEFAULT_CONFIG: RaymarchConfig = {
  type: 'gyroid',
  frequency: 8.0,
  thickness: 0.08,
  isoValue: 0.0,
  maxSteps: 128,
  maxDist: 50.0,
  surfDist: 0.001,
  stepMult: 0.6,
  minStep: 0.0005,
  bisectionSteps: 8,
};

/** Per-type recommended safety factors from research Part 2.4. */
export const STEP_MULT_BY_TYPE: Record<TPMSType, number> = {
  gyroid: 0.6,
  schwarzP: 0.7,
  diamond: 0.6,
  neovius: 0.35,
  iwp: 0.4,
};

// --- Domain Partitioning (Multi-Domain) ---

/**
 * Quadrant-wedge signed distance for domain boundaries in the XZ plane.
 * North = -z > |x|, East = x > |z|, South = z > |x|, West = -x > |z|.
 * The 1/sqrt(2) factor yields true Euclidean distance to the diagonal boundary.
 */
const INV_SQRT2 = 0.7071067811865476;

export function domainSDF(p: Vec3, id: number): number {
  const x = p[0], z = p[2];
  if (id === 0) return (-z - Math.abs(x)) * INV_SQRT2;  // North wedge
  if (id === 1) return ( x - Math.abs(z)) * INV_SQRT2;  // East wedge
  if (id === 2) return ( z - Math.abs(x)) * INV_SQRT2;  // South wedge
  if (id === 3) return (-x - Math.abs(z)) * INV_SQRT2;  // West wedge
  return 0;
}

/** Smooth domain weight: 1 deep inside domain, 0 far outside, smooth transition. */
export function domainWeight(p: Vec3, id: number, blendWidth: number): number {
  return smoothstep(-blendWidth, 0, domainSDF(p, id));
}

// --- Scene SDF ---

/** SDF for a single TPMS domain's shell. Shared by sceneSDF and multiDomainSceneSDF. */
export function singleDomainSDF(p: Vec3, domain: DomainConfig): number {
  const { type, frequency, thickness, isoValue } = domain;
  const q: Vec3 = vec3Scale(p, frequency);

  const f = TPMS_FUNCTIONS[type](q);
  const g = TPMS_GRADIENTS[type](q);
  const gLen = Math.max(vec3Length(g), 0.1);

  const d = (f - isoValue) / gLen;
  return modeSDF(d, thickness, domain.mode ?? 'sheet') / frequency;
}

/**
 * Compute the shell SDF at world-space point p (single-domain).
 * Delegates to singleDomainSDF for single source of truth.
 */
export function sceneSDF(p: Vec3, config: RaymarchConfig): number {
  return singleDomainSDF(p, config);
}

/** Raw signed distance to domain's TPMS level set (no shell extraction). */
export function rawDomainDistance(p: Vec3, domain: DomainConfig): { dist: number; thick: number } {
  const { type, frequency, thickness, isoValue } = domain;
  const q: Vec3 = vec3Scale(p, frequency);
  const f = TPMS_FUNCTIONS[type](q);
  const g = TPMS_GRADIENTS[type](q);
  const gLen = Math.max(vec3Length(g), 0.1);
  const d = (f - isoValue) / gLen / frequency;
  const thick = thickness / frequency;
  return { dist: d, thick };
}

/**
 * Multi-domain scene SDF with weighted blending.
 * Blends raw level-set distances BEFORE shell construction to preserve thickness.
 * Fast path: single domain = identical to sceneSDF.
 */
export function multiDomainSceneSDF(p: Vec3, config: RaymarchConfig): number {
  const { domains, blendWidth = 1.5 } = config;

  // Fast path: single domain
  if (!domains || domains.length <= 1) {
    const domain = domains?.[0] ?? config;
    return singleDomainSDF(p, domain);
  }

  let totalWeight = 0;
  let blendedDist = 0;
  let blendedThick = 0;

  for (let i = 0; i < domains.length; i++) {
    const w = domainWeight(p, i, blendWidth);
    if (w < 0.01) continue;

    const { dist, thick } = rawDomainDistance(p, domains[i]);

    if (totalWeight < 0.01) {
      blendedDist = dist;
      blendedThick = thick;
    } else {
      blendedDist = mix(blendedDist, dist, w / (totalWeight + w));
      blendedThick = mix(blendedThick, thick, w / (totalWeight + w));
    }
    totalWeight += w;
  }

  if (totalWeight < 0.01) return 50.0;

  // Shell construction ONCE on blended result
  // Shell construction with mode selection
  return modeSDF(blendedDist, blendedThick, config.mode ?? 'sheet');
}

// --- Raymarch Result ---

export interface RaymarchResult {
  hit: boolean;           // did the ray hit the surface?
  t: number;              // distance along ray to hit (or maxDist if miss)
  position: Vec3;         // world-space hit position
  steps: number;          // iterations consumed
  bisected: boolean;      // was bisection triggered?
}

// --- Core Raymarcher ---

/**
 * Sphere-trace a ray through the TPMS shell SDF.
 *
 * Algorithm (Part 4.1):
 * 1. March along ray with adaptive step size
 * 2. On sign change (overshoot), refine via bisection
 * 3. Confidence-weighted stepping: larger steps where gradient is reliable
 *
 * @param ro - ray origin (world space)
 * @param rd - ray direction (must be normalized)
 * @param config - raymarching parameters
 */
export function raymarch(
  ro: Vec3,
  rd: Vec3,
  config: RaymarchConfig = DEFAULT_CONFIG,
): RaymarchResult {
  const { type, frequency, thickness, maxSteps, maxDist, surfDist, stepMult, minStep, bisectionSteps } = config;

  let t = 0;
  let prevF = 1e10;
  let prevT = 0;
  let steps = 0;
  let bisected = false;

  for (let i = 0; i < maxSteps; i++) {
    steps = i;
    const p: Vec3 = vec3Add(ro, vec3Scale(rd, t));
    const d = multiDomainSceneSDF(p, config);

    // Sign-change detection: we overshot the surface
    // Skip first iteration (i=0) because prevF is a sentinel (1e10), not real data.
    if (i > 0 && d * prevF < 0) {
      bisected = true;
      let lo = prevT;
      let hi = t;
      let loF = prevF;

      for (let j = 0; j < bisectionSteps; j++) {
        const mid = 0.5 * (lo + hi);
        const midP: Vec3 = vec3Add(ro, vec3Scale(rd, mid));
        const fm = multiDomainSceneSDF(midP, config);

        if (fm * loF < 0) {
          hi = mid;
        } else {
          lo = mid;
          loF = fm;
        }
      }

      const hitT = 0.5 * (lo + hi);
      return {
        hit: true,
        t: hitT,
        position: vec3Add(ro, vec3Scale(rd, hitT)),
        steps: i,
        bisected: true,
      };
    }

    // Convergence check
    if (Math.abs(d) < surfDist) {
      return {
        hit: true,
        t,
        position: p,
        steps: i,
        bisected: false,
      };
    }

    // Max distance — ray missed
    if (t > maxDist) {
      return {
        hit: false,
        t: maxDist,
        position: vec3Add(ro, vec3Scale(rd, maxDist)),
        steps: i,
        bisected: false,
      };
    }

    prevF = d;
    prevT = t;

    // Adaptive stepping: single-domain uses confidence weighting, multi-domain uses fixed safety
    let mult: number;
    let maxStep: number;
    if (!config.domains || config.domains.length <= 1) {
      const q: Vec3 = vec3Scale(p, frequency);
      const g = TPMS_GRADIENTS[type](q);
      const confidence = smoothstep(0.3, 1.5, vec3Length(g));
      mult = mix(0.35, stepMult, confidence);
      maxStep = (1.0 + 2.0 * stepMult) * thickness / frequency;
    } else {
      mult = stepMult * 0.7;
      // Per-step adaptive maxStep from active domains at current position
      const bw = config.blendWidth ?? 1.5;
      maxStep = maxDist;
      for (let di = 0; di < config.domains.length; di++) {
        const w = domainWeight(p, di, bw);
        if (w < 0.01) continue;
        const domMax = (1.0 + 2.0 * stepMult) * config.domains[di].thickness / config.domains[di].frequency;
        maxStep = Math.min(maxStep, domMax);
      }
      if (maxStep >= maxDist) {
        maxStep = (1.0 + 2.0 * stepMult) * thickness / frequency;
      }
    }
    t += Math.min(Math.max(Math.abs(d) * mult, minStep), maxStep);
  }

  // Exhausted iterations — miss
  return {
    hit: false,
    t,
    position: vec3Add(ro, vec3Scale(rd, t)),
    steps: maxSteps,
    bisected: false,
  };
}

// --- Normal Computation ---

/**
 * Compute surface normal at hit point using analytical gradient.
 * Accounts for shell SDF sign: the shell uses abs(f/|g|) - thickness,
 * so the gradient direction depends on which side of f=0 the hit is on.
 * sign(f) * grad(f) / |grad(f)| gives the outward-pointing normal.
 */
export function computeNormal(p: Vec3, config: RaymarchConfig): Vec3 {
  const q: Vec3 = vec3Scale(p, config.frequency);
  const f = TPMS_FUNCTIONS[config.type](q) - config.isoValue;
  const g = TPMS_GRADIENTS[config.type](q);
  // Shell normal: sign(f) determines which side of the TPMS surface we're on
  const sign = f >= 0 ? 1 : -1;
  return vec3Normalize(vec3Scale(g, sign));
}

/**
 * Compute surface normal via central differences (cross-validation).
 * Used to verify analytical normals are correct.
 */
export function computeNormalNumerical(
  p: Vec3,
  config: RaymarchConfig,
  eps: number = 0.001,
): Vec3 {
  const dx = sceneSDF([p[0] + eps, p[1], p[2]], config)
           - sceneSDF([p[0] - eps, p[1], p[2]], config);
  const dy = sceneSDF([p[0], p[1] + eps, p[2]], config)
           - sceneSDF([p[0], p[1] - eps, p[2]], config);
  const dz = sceneSDF([p[0], p[1], p[2] + eps], config)
           - sceneSDF([p[0], p[1], p[2] - eps], config);
  return vec3Normalize([dx, dy, dz]);
}

// --- Fog ---

/** Gaussian fog for depth cue. Matches GLSL: exp(-density * t * t). */
export function fog(t: number, density: number = 0.015): number {
  return Math.exp(-density * t * t);
}

// --- Ray Generation ---

/** Generate ray direction from screen UV and camera parameters. */
export function generateRay(
  uv: readonly [number, number],
  camPos: Vec3,
  camTarget: Vec3,
  fov: number = 60,
): { ro: Vec3; rd: Vec3 } {
  const aspect = 1.0; // square for testing
  const fovRad = (fov * Math.PI) / 180;
  const halfH = Math.tan(fovRad / 2);

  // Camera basis vectors
  const forward = vec3Normalize([
    camTarget[0] - camPos[0],
    camTarget[1] - camPos[1],
    camTarget[2] - camPos[2],
  ]);
  const worldUp: Vec3 = [0, 1, 0];
  const right = vec3Normalize([
    forward[1] * worldUp[2] - forward[2] * worldUp[1],
    forward[2] * worldUp[0] - forward[0] * worldUp[2],
    forward[0] * worldUp[1] - forward[1] * worldUp[0],
  ]);
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];

  const rd = vec3Normalize(vec3Add(
    vec3Add(forward, vec3Scale(right, uv[0] * halfH * aspect)),
    vec3Scale(up, uv[1] * halfH),
  ));

  return { ro: camPos, rd };
}
