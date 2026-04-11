/**
 * Unified 4-domain TPMS shader (N/E/S/W spatial domains).
 *
 * ALWAYS renders 4 spatial domains (N/E/S/W). No single-domain path.
 * Each domain has independent: TPMS type, frequency, thickness, isoValue, 5-stop gradient.
 * "Link" toggles synchronize params/colors across all domains.
 *
 * sceneSDF is the SINGLE source of truth for the entire pipeline.
 * GLSL ES 3.0 (Three.js GLSL3 mode).
 */

import * as THREE from 'three';

export const shaderLabVertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const shaderLabFragmentShader = /* glsl */ `
  precision highp float;

  #define PI 3.14159265359
  #define TAU 6.283185307
  #define MAX_DIST 50.0
  #define MIN_STEP 0.0005

  // --- Layer 0: Analytical normal pass-through ---
  // sceneSDF stores the blended gradient vector here on every call.
  // getAnalyticalNormal() normalizes it with mode-dependent sign.
  // Saves 3 sceneSDF calls per hit vs tetrahedron finite-diff method.
  vec3 g_lastBlendedGrad;
  float g_lastBlendedF;
  float g_lastBlendedThick;
  float g_lastCoreD;  // Core SDF distance (>0 = aura zone, <=0 = core)
  float g_lastCurvFreq; // dominant domain freq from last calcCurvature call

  // --- Uniforms ---
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uStepMult;
  uniform float uBrightness;
  uniform float uClipRadius;
  uniform vec3 uCamPos;
  uniform vec3 uCamTarget;

  // --- Rendering config ---
  uniform int uMaxSteps;        // max raymarch iterations (default 192)
  uniform int uAoSamples;       // AO sample count (default 5)
  uniform int uShadowSteps;     // shadow march steps (default 48)
  uniform int uMaxDomains;      // domain loop cap (always 4)
  uniform int uDebugHeatmap;    // step-count heatmap debug mode

  // --- 4 Domains (always active) ---
  uniform int uDomainType[4];
  uniform float uDomainFreq[4];
  uniform float uDomainThick[4];
  uniform float uDomainIso[4];
  uniform float uBlendWidth;
  uniform int uDebugDomains;

  // --- Per-domain gradients: 4 domains x 5 stops = 20 vec3 ---
  uniform vec3 uDomainGradColor[20];

  // --- Material ---
  uniform float uMetallic;
  uniform float uRoughness;
  uniform float uSssIntensity;
  uniform float uSssDensity;  // Thickness-based SSS transmittance density (0=off)
  uniform float uCurvAO;      // Layer 2: curvature AO strength (0=off, use SDF AO)
  uniform float uKColor;      // Layer 3: Gaussian curvature color shift (0=off)
  uniform float uRoughMod;    // Layer 4: normal-variation roughness modulation (0=off)
  uniform float uRimStrength; // Layer 5: rim/Fresnel edge glow strength (0=off)
  uniform float uRimExponent; // rim falloff sharpness (1=broad, 5=tight)
  uniform vec3  uRimColor;    // rim color override (-1,-1,-1 = auto albedo-derived)
  uniform float uRimShadow;   // shadow masking strength (0=none, 1=full)
  uniform float uRimAOMask;   // AO masking strength (0=none, 1=full)
  uniform float uAtmoFog;     // Layer 6: atmospheric fog strength (0=off, uses flat bgColor)
  uniform float uThickOpacity; // Thickness-based opacity modulation (0=off, 1=full effect)
  uniform float uAbsorption;   // Beer-Lambert absorption scale (0=off)
  uniform vec3  uAbsorptionColor; // Beer-Lambert absorption tint color
  uniform float uAuraScale;    // Core+Aura volumetric glow scale (0=off)
  uniform float uSpatialColor; // position-based color gradient (0=off)
  uniform int uCurvatureMode;
  uniform float uCurvatureColorStrength;

  // --- Shadow control ---
  uniform float uShadowStrength;  // 0=no shadows, 0.3=subtle, 1=full (default 0.3)
  uniform float uShadowPulse;     // 0=stable offset (1.5x), 1=breathing pulse (1.2x)

  // --- TPMS mode + Translucency ---
  uniform int uTPMSMode;          // 0=sheet (abs), 1=solid A (-d), 2=solid B (+d)
  uniform float uTranslucency;    // 0 = opaque (current), 1 = full glass
  uniform int uMaxLayers;         // max multi-hit layers (1-5)

  // --- Animation uniforms ---
  uniform float uBreathAmp;      // thickness breathing amplitude (0 = disabled)
  uniform float uBreathSpeed;    // breathing oscillation rate
  uniform float uIsoSweepAmp;    // iso-value sweep amplitude (0 = disabled)
  uniform float uIsoSweepSpeed;  // iso sweep rate
  uniform float uWarpStrength;   // domain warp amplitude (0 = disabled)
  uniform float uWarpSpeed;      // warp time multiplier
  uniform int uMorphTarget;      // target TPMS type for morphing (0-4)
  uniform float uMorphBlend;     // 0 = current types, 1 = all morph to target
  uniform float uDomainPhase[4]; // per-domain animation phase offset

  // --- IBL: SH L2 environment lighting ---
  uniform float uEnvWeight;      // IBL intensity (0=off, 1=full)
  uniform vec3 uSHCoeffs[9];     // SH L2 irradiance coefficients

  out vec4 fragColor;

  // === OKLab COLOR SPACE ===

  vec3 linearToOklab(vec3 c) {
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2220049264 * c.g + 0.6896926170 * c.b;
    l = pow(max(l, 0.0), 1.0 / 3.0);
    m = pow(max(m, 0.0), 1.0 / 3.0);
    s = pow(max(s, 0.0), 1.0 / 3.0);
    return vec3(
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    );
  }

  vec3 oklabToLinear(vec3 c) {
    float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
    l = l * l * l;
    m = m * m * m;
    s = s * s * s;
    return max(vec3(
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
     -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
     -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ), 0.0);
  }

  // === 5-STOP GRADIENT ===

  vec3 sampleDomainGradient(float t, int domainId) {
    t = clamp(t, 0.0, 1.0);
    float idx = t * 4.0;
    int lo = min(int(floor(idx)), 3);
    float fr = fract(idx);

    int base = clamp(domainId, 0, 3) * 5;
    int ia = base + lo;
    int ib = base + min(lo + 1, 4);

    vec3 labA = linearToOklab(uDomainGradColor[ia]);
    vec3 labB = linearToOklab(uDomainGradColor[ib]);
    return oklabToLinear(mix(labA, labB, fr));
  }

  // === ACES TONE MAPPING ===
  // Gamma 2.2 applied after ACES in main() because ShaderMaterial bypasses
  // Three.js automatic sRGB encoding.

  vec3 acesToneMap(vec3 x) {
    x = max(x, vec3(0.0));
    return clamp(
      (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),
      0.0, 1.0
    );
  }

  // === PBR (Cook-Torrance) ===

  float distributionGGX(float NdotH, float a2) {
    float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / (PI * denom * denom + 0.0001);
  }

  float geometrySchlick(float NdotX, float k) {
    return NdotX / (NdotX * (1.0 - k) + k + 0.0001);
  }

  float geometrySmith(float NdotV, float NdotL, float roughness) {
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    return geometrySchlick(NdotV, k) * geometrySchlick(NdotL, k);
  }

  vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  }

  // Analytical BRDF integration for IBL (Karis 2014, UE4 approximation)
  // Returns (scale, bias) for split-sum: F0 * scale + bias
  vec2 envBRDF(float NdotV, float roughness) {
    vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
    vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
    vec4 r = roughness * c0 + c1;
    float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
    return vec2(-1.04, 1.04) * a004 + r.zw;
  }

  // SH L2 irradiance evaluation (Ramamoorthi & Hanrahan 2001)
  vec3 evaluateSH(vec3 n) {
    return max(
      uSHCoeffs[0] * 0.282095
      + uSHCoeffs[1] * 0.488603 * n.y
      + uSHCoeffs[2] * 0.488603 * n.z
      + uSHCoeffs[3] * 0.488603 * n.x
      + uSHCoeffs[4] * 1.092548 * n.x * n.y
      + uSHCoeffs[5] * 1.092548 * n.y * n.z
      + uSHCoeffs[6] * 0.315392 * (3.0 * n.z * n.z - 1.0)
      + uSHCoeffs[7] * 1.092548 * n.x * n.z
      + uSHCoeffs[8] * 0.546274 * (n.x * n.x - n.y * n.y),
      vec3(0.0)
    );
  }

  vec3 shadePBR(vec3 N, vec3 V, vec3 L, vec3 albedo, float roughness, float metallic, float intensity) {
    vec3 H = normalize(V + L);
    float NdotL = max(dot(N, L), 0.0);
    float NdotV = max(dot(N, V), 0.001);
    float NdotH = max(dot(N, H), 0.001);
    float HdotV = max(dot(H, V), 0.0);

    float a = roughness * roughness;
    float a2 = max(a * a, 0.0001);

    vec3 F0 = mix(vec3(0.04), albedo, metallic);
    float D = distributionGGX(NdotH, a2);
    float G = geometrySmith(NdotV, NdotL, roughness);
    vec3 F = fresnelSchlick(HdotV, F0);

    vec3 specular = (D * G * F) / (4.0 * NdotV * NdotL + 0.0001);
    vec3 kD = (1.0 - F) * (1.0 - metallic);
    vec3 diffuse = kD * albedo / PI;

    return (diffuse + specular) * NdotL * intensity;
  }

  // === TPMS EVAL+GRAD ===

  float evalAndGradTPMS(vec3 p, out vec3 grad, int type) {
    float sx=sin(p.x), cx=cos(p.x);
    float sy=sin(p.y), cy=cos(p.y);
    float sz=sin(p.z), cz=cos(p.z);

    if (type == 1) { // Schwarz-P
      grad = vec3(-sx, -sy, -sz);
      return cx + cy + cz;
    } else if (type == 2) { // Diamond
      grad = vec3(
        cx*sy*sz + cx*cy*cz - sx*sy*cz - sx*cy*sz,
        sx*cy*sz - sx*sy*cz + cx*cy*cz - cx*sy*sz,
        sx*sy*cz - sx*cy*sz - cx*sy*sz + cx*cy*cz
      );
      return sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz;
    } else if (type == 3) { // Neovius
      grad = vec3(
        -sx*(3.0 + 4.0*cy*cz),
        -sy*(3.0 + 4.0*cx*cz),
        -sz*(3.0 + 4.0*cx*cy)
      );
      return 3.0*(cx+cy+cz) + 4.0*cx*cy*cz;
    } else if (type == 4) { // IWP (cos(2x) = 2*cx^2-1)
      grad = vec3(
        2.0*sx*(2.0*cx - cy - cz),
        2.0*sy*(2.0*cy - cx - cz),
        2.0*sz*(2.0*cz - cx - cy)
      );
      return 2.0*(cx*cy + cy*cz + cz*cx)
           - (2.0*cx*cx - 1.0 + 2.0*cy*cy - 1.0 + 2.0*cz*cz - 1.0);
    }
    // type 0: Gyroid (default)
    grad = vec3(cx*cy - sz*sx, -sx*sy + cy*cz, -sy*sz + cz*cx);
    return sx*cy + sy*cz + sz*cx;
  }

  // Scalar-only TPMS (no gradient — for curvature computation)
  float evalTPMS_scalar(vec3 p, int type) {
    float sx=sin(p.x), cx=cos(p.x);
    float sy=sin(p.y), cy=cos(p.y);
    float sz=sin(p.z), cz=cos(p.z);
    if (type == 1) return cx + cy + cz;
    if (type == 2) return sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz;
    if (type == 3) return 3.0*(cx+cy+cz) + 4.0*cx*cy*cz;
    if (type == 4) return 2.0*(cx*cy+cy*cz+cz*cx) - (2.0*cx*cx-1.0+2.0*cy*cy-1.0+2.0*cz*cz-1.0);
    return sx*cy + sy*cz + sz*cx;
  }

  // === DOMAIN WEIGHTS ===

  // Smooth abs: rounds the V-shaped corner at x=0 to eliminate derivative discontinuity.
  // At |x| >> k, behaves like abs(x). Near x=0, rounds with radius k.
  float softAbs(float x, float k) {
    return sqrt(x * x + k * k) - k;
  }

  float domainSDF(vec3 p, int id) {
    float x = p.x, z = p.z;
    const float S = 0.7071067811865476;
    const float K = 0.05; // corner rounding radius
    if (id == 0) return (-z - softAbs(x, K)) * S;
    if (id == 1) return ( x - softAbs(z, K)) * S;
    if (id == 2) return ( z - softAbs(x, K)) * S;
    if (id == 3) return (-x - softAbs(z, K)) * S;
    return 0.0;
  }

  float domainWeight(vec3 p, int id) {
    return smoothstep(-max(uBlendWidth, 0.001), 0.0, domainSDF(p, id));
  }

  // === DOMAIN WARP ===
  // 3-octave sine warp ported from production. Applied at top of sceneSDF
  // so all callers (normal, AO, shadow) see the warped surface.

  vec3 domainWarp(vec3 p) {
    if (uWarpStrength < 0.001) return p;
    float t = uTime * uWarpSpeed;
    vec3 w1 = sin(p.yzx * 0.3 + t) * 0.5;
    vec3 w2 = sin(p.zxy * 0.8 + t * 1.7) * 0.2;
    vec3 w3 = sin(p.xyz * 1.5 + t * 2.3) * 0.08;
    // Normalize by freq so the same warpStrength produces the same visual distortion
    // at any lattice density. At default freq (3.5), warpFreqNorm = 1.0 (unchanged).
    float warpFreqNorm = max(uDomainFreq[0] / 3.5, 1.0);
    return p + (w1 + w2 + w3) * uWarpStrength / warpFreqNorm;
  }

  // === PER-DOMAIN ANIMATED TIME ===

  float getDomainTime(int domainId) {
    return uTime + uDomainPhase[clamp(domainId, 0, 3)];
  }

  // Lipschitz constants (max gradient magnitude) per TPMS type.
  // Used for field normalization during morph blending so that
  // Neovius [-13,13] doesn't overwhelm Gyroid [-1.5,1.5].
  // Half-range of each TPMS field (max |f| on the surface).
  // Used to normalize isoSweepAmp so same slider value = same visual sweep across types.
  float getFieldHalfRange(int type) {
    if (type == 1) return 3.0;   // Schwarz-P: [-3, 3]
    if (type == 2) return 1.41;  // Diamond: [-sqrt(2), sqrt(2)]
    if (type == 3) return 13.0;  // Neovius: [-13, 13]
    if (type == 4) return 5.0;   // IWP: [-5, 3] (use |min| as conservative)
    return 1.5;                   // Gyroid: [-1.5, 1.5]
  }

  float getLipschitz(int type) {
    if (type == 1) return 1.732;  // sqrt(3), Schwarz-P
    if (type == 2) return 3.464;  // 2*sqrt(3), Diamond
    if (type == 3) return 12.12;  // Neovius
    if (type == 4) return 6.93;   // IWP
    return 2.449;                  // sqrt(6), Gyroid
  }

  // === SCENE SDF (always 4 domains, animated) ===

  float sceneSDF(vec3 p) {
    // Domain warp applied ONCE at entry — both domain weight and TPMS eval
    // see the warped surface. domainWeight uses un-warped p for spatial
    // boundaries (blend zones are spatial, not tied to TPMS geometry).
    vec3 wp = domainWarp(p);

    float totalWeight = 0.0;
    // Field-value blending: blend raw implicit field values BEFORE computing SDF.
    // Eliminates phantom surfaces at domain boundaries (Al-Ketan 2019, Yang 2019).
    float blendedF = 0.0;        // blended raw TPMS field value (f - iso)
    float blendedGradLen = 0.0;  // blended gradient magnitude (|grad| * freq)
    float blendedThick = 0.0;
    vec3  blendedGrad = vec3(0.0); // blended gradient VECTOR for analytical normals (Layer 0)

    for (int i = 0; i < 4; i++) {
      if (i >= uMaxDomains) break;
      float w = domainWeight(p, i); // un-warped p for spatial boundaries
      if (w < 0.01) continue;

      float domTime = getDomainTime(i);

      // Animated iso-value — normalized by type field range so the same slider
      // value produces proportional sweep across types (Neovius range 26 vs Gyroid 3).
      float isoScale = getFieldHalfRange(uDomainType[i]) / 1.5; // 1.0 for Gyroid (reference)
      float animIso = uDomainIso[i] + uIsoSweepAmp * isoScale * sin(domTime * uIsoSweepSpeed);

      // Animated thickness
      float animThick = max(uDomainThick[i] + uBreathAmp * sin(domTime * uBreathSpeed), 0.005);

      // TPMS type with optional morphing
      int tp = uDomainType[i];
      float safeFreq = max(uDomainFreq[i], 0.01);
      vec3 dq = wp * safeFreq; // warped point for TPMS eval
      vec3 g;
      float f;

      if (uMorphBlend > 0.001) {
        vec3 gA, gB;
        float fA = evalAndGradTPMS(dq, gA, tp);
        float fB = evalAndGradTPMS(dq, gB, uMorphTarget);
        float mb = uMorphBlend * uMorphBlend * (3.0 - 2.0 * uMorphBlend); // smoothstep ease
        // Field normalization: divide by Lipschitz before blend, multiply by blended Lipschitz after.
        // Prevents Neovius [-13,13] from overwhelming Gyroid [-1.5,1.5] at 50% morph.
        float lipA = getLipschitz(tp);
        float lipB = getLipschitz(uMorphTarget);
        float lipBlend = mix(lipA, lipB, mb);
        f = mix(fA / lipA, fB / lipB, mb) * lipBlend;
        g = mix(gA / lipA, gB / lipB, mb) * lipBlend;
      } else {
        f = evalAndGradTPMS(dq, g, tp);
      }

      // Field-value blending: accumulate raw field and gradient magnitude
      float fieldVal = f - animIso;
      float gradLen = max(length(g), 0.1) * safeFreq;
      float thick = animThick / safeFreq;
      vec3  gradVec = g * safeFreq; // frequency-scaled gradient vector (Layer 0)

      // Incremental weighted mean: blendT = w/(accumulated+w).
      // IMPORTANT: totalWeight must be incremented AFTER the mix calls.
      float blendT = (totalWeight < 0.01) ? 1.0 : w / (totalWeight + w);
      blendedF = (totalWeight < 0.01) ? fieldVal : mix(blendedF, fieldVal, blendT);
      blendedGradLen = (totalWeight < 0.01) ? gradLen : mix(blendedGradLen, gradLen, blendT);
      blendedThick = (totalWeight < 0.01) ? thick : mix(blendedThick, thick, blendT);
      blendedGrad = (totalWeight < 0.01) ? gradVec : mix(blendedGrad, gradVec, blendT);
      totalWeight += w;
    }

    if (totalWeight < 0.01) return MAX_DIST;

    // Store blended gradient for analytical normals (Layer 0).
    // Written every sceneSDF call; only read at hit points.
    g_lastBlendedGrad = blendedGrad;
    g_lastBlendedF = blendedF;
    g_lastBlendedThick = blendedThick;

    // Compute SDF once from the blended field (single coherent implicit function).
    // Floor at 1.0 (not 0.1) ensures SDF is conservative — prevents over-stepping
    // when blended gradient magnitudes exceed 1.0 in transition zones.
    float d = blendedF / max(blendedGradLen, 1.0);

    // Mode selection (bicontinuous domain control):
    // Sheet: abs(d)-thick = membrane between both channel networks (two walls)
    // Solid A: -d-thick = positive labyrinth filled solid (single wall)
    // Solid B: d-thick = negative labyrinth filled solid (single wall)
    float shellD;
    int safeMode = clamp(uTPMSMode, 0, 2);
    if (safeMode == 1) shellD = -d;
    else if (safeMode == 2) shellD = d;
    else shellD = abs(d);

    // Store core SDF distance for aura vs. solid classification in compositing.
    // g_lastCoreD > 0 means the hit is in the aura zone (outside core shell).
    g_lastCoreD = shellD - blendedThick;

    // When aura is active, slightly widen the shell threshold to catch
    // near-miss thin shells. 40% of uAuraScale translates to SDF
    // widening — the main visual effect comes from post-hit glow on core hits.
    if (uAuraScale > 0.0) {
      return shellD - blendedThick * (1.0 + uAuraScale * 0.4);
    }
    return g_lastCoreD;
  }

  // === SPHERE INTERSECTION ===

  bool intersectSphere(vec3 ro, vec3 rd, float radius, out float tNear, out float tFar) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - radius * radius;
    float disc = b * b - c;
    if (disc < 0.0) return false;
    float sq = sqrt(disc);
    tNear = -b - sq;
    tFar = -b + sq;
    return true;
  }

  // === CAMERA ===

  void setupCamera(vec2 uv, out vec3 ro, out vec3 rd) {
    ro = uCamPos;
    vec3 fwd = normalize(uCamTarget - ro);
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.001)));
    vec3 up = cross(right, fwd);
    rd = normalize(uv.x * right + uv.y * up + 1.5 * fwd);
  }

  // === RAYMARCHER ===
  // Accepts start/end t to support multi-hit layered marching.

  float raymarch(vec3 ro, vec3 rd, float tStart, float tEnd, out int steps) {
    float t = tStart;
    float prevD = 1e10;
    float prevT = t;
    steps = 0;

    // Loop uses uniform-controlled max (GLSL3 allows dynamic bounds)
    // Outer bound 256 = smallest power-of-two above Tier 4 max (192)
    for (int i = 0; i < 256; i++) {
      if (i >= uMaxSteps) break;
      steps = i;
      vec3 p = ro + rd * t;
      float d = sceneSDF(p);

      if (i > 0 && d * prevD < 0.0) {
        float lo = prevT, hi = t;
        float loD = prevD;
        for (int j = 0; j < 16; j++) {
          float mid = 0.5 * (lo + hi);
          float dm = sceneSDF(ro + rd * mid);
          if (abs(dm) < 0.0001) { lo = mid; hi = mid; break; }
          if (dm * loD < 0.0) hi = mid;
          else { lo = mid; loD = dm; }
        }
        return 0.5 * (lo + hi);
      }

      // Adaptive convergence: looser tolerance at distance (saves steps for far pixels)
      float surfDist = max(0.001, 0.003 * t);
      if (abs(d) < surfDist) return t;
      if (t > tEnd) return MAX_DIST;

      prevD = d;
      prevT = t;

      // Adaptive stepping with per-domain maxStep + Lipschitz correction for warp
      float mult = uStepMult * 0.7;
      float lipschitz = 1.0 + 1.17 * uWarpStrength;
      float maxStep = MAX_DIST;
      for (int di = 0; di < 4; di++) {
        if (di >= uMaxDomains) break;
        float w = domainWeight(p, di);
        if (w < 0.01) continue;
        float domMax = (1.0 + 2.0 * uStepMult) * uDomainThick[di] / max(uDomainFreq[di], 0.01);
        maxStep = min(maxStep, domMax);
      }
      if (maxStep >= MAX_DIST) {
        maxStep = (1.0 + 2.0 * uStepMult) * uDomainThick[0] / max(uDomainFreq[0], 0.01);
      }
      t += clamp(abs(d) * mult / lipschitz, MIN_STEP, maxStep);
    }
    return MAX_DIST;
  }

  // === HESSIAN * GRADIENT (Layer 0) ===
  // Returns H*g for each TPMS type. Reuses sin/cos from evalAndGradTPMS.
  // Used by getAnalyticalNormal for the Hessian correction term.

  vec3 hessianTimesGrad(vec3 p, vec3 g, float f, int type) {
    float sx=sin(p.x), cx=cos(p.x);
    float sy=sin(p.y), cy=cos(p.y);
    float sz=sin(p.z), cz=cos(p.z);

    if (type == 1) { // Schwarz-P: H = diag(-cx,-cy,-cz)
      return vec3(cx*sx, cy*sy, cz*sz);
    } else if (type == 2) { // Diamond: diag = -f, off-diag computed
      float hxy = cx*cy*sz - cx*sy*cz - sx*cy*cz + sx*sy*sz;
      float hxz = cx*sy*cz - cx*cy*sz + sx*sy*sz - sx*cy*cz;
      float hyz = sx*cy*cz + sx*sy*sz - cx*cy*sz - cx*sy*cz;
      return vec3(
        -f*g.x + hxy*g.y + hxz*g.z,
        hxy*g.x + -f*g.y + hyz*g.z,
        hxz*g.x + hyz*g.y + -f*g.z
      );
    } else if (type == 3) { // Neovius
      float hxx = -cx*(3.0 + 4.0*cy*cz);
      float hyy = -cy*(3.0 + 4.0*cx*cz);
      float hzz = -cz*(3.0 + 4.0*cx*cy);
      float hxy = 4.0*sx*sy*cz;
      float hxz = 4.0*sx*cy*sz;
      float hyz = 4.0*cx*sy*sz;
      return vec3(
        hxx*g.x + hxy*g.y + hxz*g.z,
        hxy*g.x + hyy*g.y + hyz*g.z,
        hxz*g.x + hyz*g.y + hzz*g.z
      );
    } else if (type == 4) { // IWP
      float hxx = 2.0*(2.0*(cx*cx - sx*sx) - cx*(cy+cz));
      float hyy = 2.0*(2.0*(cy*cy - sy*sy) - cy*(cx+cz));
      float hzz = 2.0*(2.0*(cz*cz - sz*sz) - cz*(cx+cy));
      float hxy = 2.0*sx*sy;
      float hxz = 2.0*sx*sz;
      float hyz = 2.0*sy*sz;
      return vec3(
        hxx*g.x + hxy*g.y + hxz*g.z,
        hxy*g.x + hyy*g.y + hyz*g.z,
        hxz*g.x + hyz*g.y + hzz*g.z
      );
    }
    // type 0: Gyroid
    float hxx = -sx*cy - sz*cx;
    float hxy = -cx*sy;
    float hxz = -cz*sx;
    float hyy = -sx*cy - sy*cz;
    float hyz = -cy*sz;
    float hzz = -sy*cz - sz*cx;
    return vec3(
      hxx*g.x + hxy*g.y + hxz*g.z,
      hxy*g.x + hyy*g.y + hyz*g.z,
      hxz*g.x + hyz*g.y + hzz*g.z
    );
  }

  // === NORMAL (Layer 0: Hessian-corrected analytical) ===
  // Shell SDF gradient: grad(f/|g|) = g/|g| - f*(H*g)/|g|³
  // Normal direction (unnormalized): |g|²*g - f*(H*g)
  // Saves 3 sceneSDF calls vs tetrahedron (1 call + ~25 ALU for Hessian).
  // Matches tetrahedron normals within <2 degrees at surface points.

  vec3 getAnalyticalNormal(vec3 p) {
    // Call sceneSDF once to populate g_lastBlendedGrad/g_lastBlendedF
    sceneSDF(p);

    vec3 g = g_lastBlendedGrad;
    float f = g_lastBlendedF;
    float g2 = dot(g, g); // |g|²

    // Compute Hessian correction for dominant domain
    // Use dominant domain type for the Hessian (blended Hessian would need per-domain accumulation)
    int domType = uDomainType[0];
    float domFreq = max(uDomainFreq[0], 0.01);
    float maxW = 0.0;
    for (int di = 0; di < 4; di++) {
      if (di >= uMaxDomains) break;
      float dw = domainWeight(p, di);
      if (dw > maxW) { maxW = dw; domType = uDomainType[di]; domFreq = max(uDomainFreq[di], 0.01); }
    }

    // Hessian is computed in TPMS-space; need the TPMS-space point
    vec3 wp = domainWarp(p);
    vec3 dq = wp * domFreq;
    vec3 domGrad;
    float domF = evalAndGradTPMS(dq, domGrad, domType);
    vec3 Hg = hessianTimesGrad(dq, domGrad, domF, domType);

    // Scale H*g by freq² (chain rule: H in world space = freq² * H in TPMS space)
    // but g is also in TPMS space scaled by freq, so the freq factors in g2*g and f*Hg
    // cancel appropriately after normalization. We use TPMS-space values directly.
    float domG2 = dot(domGrad, domGrad);

    // Normal direction: |g|²*g - f*H*g (TPMS-space, direction preserved after normalize)
    vec3 dir = domG2 * domGrad - domF * Hg;

    // Mode-dependent sign
    float signFactor;
    int safeMode = clamp(uTPMSMode, 0, 2);
    if (safeMode == 1) signFactor = -1.0;
    else if (safeMode == 2) signFactor = 1.0;
    else signFactor = (f >= 0.0) ? 1.0 : -1.0; // sheet: sign(blendedF)

    vec3 rawNormal = signFactor * dir;
    float len = length(rawNormal);
    return len > 0.001 ? rawNormal / len : vec3(0.0, 1.0, 0.0);
  }

  // === AO ===

  float calcAO(vec3 p, vec3 n) {
    if (uAoSamples <= 0) return 1.0;
    float ao = 0.0, decay = 1.0;
    for (int i = 1; i <= 5; i++) {
      if (i > uAoSamples) break;
      float dist = 0.03 * float(i);
      ao += decay * max(0.0, dist - sceneSDF(p + n * dist));
      decay *= 0.8;
    }
    return clamp(1.0 - 6.0 * ao, 0.0, 1.0);
  }

  // === SOFT SHADOW ===

  float softShadow(vec3 ro, vec3 rd, float k) {
    if (uShadowSteps <= 0) return 1.0;
    float res = 1.0, t = 0.02, ph = 1e10;
    float lipschitz = 1.0 + 1.17 * uWarpStrength;
    for (int i = 0; i < 64; i++) {
      if (i >= uShadowSteps) break;
      if (t > 15.0) break;
      float h = sceneSDF(ro + rd * t);
      // Soft shadow transition — wider range prevents stair-stepping on thick shells.
      if (h < -0.03) return 0.0;
      if (h < 0.01) {
        res = min(res, smoothstep(-0.03, 0.01, h));
        ph = h;
        t += max(abs(h), 0.001) * 0.5 / lipschitz;
        continue;
      }
      float y = h * h / (2.0 * ph);
      float d = sqrt(max(h * h - y * y, 0.0));
      res = min(res, k * d / max(0.001, t - y));
      ph = h;
      t += h * 0.5 / lipschitz;
    }
    return clamp(res, 0.0, 1.0);
  }

  // === CURVATURE (Layer 1: analytical Laplacian) ===
  // Replaces 7 TPMS evals (~300 ALU) with trace-of-Hessian eigenvalue identity (~0-10 ALU).
  // P: -f, G: -2f, D: -3f (0 ALU — f already known).
  // Neovius: -f - 8*cx*cy*cz (~5 ALU). IWP: -2f + 2*(cos2x+cos2y+cos2z) (~10 ALU).
  // Corrected from Capstone which had wrong coefficients for Neovius (-9f) and IWP (-4f).

  float calcCurvature(vec3 p) {
    // Find dominant domain
    int tp = uDomainType[0];
    float freq = max(uDomainFreq[0], 0.01);
    float maxW = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= uMaxDomains) break;
      float w = domainWeight(p, i);
      if (w > maxW) { maxW = w; tp = uDomainType[i]; freq = max(uDomainFreq[i], 0.01); }
    }

    g_lastCurvFreq = freq; // store for shade() debug coefficient scaling

    vec3 q = domainWarp(p) * freq;
    float sx=sin(q.x), cx=cos(q.x);
    float sy=sin(q.y), cy=cos(q.y);
    float sz=sin(q.z), cz=cos(q.z);

    // Compute Laplacian for a given type using shared trig cache
    // Eigenvalue types: P=-f, G=-2f, D=-3f (0 ALU). Correction types need extra terms.
    float lap;

    if (uMorphBlend > 0.001) {
      // Morph active: compute Laplacian for BOTH types and blend
      float mb = uMorphBlend * uMorphBlend * (3.0 - 2.0 * uMorphBlend);

      // Laplacian A (dominant domain type)
      float lapA;
      if (tp == 1) { lapA = -(cx + cy + cz); }
      else if (tp == 2) { lapA = -3.0 * (sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz); }
      else if (tp == 3) { float fN = 3.0*(cx+cy+cz) + 4.0*cx*cy*cz; lapA = -fN - 8.0*cx*cy*cz; }
      else if (tp == 4) { float fI = 2.0*(cx*cy+cy*cz+cz*cx)-(2.0*cx*cx-1.0+2.0*cy*cy-1.0+2.0*cz*cz-1.0); float c2 = (2.0*cx*cx-1.0)+(2.0*cy*cy-1.0)+(2.0*cz*cz-1.0); lapA = -2.0*fI+2.0*c2; }
      else { lapA = -2.0 * (sx*cy + sy*cz + sz*cx); }

      // Laplacian B (morph target type)
      float lapB;
      if (uMorphTarget == 1) { lapB = -(cx + cy + cz); }
      else if (uMorphTarget == 2) { lapB = -3.0 * (sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz); }
      else if (uMorphTarget == 3) { float fN = 3.0*(cx+cy+cz) + 4.0*cx*cy*cz; lapB = -fN - 8.0*cx*cy*cz; }
      else if (uMorphTarget == 4) { float fI = 2.0*(cx*cy+cy*cz+cz*cx)-(2.0*cx*cx-1.0+2.0*cy*cy-1.0+2.0*cz*cz-1.0); float c2 = (2.0*cx*cx-1.0)+(2.0*cy*cy-1.0)+(2.0*cz*cz-1.0); lapB = -2.0*fI+2.0*c2; }
      else { lapB = -2.0 * (sx*cy + sy*cz + sz*cx); }

      lap = mix(lapA, lapB, mb);
    } else {
      // No morph: single type
      if (tp == 1) { float f = cx + cy + cz; lap = -f; }
      else if (tp == 2) { float f = sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz; lap = -3.0 * f; }
      else if (tp == 3) { float f = 3.0*(cx+cy+cz) + 4.0*cx*cy*cz; lap = -f - 8.0*cx*cy*cz; }
      else if (tp == 4) { float f = 2.0*(cx*cy+cy*cz+cz*cx)-(2.0*cx*cx-1.0+2.0*cy*cy-1.0+2.0*cz*cz-1.0); float c2 = (2.0*cx*cx-1.0)+(2.0*cy*cy-1.0)+(2.0*cz*cz-1.0); lap = -2.0*f+2.0*c2; }
      else { float f = sx*cy + sy*cz + sz*cx; lap = -2.0 * f; }
    }

    // Multiply by freq so H_approx = (lap*freq) / (2*freq*|g_tpms|) = lap/(2*|g_tpms|)
    // This makes curvature AO frequency-independent (same darkening at any lattice density).
    // Without this, H_approx scales as 1/freq because gradMag includes freq but lap does not.
    return lap * freq;
  }

  // === AO (Layer 2: curvature proxy) ===
  // Replaces 5 SDF-sample AO (~1000 ALU) with Laplacian-based darkening (~5 ALU).
  // H_approx ~ laplacian / (2*|g|). Negative H = concavity = darker.
  // Toggle: uCurvAO > 0.0 enables; strength controlled by uCurvAO value.

  float curvatureAO(vec3 p) {
    float lap = calcCurvature(p);           // Layer 1 analytical Laplacian
    float gradMag = length(g_lastBlendedGrad); // from last sceneSDF call (Layer 0)

    // Approximate mean curvature: H ~ lap / (2 * |g|)
    float H_approx = lap / (2.0 * max(gradMag, 0.1));

    // Map to AO: negative H (concavity) → darker, positive H (convexity) → brighter
    // Scale by uCurvAO for user control (default ~0.15)
    return clamp(1.0 + H_approx * uCurvAO, 0.15, 1.0);
  }

  // === GAUSSIAN CURVATURE K (Layer 3) ===
  // K = (g^T * adj(H) * g) / |g|^4 for implicit surface f(p)=0.
  // adj(H) is the cofactor matrix of the Hessian.
  // Modulates gradient color: saddles shift one way, bowls the other.
  // Toggle: uKColor > 0.0 enables.

  float calcGaussianK(vec3 p) {
    // Find dominant domain (same pattern as calcCurvature)
    int tp = uDomainType[0];
    float freq = max(uDomainFreq[0], 0.01);
    float maxW = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= uMaxDomains) break;
      float w = domainWeight(p, i);
      if (w > maxW) { maxW = w; tp = uDomainType[i]; freq = max(uDomainFreq[i], 0.01); }
    }

    vec3 q = domainWarp(p) * freq;
    float sx=sin(q.x), cx=cos(q.x);
    float sy=sin(q.y), cy=cos(q.y);
    float sz=sin(q.z), cz=cos(q.z);

    // Gradient
    vec3 g;
    // Hessian diagonal (fxx, fyy, fzz) and off-diagonal (fxy, fxz, fyz)
    float fxx, fyy, fzz, fxy, fxz, fyz;

    if (tp == 1) { // Schwarz-P: diagonal Hessian
      g = vec3(-sx, -sy, -sz);
      fxx = -cx; fyy = -cy; fzz = -cz;
      fxy = 0.0; fxz = 0.0; fyz = 0.0;
    } else if (tp == 2) { // Diamond
      g = vec3(cx*sy*sz+cx*cy*cz-sx*sy*cz-sx*cy*sz,
               sx*cy*sz-sx*sy*cz+cx*cy*cz-cx*sy*sz,
               sx*sy*cz-sx*cy*sz-cx*sy*sz+cx*cy*cz);
      float f = sx*sy*sz+sx*cy*cz+cx*sy*cz+cx*cy*sz;
      fxx = -f; fyy = -f; fzz = -f;
      fxy = cx*cy*sz-cx*sy*cz-sx*cy*cz+sx*sy*sz;
      fxz = cx*sy*cz-cx*cy*sz+sx*sy*sz-sx*cy*cz;
      fyz = sx*cy*cz+sx*sy*sz-cx*cy*sz-cx*sy*cz;
    } else if (tp == 3) { // Neovius
      g = vec3(-sx*(3.0+4.0*cy*cz), -sy*(3.0+4.0*cx*cz), -sz*(3.0+4.0*cx*cy));
      fxx = -cx*(3.0+4.0*cy*cz); fyy = -cy*(3.0+4.0*cx*cz); fzz = -cz*(3.0+4.0*cx*cy);
      fxy = 4.0*sx*sy*cz; fxz = 4.0*sx*cy*sz; fyz = 4.0*cx*sy*sz;
    } else if (tp == 4) { // IWP
      g = vec3(2.0*sx*(2.0*cx-cy-cz), 2.0*sy*(2.0*cy-cx-cz), 2.0*sz*(2.0*cz-cx-cy));
      fxx = 2.0*(2.0*(cx*cx-sx*sx)-cx*(cy+cz));
      fyy = 2.0*(2.0*(cy*cy-sy*sy)-cy*(cx+cz));
      fzz = 2.0*(2.0*(cz*cz-sz*sz)-cz*(cx+cy));
      fxy = 2.0*sx*sy; fxz = 2.0*sx*sz; fyz = 2.0*sy*sz;
    } else { // Gyroid
      g = vec3(cx*cy-sz*sx, -sx*sy+cy*cz, -sy*sz+cz*cx);
      fxx = -sx*cy-sz*cx; fyy = -sx*cy-sy*cz; fzz = -sy*cz-sz*cx;
      fxy = -cx*sy; fxz = -cz*sx; fyz = -cy*sz;
    }

    // K = (g^T * adj(H) * g) / |g|^4
    // adj(H) cofactors: Cij = Hii*Hjj - Hij^2 (diagonal), etc.
    float Cxx = fyy*fzz - fyz*fyz;
    float Cyy = fxx*fzz - fxz*fxz;
    float Czz = fxx*fyy - fxy*fxy;
    float Cxy = fxz*fyz - fxy*fzz;
    float Cxz = fxy*fyz - fxz*fyy;
    float Cyz = fxy*fxz - fyz*fxx;

    float g2 = dot(g, g);
    if (g2 < 0.001) return 0.0;

    float num = g.x*g.x*Cxx + g.y*g.y*Cyy + g.z*g.z*Czz
              + 2.0*(g.x*g.y*Cxy + g.x*g.z*Cxz + g.y*g.z*Cyz);
    return num / (g2 * g2);
  }

  // === SHADE ===

  vec3 shade(vec3 p, vec3 n, vec3 rd, float pixelAngle, float t, float coreD) {
    vec3 V = -rd;
    vec3 l1 = normalize(vec3(0.6, 0.8, 0.3));      // Key light: above-forward (shape-from-shading research)
    vec3 l2 = normalize(vec3(-0.3, 0.4, -0.5));  // Fill light: opposite side (lifts dark tunnels)
    // Shadow/AO offset: scale with shell thickness so the offset escapes the shell.
    // 1.5x = stable (50% clearance). 1.2x = pulse (shadows breathe with thickness).
    float escMult = uShadowPulse > 0.5 ? 1.2 : 1.5;
    vec3 pOff = p + n * max(0.005, g_lastBlendedThick * escMult);

    // Color mapping: normal direction + view angle (smooth, artifact-free)
    // with optional curvature boost via Curv Color slider
    float NdotV = max(dot(n, V), 0.0);
    float curv = 0.0;

    // Base gradient: vertical normal direction blended with view angle (production pattern)
    float baseT = mix(0.5 + 0.5 * n.y, 1.0 - NdotV, 0.4);
    float gradT = baseT;

    // Curvature boost: when Curv Color > 0, blend in Laplacian curvature for topology-following color
    // calcCurvature returns lap*freq. Divide by freq here so curvatureColorStrength
    // slider meaning is preserved (same visual at same slider value, independent of frequency).
    if (uCurvatureColorStrength > 0.0) {
      curv = calcCurvature(p);
      float curvScale = 1.0 / max(g_lastCurvFreq, 1.0);
      float curvT = clamp(0.5 - curv * curvScale * uCurvatureColorStrength, 0.0, 1.0);
      gradT = mix(baseT, curvT, 0.5); // 50% curvature influence
    } else if (uCurvatureMode > 0) {
      curv = calcCurvature(p);
    }

    // Layer 3: Gaussian curvature K shifts gradient color
    // Saddles (K<0) shift one direction, bowls (K>0) shift the other.
    // Creates topology-following color texture.
    // Fade out at distance (saves ~34 ALU, fog dominates at distance)
    // Smoothstep fade avoids visible pop ring at hard t=8.0 cutoff
    float lodFade = 1.0 - smoothstep(7.0, 9.0, t);
    if (uKColor > 0.0 && lodFade > 0.0) {
      float K = calcGaussianK(p);
      // Attenuate kColor at high freq to compensate for increased spatial density.
      // At default freq (3.5): freqAttn=1.0. At freq=7: freqAttn=0.5 (smoother color).
      float kFreqAttn = 3.5 / max(g_lastCurvFreq, 1.0);
      float K_shift = clamp(K * uKColor * kFreqAttn, -0.4, 0.4);
      gradT = clamp(gradT + K_shift * lodFade, 0.0, 1.0);
    }

    float roughness = uRoughness;

    // Layer 4: normal-variation roughness modulation
    // High normal variation = rough (scattered highlights), low = smooth (sharp reflections).
    // dFdx/dFdy are safe here: shade() is called uniformly per fragment.
    // Fade out at distance (matches Layer 3 lodFade)
    if (uRoughMod > 0.0 && lodFade > 0.0) {
      vec3 dnx = dFdx(n);
      vec3 dny = dFdy(n);
      float normalVariation = sqrt(dot(dnx, dnx) + dot(dny, dny));
      roughness = clamp(roughness + normalVariation * uRoughMod * lodFade, 0.05, 1.0);
    }

    // curv is freq-scaled — compensate debug coefficients so debug modes
    // show the same visual range regardless of frequency.
    // curvDbgScale scoped per-branch to avoid stale g_lastCurvFreq if new modes are added.
    float curvViz = 0.0;
    if (uCurvatureMode == 1) {
      float curvDbgScale = 1.0 / max(g_lastCurvFreq, 1.0);
      roughness = clamp(roughness + abs(curv) * 0.15 * curvDbgScale, 0.05, 1.0);
    } else if (uCurvatureMode == 2) {
      float curvDbgScale = 1.0 / max(g_lastCurvFreq, 1.0);
      curvViz = clamp(curv * 0.5 * curvDbgScale, -1.0, 1.0);
      roughness = clamp(roughness + abs(curv) * 0.15 * curvDbgScale, 0.05, 1.0);
    }

    // Per-domain color blending (capped by tier)
    vec3 albedo = vec3(0.0);
    float totalW = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= uMaxDomains) break;
      float w = domainWeight(p, i);
      if (w < 0.01) continue;
      albedo += w * sampleDomainGradient(gradT, i);
      totalW += w;
    }
    if (totalW > 0.01) albedo /= totalW;
    else albedo = sampleDomainGradient(gradT, 0);

    // Curvature debug override
    if (uCurvatureMode == 2) {
      albedo = curvViz > 0.0 ? mix(vec3(0.3), vec3(1.0, 0.2, 0.1), curvViz)
                              : mix(vec3(0.3), vec3(0.1, 0.3, 1.0), -curvViz);
    }

    // Spatial color gradient — position-based, view-independent tint.
    // Breaks color uniformity during rotation by anchoring subtle variation to world position.
    if (uSpatialColor > 0.0) {
      float spatialT = dot(normalize(p), vec3(0.3, 0.7, 0.2));
      spatialT = spatialT * 0.5 + 0.5;
      albedo = mix(albedo, albedo * vec3(1.25, 0.82, 0.90), spatialT * uSpatialColor);
    }

    // Distance-based LOD: skip expensive lighting for far hits
    float rimAOVal = 1.0; // default: no AO masking (far LOD, AO off)
    vec3 color;
    if (t > 12.0) {
      // Far: ambient only, skip AO/shadow/SSS/IBL (fog dominates anyway).
      // IBL absent here — brightness step at t=12 if uEnvWeight > ~0.3.
      float simpleLight = max(dot(n, l1), 0.0) * 0.6 + 0.4;
      color = albedo * simpleLight;
    } else if (t > 6.0) {
      // Mid: curvature AO (Layer 2) or reduced 2-sample SDF AO
      float midAo = 1.0;
      if (uCurvAO > 0.0) {
        midAo = curvatureAO(pOff);
      } else if (uAoSamples > 0) {
        float aoVal = 0.0; float decay = 1.0;
        for (int ai = 1; ai <= 2; ai++) {
          float dist = 0.03 * float(ai);
          aoVal += decay * max(0.0, dist - sceneSDF(pOff + n * dist));
          decay *= 0.8;
        }
        midAo = clamp(1.0 - 6.0 * aoVal, 0.0, 1.0);
      }
      // Shadow via NdotL falloff, respects uShadowStrength for consistency with near branch
      float midNdotL = max(dot(n, l1), 0.0);
      float midShadow = mix(1.0, 0.6 + 0.4 * midNdotL, uShadowStrength);
      color = shadePBR(n, V, l1, albedo, roughness, uMetallic, 2.0) * midShadow;
      color += shadePBR(n, V, l2, albedo, roughness, uMetallic, 0.8) * midAo;
      vec3 ambient = mix(vec3(0.04), vec3(0.12, 0.16, 0.25), 0.5 + 0.5 * n.y) * midAo * albedo;
      color += ambient;
      // IBL: SH L2 environment lighting (mid-distance)
      // SH used for both diffuse irradiance and specular approximation (no cubemap).
      // Specular is roughness-independent at SH L2 frequency — acceptable for studio ambient.
      if (uEnvWeight > 0.0) {
        vec3 F0_env = mix(vec3(0.04), albedo, uMetallic);
        vec3 F_env = fresnelSchlick(NdotV, F0_env);
        vec3 kD_env = (1.0 - F_env) * (1.0 - uMetallic);
        vec3 irradiance = evaluateSH(n);
        vec3 R = reflect(-V, n);
        vec3 prefilteredColor = evaluateSH(R);
        vec2 brdf = envBRDF(NdotV, roughness);
        vec3 specEnv = max(prefilteredColor * (F0_env * brdf.x + brdf.y), vec3(0.0));
        color += (irradiance * albedo * kD_env + specEnv) * uEnvWeight * midAo;
      }
      rimAOVal = midAo; // capture for rim AO masking
    } else {
      // Near: curvature AO (Layer 2) or full SDF AO
      float ao = (uCurvAO > 0.0) ? curvatureAO(pOff) : calcAO(pOff, n);
      float NdotL1 = max(dot(n, l1), 0.0);
      float rawShadow = 0.6 + 0.4 * NdotL1;
      float shadow = mix(1.0, rawShadow, uShadowStrength);

      // PBR lighting
      color = shadePBR(n, V, l1, albedo, roughness, uMetallic, 2.0) * shadow;
      color += shadePBR(n, V, l2, albedo, roughness, uMetallic, 0.8) * ao;

      // Ambient
      vec3 ambient = mix(vec3(0.04), vec3(0.12, 0.16, 0.25), 0.5 + 0.5 * n.y) * ao * albedo;
      color += ambient;

      // IBL: SH L2 environment lighting (near)
      if (uEnvWeight > 0.0) {
        vec3 F0_env = mix(vec3(0.04), albedo, uMetallic);
        vec3 F_env = fresnelSchlick(NdotV, F0_env);
        vec3 kD_env = (1.0 - F_env) * (1.0 - uMetallic);
        vec3 irradiance = evaluateSH(n);
        vec3 R = reflect(-V, n);
        vec3 prefilteredColor = evaluateSH(R);
        vec2 brdf = envBRDF(NdotV, roughness);
        vec3 specEnv = max(prefilteredColor * (F0_env * brdf.x + brdf.y), vec3(0.0));
        color += (irradiance * albedo * kD_env + specEnv) * uEnvWeight * ao;
      }

      // SSS — wrapped diffuse + grazing scatter
      if (uSssIntensity > 0.0) {
        float NdotL1 = dot(n, l1);
        float NdotL2 = dot(n, l2);
        float wrap1 = max(0.0, (NdotL1 + 0.5) / 1.5);
        float wrap2 = max(0.0, (NdotL2 + 0.5) / 1.5);
        float wrapSSS = wrap1 * (1.0 - max(NdotL1, 0.0)) + wrap2 * 0.3 * (1.0 - max(NdotL2, 0.0));
        float scatter = pow(1.0 - NdotV, 2.0) * 0.5;
        color += albedo * (wrapSSS + scatter) * uSssIntensity * 0.6;
      }

      // Thickness-based transmittance SSS (decoupled from wrap SSS)
      // Thin walls glow when backlit. Uses stored blended gradient (Layer 0 infra).
      // Controlled by uSssDensity (0=off). Independent of uSssIntensity.
      if (uTranslucency > 0.001 && uSssDensity > 0.0) {
        // Use blended gradient magnitude from sceneSDF (already stored)
        float gradMag = length(g_lastBlendedGrad);
        // Estimate local shell thickness from dominant domain
        float avgThick = 0.0;
        float tw = 0.0;
        for (int di = 0; di < 4; di++) {
          if (di >= uMaxDomains) break;
          float dw = domainWeight(pOff, di);
          if (dw < 0.01) continue;
          avgThick += dw * uDomainThick[di] / max(uDomainFreq[di], 0.01);
          tw += dw;
        }
        avgThick = tw > 0.01 ? avgThick / tw : 0.05;
        float localThickness = 2.0 * avgThick / max(gradMag, 0.01);
        float transmission = exp(-localThickness * uSssDensity);
        float NdotL_back = max(dot(-n, l1), 0.0);
        color += albedo * NdotL_back * transmission * uTranslucency * 0.8;
      }
      rimAOVal = ao; // capture for rim AO masking
    }

    // Floor NdotV for PBR stability
    float signedNdotV = dot(n, V); // raw signed value (negative = back-facing)
    NdotV = max(signedNdotV, 0.08);

    // Layer 5: Rim lighting — additive HDR, shell-aware
    if (uRimStrength > 0.0) {
      // Standard Fresnel rim: peaks at silhouette edges (NdotV -> 0)
      float rim = pow(1.0 - NdotV, uRimExponent) * uRimStrength;

      // Gate 1: Back-face suppression.
      // getAnalyticalNormal does NOT flip to face camera — dot(n,V) can be negative.
      // Back-facing hits (signedNdotV < 0) are back walls seen through tubes.
      // Smooth ramp: fully off at signedNdotV < 0, ramps in from 0 to 0.1.
      rim *= smoothstep(0.0, 0.1, signedNdotV);

      // Gate 2: Aura suppression.
      // Aura hits (coreD > 0) are near-miss rays in void space — no rim.
      // Smooth transition at the core/aura boundary.
      rim *= 1.0 - smoothstep(-0.005, 0.01, coreD);

      // Freq density compensation
      rim *= 3.5 / max(g_lastCurvFreq, 1.0);

      // User-controlled attenuations
      float rimNdotL = smoothstep(0.0, 0.4, max(dot(n, l1), 0.0));
      rim *= mix(1.0, 0.3 + 0.7 * rimNdotL, uRimShadow);
      rim *= mix(1.0, rimAOVal, uRimAOMask);

      // LOD fade
      rim *= 1.0 - smoothstep(7.0, 10.0, t);

      // Rim color: white-biased for HDR glow, tinted by surface
      vec3 rimCol = uRimColor.r < 0.0
        ? mix(vec3(1.0), albedo, 0.3)
        : uRimColor;

      color += rim * rimCol;
    }

    // AA edge softening — only near silhouettes (NdotV < 0.5).
    // Gating prevents A2 dark swirls from NdotV floor 0.05 creating 20x edge width.
    if (pixelAngle > 0.0 && NdotV < 0.5) {
      float aaStrength = smoothstep(0.5, 0.2, NdotV);
      float pixelSize = t * pixelAngle;
      float sdfEdgeWidth = pixelSize / max(NdotV, 0.3);
      float sdfVal = sceneSDF(p);
      float aa = smoothstep(sdfEdgeWidth, 0.0, sdfVal);
      color *= mix(1.0, aa, aaStrength);
    }

    return color;
  }

  // === SHELL JUMP DISTANCE ===
  // Computes distance to jump past current surface for multi-hit marching.
  // Sheet: jump past both walls (2.5x thickness). Network: jump half-period to next cell.
  float shellJumpDist() {
    float jump = 0.0;
    int safeMode = clamp(uTPMSMode, 0, 2);
    for (int di = 0; di < 4; di++) {
      if (di >= uMaxDomains) break;
      float freq = max(uDomainFreq[di], 0.01);
      if (safeMode == 0) {
        float maxThick = uDomainThick[di] + abs(uBreathAmp);
        // Slightly wider jump to clear the aura detection zone
        if (uAuraScale > 0.0) maxThick *= (1.0 + uAuraScale * 0.4);
        jump = max(jump, 2.5 * maxThick / freq);
      } else {
        jump = max(jump, PI / freq);
      }
    }
    return clamp(max(jump, 0.01), 0.01, uClipRadius * 0.4);
  }

  // === MAIN ===

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
    vec3 bgColor = vec3(0.02, 0.03, 0.05);

    vec3 ro, rd;
    setupCamera(uv, ro, rd);

    // Pre-loop pixel footprint for AA (computed before raymarch so derivative
    // functions run under uniform control flow)
    vec3 dRdx = dFdx(rd);
    vec3 dRdy = dFdy(rd);
    float pixelAngle = sqrt(dot(dRdx, dRdx) + dot(dRdy, dRdy)) * 0.5;

    // Sphere intersection (shared by all layers)
    float tNear, tFar;
    if (!intersectSphere(ro, rd, uClipRadius, tNear, tFar)) {
      fragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    // Step-count heatmap debug mode — single hit only
    if (uDebugHeatmap > 0) {
      int steps;
      float t = raymarch(ro, rd, max(tNear, 0.0), tFar, steps);
      float ratio = float(steps) / float(uMaxSteps);
      vec3 col;
      if (t >= MAX_DIST) {
        col = vec3(0.05);
      } else if (ratio < 0.25) {
        col = mix(vec3(0.0, 0.4, 0.0), vec3(0.0, 0.8, 0.0), ratio * 4.0);
      } else if (ratio < 0.5) {
        col = mix(vec3(0.0, 0.8, 0.0), vec3(0.9, 0.9, 0.0), (ratio - 0.25) * 4.0);
      } else if (ratio < 0.75) {
        col = mix(vec3(0.9, 0.9, 0.0), vec3(0.9, 0.4, 0.0), (ratio - 0.5) * 4.0);
      } else {
        col = mix(vec3(0.9, 0.4, 0.0), vec3(1.0, 0.0, 0.0), (ratio - 0.75) * 4.0);
      }
      fragColor = vec4(col, 1.0);
      return;
    }

    // === Multi-hit layered marching ===
    // When uTranslucency > 0: march through multiple surfaces, composite with Fresnel alpha.
    // When uTranslucency = 0: single hit (original opaque behavior, zero overhead).

    int maxLayers = (uTranslucency > 0.001) ? uMaxLayers : 1;
    float jumpDist = (uTranslucency > 0.001) ? shellJumpDist() : 0.0;

    vec3 accColor = vec3(0.0);
    float accAlpha = 0.0;
    float accumThick = 0.0; // Cumulative shell thickness for Beer-Lambert absorption
    float tStart = max(tNear, 0.0);

    for (int layer = 0; layer < 5; layer++) {
      if (layer >= maxLayers) break;
      if (accAlpha > 0.95) break;
      if (tStart > tFar) break;

      int steps;
      float hitT = raymarch(ro, rd, tStart, tFar, steps);
      if (hitT >= MAX_DIST) break;

      vec3 p = ro + rd * hitT;
      vec3 n = getAnalyticalNormal(p);

      // Capture hit-point state before shade() overwrites globals via AO/shadow sceneSDF calls
      float hitCoreD = g_lastCoreD;
      float hitBlendedThick = g_lastBlendedThick;

      vec3 layerCol;

      // Debug domain color mode
      if (uDebugDomains > 0) {
        float wN = domainWeight(p, 0);
        float wE = domainWeight(p, 1);
        float wS = domainWeight(p, 2);
        float wW = domainWeight(p, 3);
        layerCol = vec3(wN + wW * 0.8, wE + wW * 0.8, wS);
        layerCol *= 0.3 + 0.7 * max(dot(n, normalize(vec3(0.5, 1.0, 0.3))), 0.0);
      } else {
        layerCol = min(shade(p, n, rd, pixelAngle, hitT, hitCoreD) * uBrightness, vec3(10.0));
      }

      // Fog per layer (Layer 6: atmospheric perspective, only when enabled)
      if (uAtmoFog > 0.0) {
        float fog = 1.0 - exp(-0.02 * hitT * hitT);
        vec3 warmRef = vec3(0.05, 0.04, 0.06);
        vec3 fogColor = mix(warmRef, bgColor, fog);
        layerCol = mix(layerCol, fogColor, fog * uAtmoFog);
      }

      // Beer-Lambert absorption — light accumulates tint color through shell thickness.
      // uAbsorptionColor = what passes through (gold → gold tint). Absorb the complement.
      if (uAbsorption > 0.0 && accumThick > 0.0) {
        vec3 sigma = vec3(1.0) - uAbsorptionColor; // absorb what ISN'T the tint color
        vec3 transmittance = exp(-uAbsorption * accumThick * sigma);
        layerCol *= transmittance;
      }
      // Accumulate this shell's thickness for subsequent layers
      accumThick += hitBlendedThick * 2.0; // full shell thickness (both walls)

      // Edge fade — adaptive zone width based on cell size.
      // At low freq (<=3.5), fadeWidth clamps to 0.18 (matches pre-5B behavior).
      // At high freq, fade zone shrinks so fewer cells are dissolved.
      float r = length(p) / uClipRadius;
      // Use g_lastCurvFreq if set by shade() (curvAO on), else fall back to domain 0
      float edgeFreq = g_lastCurvFreq > 0.5 ? g_lastCurvFreq : max(uDomainFreq[0], 1.0);
      float edgeCellSize = 1.0 / (edgeFreq * uClipRadius);
      float fadeWidth = clamp(1.5 * edgeCellSize, 0.03, 0.18);
      float edgeFade = 1.0 - smoothstep(1.0 - fadeWidth, 1.0, r);

      // Compute layer opacity
      float layerAlpha;
      if (uTranslucency < 0.001) {
        layerAlpha = 1.0; // opaque mode — single hit, full opacity
      } else {
        // Fresnel-based alpha: more transparent head-on, opaque at grazing.
        // Use PBR-consistent F0. Metallic surfaces reflect more (higher F0 = more opaque).
        // At metallic=0: F0=0.04 (dielectric glass, unchanged). At metallic=1: F0=0.8 (nearly opaque).
        vec3 V = -rd;
        float cosTheta = max(dot(n, V), 0.0);
        float F0_alpha = mix(0.04, 0.8, uMetallic);
        float fresnelReflect = F0_alpha + (1.0 - F0_alpha) * pow(1.0 - cosTheta, 5.0);
        // Quadratic ramp: small translucency values stay mostly opaque
        float t2 = uTranslucency * uTranslucency; // 0.3 → 0.09, 0.5 → 0.25, 1.0 → 1.0
        float minOpacity = mix(1.0, 0.1, t2); // opaque at 0, glass-like at 1
        float fresnelAlpha = mix(minOpacity, 1.0, fresnelReflect);
        // Deeper layers get progressively more transparent
        layerAlpha = fresnelAlpha * exp(-0.3 * float(layer));
      }

      // Edge dissolution at sphere boundary (hybrid color/alpha fade)
      // Opaque: color-multiply with 15% floor (darken but preserve geometry)
      // Glass: alpha-based (dissolve to nothing)
      if (uTranslucency > 0.0) {
        layerAlpha *= edgeFade;
      } else {
        layerCol *= mix(0.15, 1.0, edgeFade);
      }

      // Thickness-based opacity — adaptive smoothstep range.
      // Compare hitBlendedThick against expected thickness from domain config.
      // Regions thinner than expected become more transparent (breathing troughs, boundaries).
      // At default geometry (thick=0.30, freq=3.5): expectedThick=0.086, feature shows
      // transparency only when local thickness drops below ~43% of expected.
      if (uThickOpacity > 0.0) {
        float expectedThick = uDomainThick[0] / max(uDomainFreq[0], 0.01);
        float thickAlpha = smoothstep(0.0, expectedThick, hitBlendedThick);
        layerAlpha *= mix(1.0, thickAlpha, uThickOpacity);
      }

      // Core + Aura — hybrid dual-threshold SDF with post-hit volumetric glow.
      // SDF is widened (40% of uAuraScale) to catch near-miss thin shells.
      // Core hits get volumetric glow. Aura hits (near-miss) get subtle translucency.
      if (uAuraScale > 0.0) {
        float aNdotV = max(dot(n, -rd), 0.08);
        if (hitCoreD > 0.0) {
          // Aura-zone hit (near-miss thin shell): subtle translucent halo
          float auraWidth = hitBlendedThick * uAuraScale * 0.4;
          float traverseLen = 2.0 * auraWidth / aNdotV;
          float auraAlpha = (1.0 - exp(-traverseLen * 20.0)) * 0.35;
          layerCol *= 0.85;
          layerAlpha = auraAlpha * edgeFade;
        } else {
          // Core hit: volumetric glow from aura material around the shell.
          // Optical depth = shell thickness / NdotV (more material at grazing).
          float opticalDepth = hitBlendedThick / aNdotV;
          float glowStrength = 1.0 - exp(-uAuraScale * opticalDepth * 20.0);
          layerCol *= 1.0 + glowStrength * 0.5;
          float minAlpha = glowStrength * 0.25 * edgeFade;
          layerAlpha = max(layerAlpha, minAlpha);
        }
      }

      // Front-to-back compositing
      accColor += (1.0 - accAlpha) * layerCol * layerAlpha;
      accAlpha += (1.0 - accAlpha) * layerAlpha;

      // Jump past this shell to find next wall
      tStart = hitT + jumpDist;
    }

    // Blend remaining transparency with background
    vec3 col;
    if (accAlpha < 0.01) {
      // Ray passed through lattice holes — output page background directly (sRGB #050810)
      fragColor = vec4(0.0196, 0.0314, 0.0627, 1.0);
      return;
    } else {
      col = accColor + (1.0 - accAlpha) * bgColor;
    }

    // ACES + gamma (ShaderMaterial needs manual gamma)
    col = acesToneMap(col);
    col = pow(col, vec3(1.0 / 2.2));

    // NaN safety
    if (col.r != col.r || col.g != col.g || col.b != col.b) col = vec3(0.0);

    fragColor = vec4(col, 1.0);
  }
`;

