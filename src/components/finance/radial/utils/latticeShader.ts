/**
 * Lattice Shader — Re-export shim for backward compatibility with tests.
 * Production shader source: src/shaders/tpms/shader.ts
 */

import {
  shaderLabVertexShader as latticeVertexShader,
  shaderLabFragmentShader as latticeFragmentShader,
  SHADER_LAB_DEFAULTS as SHADER_DEFAULTS,
} from '@/shaders/tpms';

// Re-export shader strings under old names for test compatibility
export { latticeVertexShader, latticeFragmentShader };

// Unwrap { value: X } → X for drei's shaderMaterial (which wraps values itself).
// SHADER_LAB_DEFAULTS uses Three.js format { key: { value: ... } } for ShaderMaterial,
// but drei's shaderMaterial expects flat { key: value } and wraps internally.
export const LATTICE_DEFAULTS = Object.fromEntries(
  Object.entries(SHADER_DEFAULTS).map(([k, v]) => [k, v.value]),
);
