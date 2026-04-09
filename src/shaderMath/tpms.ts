// TPMS (Triply Periodic Minimal Surfaces) — CPU mirror of GLSL functions.
// Pure math, zero dependencies. Used as test oracle for shader verification.
//
// IMPORTANT: The gyroid uses the "sin-first" form dot(sin(p), cos(p.yzx))
// to exactly match the GLSL shader's implementation.

export const PI = Math.PI;
export const TAU = 2 * Math.PI;
export const SQRT2 = Math.SQRT2;

// --- Vec3 helpers (no Three.js dependency) ---

export type Vec3 = readonly [number, number, number];

export const vec3Add = (a: Vec3, b: Vec3): Vec3 =>
  [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const vec3Sub = (a: Vec3, b: Vec3): Vec3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const vec3Scale = (a: Vec3, s: number): Vec3 =>
  [a[0] * s, a[1] * s, a[2] * s];

export const vec3Negate = (a: Vec3): Vec3 =>
  [-a[0], -a[1], -a[2]];

export const vec3Length = (a: Vec3): number =>
  Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

export const vec3Dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const vec3Normalize = (a: Vec3): Vec3 => {
  const len = vec3Length(a);
  return len > 1e-10 ? vec3Scale(a, 1 / len) : [0, 0, 0];
};

// --- TPMS Implicit Functions ---
// Each returns f(x,y,z) where the surface is the zero-level-set f=0.

/**
 * Gyroid (sin-first form, matches GLSL: dot(sin(p), cos(p.yzx)))
 * f(x,y,z) = sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
 * Range: [-1.5, 1.5]
 * Symmetry: odd — f(-p) = -f(p), cyclic — f(x,y,z) = f(y,z,x)
 */
export function gyroid([x, y, z]: Vec3): number {
  return Math.sin(x) * Math.cos(y) +
         Math.sin(y) * Math.cos(z) +
         Math.sin(z) * Math.cos(x);
}

/**
 * Schwarz-P (Primitive)
 * f(x,y,z) = cos(x) + cos(y) + cos(z)
 * Range: [-3, 3]
 * Symmetry: even — f(-p) = f(p), full cubic — f(x,y,z) = f(perm(x,y,z))
 */
export function schwarzP([x, y, z]: Vec3): number {
  return Math.cos(x) + Math.cos(y) + Math.cos(z);
}

/**
 * Diamond (4-term form, matches GLSL shader)
 * f(x,y,z) = sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz
 * Range: [-sqrt(2), sqrt(2)]
 * Note: This differs from the 2-term form in research Part 1.4 (cos*cos*cos - sin*sin*sin)
 * which has range [-1, 1]. Both produce valid Diamond surfaces.
 */
export function diamond([x, y, z]: Vec3): number {
  const sx = Math.sin(x), sy = Math.sin(y), sz = Math.sin(z);
  const cx = Math.cos(x), cy = Math.cos(y), cz = Math.cos(z);
  return sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
}

/**
 * Neovius
 * f(x,y,z) = 3(cos(x) + cos(y) + cos(z)) + 4*cos(x)*cos(y)*cos(z)
 * Range: [-13, 13] (research claims [-7, 13] — INCORRECT)
 * Verified: f(0,0,0) = 13, f(pi,pi,pi) = -13
 */
export function neovius([x, y, z]: Vec3): number {
  const cx = Math.cos(x), cy = Math.cos(y), cz = Math.cos(z);
  return 3 * (cx + cy + cz) + 4 * cx * cy * cz;
}

/**
 * IWP (Schoen's I-WP) — CANONICAL formula
 * f(x,y,z) = 2(cos(x)cos(y) + cos(y)cos(z) + cos(z)cos(x)) - (cos(2x) + cos(2y) + cos(2z))
 * Range: [-5, 3] (research claims [-5, 9] — INCORRECT, verified by calculus)
 * Volume fraction at t=0: ~0.536 (asymmetric)
 * Note: The previous shader used a CLP-like formula that returned 2 at origin instead of 3.
 */
export function iwp([x, y, z]: Vec3): number {
  const cx = Math.cos(x), cy = Math.cos(y), cz = Math.cos(z);
  return 2 * (cx * cy + cy * cz + cz * cx) -
         (Math.cos(2 * x) + Math.cos(2 * y) + Math.cos(2 * z));
}

export type TPMSType = 'gyroid' | 'schwarzP' | 'diamond' | 'neovius' | 'iwp';

/** TPMS representation mode: sheet (membrane), networkA (positive channel), networkB (negative channel). */
export type TPMSMode = 'sheet' | 'networkA' | 'networkB';

/** Apply mode-specific SDF extraction. Matches GLSL sceneSDF branch. */
export function modeSDF(d: number, thickness: number, mode: TPMSMode): number {
  if (mode === 'networkA') return -d - thickness;
  if (mode === 'networkB') return d - thickness;
  return Math.abs(d) - thickness; // sheet (default)
}

export const TPMS_FUNCTIONS: Record<TPMSType, (p: Vec3) => number> = {
  gyroid, schwarzP, diamond, neovius, iwp,
};

// --- Normalization Constants ---
// Maximum absolute value of each TPMS function, used to normalize to ~[-1, 1].
// Verified empirically by tests + calculus.

export const TPMS_NORM: Record<TPMSType, number> = {
  gyroid: 1.5,       // range [-1.5, 1.5] -> [-1, 1]
  schwarzP: 3.0,     // range [-3, 3] -> [-1, 1]
  diamond: SQRT2,    // range [-sqrt(2), sqrt(2)] -> [-1, 1]
  neovius: 13.0,     // range [-13, 13] -> [-1, 1]
  iwp: 5.0,          // range [-5, 3] -> [-1, 0.6] (asymmetric — inherent to IWP)
};

// --- Analytical Gradients ---
// All gradients verified against numerical finite differences.

/**
 * Gyroid gradient (for sin-first form).
 * df/dx = cos(x)cos(y) - sin(z)sin(x)
 * df/dy = -sin(x)sin(y) + cos(y)cos(z)
 * df/dz = -sin(y)sin(z) + cos(z)cos(x)
 */
export function gyroidGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return [
    cx * cy - sz * sx,
    -sx * sy + cy * cz,
    -sy * sz + cz * cx,
  ];
}