// === UNIFORM DEFAULTS ===

// 4 distinct domain palettes (LINEAR RGB)
// Source hex: D0 #253545/#00213b/#7a9aaa/#6a8898/#354555, D1 #352518/#4a3020/#b8752a/#dea12e/#ffd67e
//             D2 #182518/#204520/#339044/#60b068/#9fff9f, D3 #251830/#352545/#9040a0/#b860c0/#d888d8
const DOMAIN_PALETTES: [number, number, number][][] = [
  // Domain 0 (North/gyroid): blue-gray ramp — all stops visible after sRGB→linear
  // Hex: #253545, #00213b, #7a9aaa, #6a8898, #354555
  [[0.020, 0.040, 0.063], [0, 0.015, 0.044], [0.195, 0.323, 0.402], [0.138, 0.228, 0.300], [0.040, 0.063, 0.090]],
  // Domain 1 (East/schwarzP): warm brown ramp -> gold (all stops #25+ per channel after sRGB)
  // Hex: #352518, #4a3020, #b8752a, #dea12e, #ffd67e
  [[0.040, 0.020, 0.009], [0.070, 0.033, 0.012], [0.479, 0.178, 0.023], [0.730, 0.356, 0.027], [1.0, 0.672, 0.209]],
  // Domain 2 (South/diamond): deep green ramp -> emerald (all stops #25+ per channel after sRGB)
  // Hex: #182518, #204520, #339044, #60b068, #9fff9f
  [[0.009, 0.020, 0.009], [0.012, 0.063, 0.012], [0.033, 0.279, 0.058], [0.117, 0.434, 0.138], [0.347, 1.0, 0.347]],
  // Domain 3 (West/IWP): deep purple ramp -> lavender (all stops #25+ per channel after sRGB)
  // Hex: #251830, #352545, #9040a0, #b860c0, #d888d8
  [[0.020, 0.009, 0.033], [0.040, 0.020, 0.063], [0.279, 0.051, 0.352], [0.479, 0.117, 0.527], [0.687, 0.246, 0.687]],
];

