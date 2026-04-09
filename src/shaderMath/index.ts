export {
  // Constants
  PI, TAU, SQRT2,

  // Vec3 helpers
  type Vec3,
  vec3Add, vec3Sub, vec3Scale, vec3Negate,
  vec3Length, vec3Dot, vec3Normalize,

  // TPMS functions
  gyroid, schwarzP, diamond, neovius, iwp,
  type TPMSType,
  TPMS_FUNCTIONS,
  TPMS_NORM,
  TPMS_RANGES,

  // Gradients
  gyroidGrad, schwarzPGrad, diamondGrad, neoviusGrad, iwpGrad,
  TPMS_GRADIENTS,

  // Derived
  gradientNormalizedDistance,
  shellSDF,
  modeSDF,
  evalTPMSNormalized,
  type TPMSMode,
} from './tpms';

export {
  // GLSL helpers
  smoothstep, mix,

  // Scene SDF
  sceneSDF,
  type RaymarchConfig,
  DEFAULT_CONFIG,
  STEP_MULT_BY_TYPE,

  // Raymarcher
  raymarch,
  type RaymarchResult,

  // Normals
  computeNormal,
  computeNormalNumerical,

  // Fog
  fog,

  // Ray generation
  generateRay,
} from './raymath';
