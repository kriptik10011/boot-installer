/**
 * Color conversion utilities shared between ShaderLab and latticeAdapter.
 * Single source of truth for sRGB hex → linear RGB conversion.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/**
 * Convert sRGB hex (#rrggbb) to linear RGB [r, g, b].
 * Returns [0, 0, 0] for malformed input (prevents NaN in shader uniforms).
 */
export function hexToLinear(hex: string): [number, number, number] {
  if (!HEX_RE.test(hex)) return [0, 0, 0];
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/**
 * Cached version for per-frame use (zero allocation after first call per hex value).
 * Use in useFrame render loops. Not needed for one-time store conversion.
 */
const hexCache = new Map<string, [number, number, number]>();
export function hexToLinearCached(hex: string): [number, number, number] {
  const cached = hexCache.get(hex);
  if (cached) return cached;
  const result = hexToLinear(hex);
  hexCache.set(hex, result);
  return result;
}