/**
 * Schwarz-P gradient.
 * grad f = (-sin(x), -sin(y), -sin(z))
 */
export function schwarzPGrad([x, y, z]: Vec3): Vec3 {
  return [-Math.sin(x), -Math.sin(y), -Math.sin(z)];
}

/**
 * Diamond gradient (4-term form).
 * df/dx = cx*sy*sz + cx*cy*cz - sx*sy*cz - sx*cy*sz
 * df/dy = sx*cy*sz - sx*sy*cz + cx*cy*cz - cx*sy*sz
 * df/dz = sx*sy*cz - sx*cy*sz - cx*sy*sz + cx*cy*cz
 *
 * Wait — let me re-derive carefully from f = sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz:
 * df/dx = cx*sy*sz + cx*cy*cz + (-sx)*sy*cz + (-sx)*cy*sz
 *       = cx*sy*sz + cx*cy*cz - sx*sy*cz - sx*cy*sz
 */
export function diamondGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return [
    cx * sy * sz + cx * cy * cz - sx * sy * cz - sx * cy * sz,
    sx * cy * sz - sx * sy * cz + cx * cy * cz - cx * sy * sz,
    sx * sy * cz - sx * cy * sz - cx * sy * sz + cx * cy * cz,
  ];
}

/**
 * Neovius gradient.
 * df/dx = -sin(x) * (3 + 4*cos(y)*cos(z))
 * df/dy = -sin(y) * (3 + 4*cos(x)*cos(z))
 * df/dz = -sin(z) * (3 + 4*cos(x)*cos(y))
 */
export function neoviusGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return [
    -sx * (3 + 4 * cy * cz),
    -sy * (3 + 4 * cx * cz),
    -sz * (3 + 4 * cx * cy),
  ];
}

/**
 * IWP gradient (canonical formula).
 * df/dx = 2*sin(x)*(2*cos(x) - cos(y) - cos(z))
 * df/dy = 2*sin(y)*(2*cos(y) - cos(x) - cos(z))
 * df/dz = 2*sin(z)*(2*cos(z) - cos(x) - cos(y))
 *
 * Derived from: f = 2(cx*cy + cy*cz + cz*cx) - (cos(2x) + cos(2y) + cos(2z))
 * Using d/dx[cos(2x)] = -2*sin(2x) = -4*sx*cx
 * df/dx = 2*(-sx*cy + 0 + cz*(-sx)) + 4*sx*cx = 2*sx*(2*cx - cy - cz)
 */
