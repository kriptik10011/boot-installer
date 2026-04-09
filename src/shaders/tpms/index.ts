/**
 * TPMS Shader Module — production GLSL source, uniform defaults, and type maps.
 *
 * This is the single source of truth for the TPMS raymarching shader.
 * Consumed by BackgroundLattice.tsx (production) and ShaderLab.tsx (dev).
 */
export {
  shaderLabVertexShader,
  shaderLabFragmentShader,
  SHADER_LAB_DEFAULTS,
  TPMS_TYPE_MAP,
  TPMS_OPTIONS,
  casVertexShader,
  casFragmentShader,
} from './shader';
