/**
 * Morphing Substance shader — Perlin noise displacement on icosahedron.
 * Health score drives color, amplitude, and frequency.
 *
 * Based on Maxime Heckel's R3F shader blob technique.
 * Simplex noise implementation from Ashima Arts (MIT license).
 */

export const substanceVertexShader = /* glsl */ `
  uniform float u_time;
  uniform float u_healthNormalized; // 0.0 = over budget, 1.0 = healthy

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  //
  // Simplex 3D noise (Ashima Arts, MIT)
  //
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    // Health drives animation speed: healthy = slow (0.3Hz), over = fast (1.2Hz)
    float speed = 1.2 - u_healthNormalized * 0.9;
    float noiseScale = 2.0;
    float noise = snoise(position * noiseScale + u_time * speed);

    // Healthy = calm (small displacement), stressed = agitated (large)
    float amplitude = 0.05 + 0.15 * (1.0 - u_healthNormalized);
    float displacement = noise * amplitude;
    vDisplacement = displacement;

    vec3 newPos = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

export const substanceFragmentShader = /* glsl */ `
  uniform vec3 u_colorA;
  uniform vec3 u_colorB;
  uniform float u_healthNormalized;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  void main() {
    // Mix colors based on displacement + position for organic gradient
    float mixFactor = (vDisplacement + 0.15) / 0.3;
    mixFactor = clamp(mixFactor, 0.0, 1.0);

    vec3 baseColor = mix(u_colorA, u_colorB, mixFactor);

    // Simple diffuse lighting from above
    vec3 lightDir = normalize(vec3(0.2, 1.0, 0.5));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.3;

    // Fresnel rim effect for depth
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);

    vec3 finalColor = baseColor * (ambient + diffuse * 0.7) + fresnel * 0.15;

    gl_FragColor = vec4(finalColor, 0.9);
  }
`;

/**
 * Health score to substance color mapping.
 */
export function getSubstanceColors(healthScore: number): { colorA: [number, number, number]; colorB: [number, number, number] } {
  if (healthScore > 75) {
    // Healthy: cyan → emerald
    return { colorA: [0.133, 0.827, 0.933], colorB: [0.063, 0.725, 0.506] };
  }
  if (healthScore > 50) {
    // Watchful: blue → amber
    return { colorA: [0.231, 0.510, 0.965], colorB: [0.961, 0.620, 0.043] };
  }
  if (healthScore > 25) {
    // Tight: amber → orange
    return { colorA: [0.961, 0.620, 0.043], colorB: [0.984, 0.573, 0.235] };
  }
  // Over: amber → rose
  return { colorA: [0.961, 0.620, 0.043], colorB: [0.984, 0.443, 0.522] };
}