export function iwpGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return [
    2 * sx * (2 * cx - cy - cz),
    2 * sy * (2 * cy - cx - cz),
    2 * sz * (2 * cz - cx - cy),
  ];
}

export const TPMS_GRADIENTS: Record<TPMSType, (p: Vec3) => Vec3> = {
  gyroid: gyroidGrad,
  schwarzP: schwarzPGrad,
  diamond: diamondGrad,
  neovius: neoviusGrad,
  iwp: iwpGrad,
};

// --- Derived quantities ---

/** Gradient-normalized approximate distance to the zero-level set. */
export function gradientNormalizedDistance(type: TPMSType, p: Vec3): number {
  const f = TPMS_FUNCTIONS[type](p);
  const g = TPMS_GRADIENTS[type](p);
  const gLen = vec3Length(g);
  return gLen > 1e-6 ? f / gLen : f;
}

/** TPMS SDF with mode selection. Sheet: abs(d)-t, NetworkA: -d-t, NetworkB: d-t. */
export function shellSDF(type: TPMSType, p: Vec3, thickness: number, mode: TPMSMode = 'sheet'): number {
  const f = TPMS_FUNCTIONS[type](p);
  const g = TPMS_GRADIENTS[type](p);
  const d = f / Math.max(vec3Length(g), 0.1);
  return modeSDF(d, thickness, mode);
}

/**
 * Normalized TPMS evaluation matching the GLSL evalTPMS dispatcher.
 * Divides raw output by TPMS_NORM[type] to get approximately [-1, 1].
 * Note: IWP is asymmetric [-1, 0.6] due to inherent surface asymmetry.
 */
export function evalTPMSNormalized(type: TPMSType, p: Vec3): number {
  return TPMS_FUNCTIONS[type](p) / TPMS_NORM[type];
}

// --- Normal computation ---

/**
 * Finite-difference normal using the tetrahedron technique.
 * Mirrors GLSL computeNormal exactly (4 samples of shellSDF).
 */
export function finiteDiffNormal(
  type: TPMSType, p: Vec3, thickness: number,
  mode: TPMSMode = 'sheet', epsilon: number = 0.001
): Vec3 {
  const k: readonly Vec3[] = [[1,-1,-1], [-1,-1,1], [-1,1,-1], [1,1,1]];
  const s = k.map(ki => shellSDF(type, vec3Add(p, vec3Scale(ki, epsilon)), thickness, mode));
  const n: Vec3 = [
    k[0][0]*s[0] + k[1][0]*s[1] + k[2][0]*s[2] + k[3][0]*s[3],
    k[0][1]*s[0] + k[1][1]*s[1] + k[2][1]*s[2] + k[3][1]*s[3],
    k[0][2]*s[0] + k[1][2]*s[1] + k[2][2]*s[2] + k[3][2]*s[3],
  ];
  return vec3Normalize(n);
}

/**
 * Analytical normal (uncorrected) — normalize(grad f) with mode sign.
 * Does NOT account for the |g| normalization in the shell SDF.
 * Error is O(thickness * curvature). Kept for comparison tests.
 */
export function analyticalNormal(
  type: TPMSType, p: Vec3, mode: TPMSMode = 'sheet'
): Vec3 {
  const f = TPMS_FUNCTIONS[type](p);
  const g = TPMS_GRADIENTS[type](p);

  let signFactor: number;
  if (mode === 'networkA') signFactor = -1;
  else if (mode === 'networkB') signFactor = 1;
  else signFactor = f >= 0 ? 1 : -1;

  const rawNormal: Vec3 = vec3Scale(g, signFactor);
  const len = vec3Length(rawNormal);
  return len > 0.001 ? vec3Scale(rawNormal, 1 / len) : [0, 1, 0];
}

// --- Hessian * gradient per TPMS type ---
// The shell SDF gradient is: grad(f/|g|) = g/|g| - f*(H*g)/|g|³
// The normal direction is: sign * (|g|²*g - f*H*g)
// Each function returns H*g using the same sin/cos values as evalAndGrad.