export const SHADER_LAB_DEFAULTS: Record<string, { value: unknown }> = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1920, 1080) },
  uStepMult: { value: 0.45 },
  uBrightness: { value: 1.2 },
  uClipRadius: { value: 4.0 },
  uCamPos: { value: new THREE.Vector3(0, 5 * Math.sin(15 * Math.PI / 180), 5 * Math.cos(15 * Math.PI / 180)) },
  uCamTarget: { value: new THREE.Vector3(0, 0, 0) },
  // Quality tier (defaults = full quality)
  uMaxSteps: { value: 192 },
  uAoSamples: { value: 5 },
  uShadowSteps: { value: 48 },
  uMaxDomains: { value: 4 },
  uDebugHeatmap: { value: 0 },
  // 4 domains always
  uDomainType: { value: [0, 1, 2, 4] },
  uDomainFreq: { value: [9.5, 9.0, 4.0, 3.5] },
  uDomainThick: { value: [0.30, 0.30, 0.30, 0.30] },
  uDomainIso: { value: [0.40, -0.40, 0.30, 0.60] },
  uBlendWidth: { value: 0.3 },
  uDebugDomains: { value: 0 },
  // Per-domain gradients (20 Vector3s)
  uDomainGradColor: { value: DOMAIN_PALETTES.flatMap(palette =>
    palette.map(([r, g, b]) => new THREE.Vector3(r, g, b))
  ) },
  // Material
  uMetallic: { value: 0.90 },
  uRoughness: { value: 0.30 },
  uSssIntensity: { value: 0.25 },
  // Default lighting: depth cues ON, volumetric OFF
  uSssDensity: { value: 0 },
  uCurvAO: { value: 0.76 },
  uKColor: { value: 0.30 },
  uRoughMod: { value: 1.0 },
  uRimStrength: { value: 2.10 },
  uRimExponent: { value: 1.5 },
  uRimColor: { value: new THREE.Vector3(-1, -1, -1) },
  uRimShadow: { value: 1.0 },
  uRimAOMask: { value: 1.0 },
  uAtmoFog: { value: 0.05 },
  uThickOpacity: { value: 0 },
  uAbsorption: { value: 0 },
  uAbsorptionColor: { value: new THREE.Vector3(1.0, 0.8, 0.5) },
  uAuraScale: { value: 0 },
  uSpatialColor: { value: 0.50 },
  uCurvatureMode: { value: 0 },
  uCurvatureColorStrength: { value: 1.5 },
  // IBL: SH L2 environment lighting — warm studio environment.
  // SH coefficients are fixed (not per-frame updated). To add environment selector,
  // wire uSHCoeffs in useFrame via .forEach((v,i) => v.copy(newCoeffs[i])).
  uEnvWeight: { value: 0.55 },
  uSHCoeffs: { value: [
    new THREE.Vector3(0.80, 0.65, 1.10),    // L00: warm-cool base (visible blue bias)
    new THREE.Vector3(0.35, 0.25, 0.55),    // L1-1: strong top-blue, bottom-warm gradient
    new THREE.Vector3(0.06, 0.05, 0.08),    // L10: front fill
    new THREE.Vector3(0.03, 0.02, 0.01),    // L11: side asymmetry
    new THREE.Vector3(0.00, 0.00, 0.00),    // L2-2
    new THREE.Vector3(0.00, 0.00, 0.00),    // L2-1
    new THREE.Vector3(-0.03, -0.02, -0.01), // L20: equator darkening
    new THREE.Vector3(0.00, 0.00, 0.00),    // L21
    new THREE.Vector3(0.00, 0.00, 0.00),    // L22
  ] },
  // Shadow control
  uShadowStrength: { value: 1.0 },
  uShadowPulse: { value: 0 },
  // Animation: warpStrength ON for organic feel, rest OFF
  uBreathAmp: { value: 0.07 },
  uBreathSpeed: { value: 1.4 },
  uIsoSweepAmp: { value: 0.13 },
  uIsoSweepSpeed: { value: 0.5 },
  uWarpStrength: { value: 0.40 },
  uWarpSpeed: { value: 0.36 },
  uMorphTarget: { value: 4 },
  uMorphBlend: { value: 0.0 },
  uDomainPhase: { value: [0.0, 0.0, 0.0, 0.0] },
  // TPMS mode: 0=sheet (membrane), 1=solid A (positive labyrinth), 2=solid B (negative labyrinth)
  uTPMSMode: { value: 0 },
  // Translucency: OFF by default (opaque, single-hit, clear structure)
  uTranslucency: { value: 0 },
  uMaxLayers: { value: 3 },
};