function schwarzPHessianTimesGrad([x, y, z]: Vec3): Vec3 {
  // H = diag(-cos(x), -cos(y), -cos(z)), g = (-sin(x), -sin(y), -sin(z))
  // H*g = (cos(x)*sin(x), cos(y)*sin(y), cos(z)*sin(z))
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return [cx * sx, cy * sy, cz * sz];
}

function gyroidHessianTimesGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  const gx = cx * cy - sz * sx;
  const gy = -sx * sy + cy * cz;
  const gz = -sy * sz + cz * cx;
  // Hessian entries (symmetric)
  const hxx = -sx * cy - sz * cx;
  const hxy = -cx * sy;
  const hxz = -cz * sx;
  const hyy = -sx * cy - sy * cz;
  const hyz = -cy * sz;
  const hzz = -sy * cz - sz * cx;
  return [
    hxx * gx + hxy * gy + hxz * gz,
    hxy * gx + hyy * gy + hyz * gz,
    hxz * gx + hyz * gy + hzz * gz,
  ];
}

function diamondHessianTimesGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  const f = sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
  const gx = cx * sy * sz + cx * cy * cz - sx * sy * cz - sx * cy * sz;
  const gy = sx * cy * sz - sx * sy * cz + cx * cy * cz - cx * sy * sz;
  const gz = sx * sy * cz - sx * cy * sz - cx * sy * sz + cx * cy * cz;
  // Diagonal: H_ii = -f for Diamond
  // Off-diagonal entries:
  const hxy = cx * cy * sz - cx * sy * cz - sx * cy * cz + sx * sy * sz;
  const hxz = cx * sy * cz - cx * cy * sz + sx * sy * sz - sx * cy * cz;
  const hyz = sx * cy * cz + sx * sy * sz - cx * cy * sz - cx * sy * cz;
  return [
    -f * gx + hxy * gy + hxz * gz,
    hxy * gx + -f * gy + hyz * gz,
    hxz * gx + hyz * gy + -f * gz,
  ];
}

function neoviusHessianTimesGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  const gx = -sx * (3 + 4 * cy * cz);
  const gy = -sy * (3 + 4 * cx * cz);
  const gz = -sz * (3 + 4 * cx * cy);
  const hxx = -cx * (3 + 4 * cy * cz);
  const hyy = -cy * (3 + 4 * cx * cz);
  const hzz = -cz * (3 + 4 * cx * cy);
  const hxy = 4 * sx * sy * cz;
  const hxz = 4 * sx * cy * sz;
  const hyz = 4 * cx * sy * sz;
  return [
    hxx * gx + hxy * gy + hxz * gz,
    hxy * gx + hyy * gy + hyz * gz,
    hxz * gx + hyz * gy + hzz * gz,
  ];
}

function iwpHessianTimesGrad([x, y, z]: Vec3): Vec3 {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  const gx = 2 * sx * (2 * cx - cy - cz);
  const gy = 2 * sy * (2 * cy - cx - cz);
  const gz = 2 * sz * (2 * cz - cx - cy);
  // H_xx = 2*(2*cos(2x) - cos(x)*cos(y) - cos(x)*cos(z)) ... wait, let me derive:
  // ∂g_x/∂x = 2*(cx*(2cx-cy-cz) + sx*(-2sx)) = 2*(2cx²-cx*cy-cx*cz-2sx²)
  //          = 2*(2*cos(2x) - cx*(cy+cz))
  const hxx = 2 * (2 * (cx * cx - sx * sx) - cx * (cy + cz));
  const hyy = 2 * (2 * (cy * cy - sy * sy) - cy * (cx + cz));
  const hzz = 2 * (2 * (cz * cz - sz * sz) - cz * (cx + cy));
  // ∂g_x/∂y = 2*sx*(-(-sy)) = 2*sx*sy
  const hxy = 2 * sx * sy;
  const hxz = 2 * sx * sz;
  const hyz = 2 * sy * sz;
  return [
    hxx * gx + hxy * gy + hxz * gz,
    hxy * gx + hyy * gy + hyz * gz,
    hxz * gx + hyz * gy + hzz * gz,
  ];
}