// TPMS type mapping shared between component and shader
export const TPMS_TYPE_MAP: Record<string, number> = {
  auto: 0, gyroid: 0, schwarzP: 1, diamond: 2, neovius: 3, iwp: 4,
};

export const TPMS_OPTIONS = ['gyroid', 'schwarzP', 'diamond', 'neovius', 'iwp'] as const;

// === CAS (Contrast Adaptive Sharpening) Upscale Shaders ===

export const casVertexShader = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const casFragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D tInput;
  uniform vec2 uTexelSize;
  uniform float uSharpen;
  in vec2 vUv;
  out vec4 fragColor;

  void main() {
    vec3 center = texture(tInput, vUv).rgb;

    if (uSharpen < 0.01) {
      fragColor = vec4(center, 1.0);
      return;
    }

    vec3 up    = texture(tInput, vUv + vec2(0.0, uTexelSize.y)).rgb;
    vec3 down  = texture(tInput, vUv - vec2(0.0, uTexelSize.y)).rgb;
    vec3 left  = texture(tInput, vUv - vec2(uTexelSize.x, 0.0)).rgb;
    vec3 right = texture(tInput, vUv + vec2(uTexelSize.x, 0.0)).rgb;

    // Local contrast: more contrast = more sharpening (AMD CAS principle)
    vec3 mn = min(center, min(min(up, down), min(left, right)));
    vec3 mx = max(center, max(max(up, down), max(left, right)));
    float peak = max(mx.r, max(mx.g, mx.b));
    float trough = min(mn.r, min(mn.g, mn.b));
    float contrast = 1.0 - min(trough / (peak + 0.01), 1.0);
    float w = contrast * uSharpen;

    // Sharpen: center + w * (center - neighbor_average)
    vec3 avg = (up + down + left + right) * 0.25;
    vec3 sharpened = center + (center - avg) * w;

    fragColor = vec4(clamp(sharpened, 0.0, 1.0), 1.0);
  }
`;