const TPMS_HESSIAN_TIMES_GRAD: Record<TPMSType, (p: Vec3) => Vec3> = {
  gyroid: gyroidHessianTimesGrad,
  schwarzP: schwarzPHessianTimesGrad,
  diamond: diamondHessianTimesGrad,
  neovius: neoviusHessianTimesGrad,
  iwp: iwpHessianTimesGrad,
};

/**
 * Hessian-corrected analytical normal for the shell SDF.
 * Matches the tetrahedron finite-diff normal within <2 degrees at surface points.
 *
 * The shell SDF is d = f/|g|. Its gradient is:
 *   grad(d) = g/|g| - f*(H*g)/|g|³
 * The normal direction (before normalization) is:
 *   |g|²*g - f*(H*g)
 *
 * This is Layer 0 of the Capstone build-up sequence.
 */
export function analyticalNormalCorrected(
  type: TPMSType, p: Vec3, mode: TPMSMode = 'sheet'
): Vec3 {
  const f = TPMS_FUNCTIONS[type](p);
  const g = TPMS_GRADIENTS[type](p);
  const Hg = TPMS_HESSIAN_TIMES_GRAD[type](p);
  const g2 = vec3Dot(g, g); // |g|²

  // normalDir = |g|²*g - f*H*g
  const dir: Vec3 = [
    g2 * g[0] - f * Hg[0],
    g2 * g[1] - f * Hg[1],
    g2 * g[2] - f * Hg[2],
  ];

  let signFactor: number;
  if (mode === 'networkA') signFactor = -1;
  else if (mode === 'networkB') signFactor = 1;
  else signFactor = f >= 0 ? 1 : -1;

  const rawNormal: Vec3 = vec3Scale(dir, signFactor);
  const len = vec3Length(rawNormal);
  return len > 0.001 ? vec3Scale(rawNormal, 1 / len) : [0, 1, 0];
}

// --- Layer 1: Analytical Laplacian (curvature proxy) ---
// Laplacian = trace of Hessian = Hxx + Hyy + Hzz.
// For P, G, D: exact eigenvalue identity (0 ALU — f already known).
// For Neovius, IWP: small correction term (~5-10 ALU).

export function analyticalLaplacian(type: TPMSType, p: Vec3): number {
  const f = TPMS_FUNCTIONS[type](p);
  if (type === 'schwarzP') return -f;           // eigenvalue -1
  if (type === 'gyroid')   return -2 * f;        // eigenvalue -2
  if (type === 'diamond')  return -3 * f;        // eigenvalue -3
  if (type === 'neovius') {
    // Derived from Hessian trace: -cx*(3+4cycz) - cy*(3+4cxcz) - cz*(3+4cxcy) = -f - 8cxcycz
    const cx = Math.cos(p[0]), cy = Math.cos(p[1]), cz = Math.cos(p[2]);
    return -f - 8 * cx * cy * cz;
  }
  // IWP: trace = 4*(cos2x+cos2y+cos2z) - 4*(cxcy+cycz+czcx) = -2f + 2*(cos2x+cos2y+cos2z)
  const cx = Math.cos(p[0]), cy = Math.cos(p[1]), cz = Math.cos(p[2]);
  const cos2x = 2 * cx * cx - 1;
  const cos2y = 2 * cy * cy - 1;
  const cos2z = 2 * cz * cz - 1;
  return -2 * f + 2 * (cos2x + cos2y + cos2z);
}

/** Finite-difference Laplacian for verification. */
export function finiteDiffLaplacian(
  type: TPMSType, p: Vec3, epsilon: number = 0.02
): number {
  const fn = TPMS_FUNCTIONS[type];
  const center = fn(p);
  const lap = fn(vec3Add(p, [epsilon, 0, 0])) + fn(vec3Add(p, [-epsilon, 0, 0]))
            + fn(vec3Add(p, [0, epsilon, 0])) + fn(vec3Add(p, [0, -epsilon, 0]))
            + fn(vec3Add(p, [0, 0, epsilon])) + fn(vec3Add(p, [0, 0, -epsilon]))
            - 6 * center;
  return lap / (epsilon * epsilon);
}

// --- Known ranges for test verification ---

export const TPMS_RANGES: Record<TPMSType, readonly [number, number]> = {
  gyroid: [-1.5, 1.5],
  schwarzP: [-3, 3],
  diamond: [-SQRT2, SQRT2],
  neovius: [-13, 13],
  iwp: [-5, 3],
};
