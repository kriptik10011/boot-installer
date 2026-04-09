/**
 * ShaderLab — Unified 4-Domain TPMS Research Prototype.
 *
 * Pipeline: FBO render at tier-controlled resolution, then CAS upscale.
 * Pipeline: Shader (FBO @ resScale) -> CAS upscale (fullscreen) -> SMAA -> screen.
 *
 * Always renders 4 spatial domains (N/E/S/W).
 * "Link Params" syncs type/freq/thickness/iso across all domains.
 * "Link Colors" syncs gradient palettes across all domains.
 * sceneSDF is the single source of truth.
 */

import { Suspense, useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { EffectComposer, SMAA } from '@react-three/postprocessing';
import { useControls, folder, Leva } from 'leva';
import * as THREE from 'three';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  shaderLabVertexShader,
  shaderLabFragmentShader,
  casVertexShader,
  casFragmentShader,
  SHADER_LAB_DEFAULTS,
  TPMS_TYPE_MAP,
  TPMS_OPTIONS,
} from './shaderLabShader';
import { hexToLinearCached } from '@/shaderMath/colorConversion';
import { enforceConstraints } from '@/shaderMath/constraintEngine';
import {
  type ShaderPreset,
  type ShaderSettings,
  BUILT_IN_PRESETS,
  loadSettings,
  saveSettings,
  loadCustomPresets,
  saveCustomPresets,
} from './shaderPresets';

// Rendering quality tiers — adaptive based on FPS
const QUALITY_TIERS = {
  full:    { resolutionScale: 1.0, maxSteps: 192, aoSamples: 5, shadowSteps: 48, maxDomains: 4 },
  reduced: { resolutionScale: 1.0, maxSteps: 128, aoSamples: 3, shadowSteps: 32, maxDomains: 4 },
  low:     { resolutionScale: 0.75, maxSteps: 96,  aoSamples: 2, shadowSteps: 16, maxDomains: 4 },
} as const;

type QualityTier = keyof typeof QUALITY_TIERS;

// Start at full quality — adaptive logic downgrades if FPS drops
const RENDER_CONFIG = QUALITY_TIERS.full;

function useFps() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const lastTime = useRef(performance.now());
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTime.current;
      if (dt > 0) setFps(Math.round((frames.current * 1000) / dt));
      frames.current = 0;
      lastTime.current = now;
    }, 500);
    return () => clearInterval(id);
  }, []);
  const tick = useCallback(() => { frames.current++; }, []);
  return { fps, tick };
}

// Adaptive quality — monitors FPS and downgrades quality tier when needed.
// Hysteresis: drop after 3 consecutive low readings, recover after 5 consecutive high readings.
function useAdaptiveQuality(fps: number) {
  const tierRef = useRef<QualityTier>('full');
  const lowCount = useRef(0);
  const highCount = useRef(0);

  useEffect(() => {
    if (fps === 0) return; // skip initial frames

    if (fps < 25) {
      lowCount.current++;
      highCount.current = 0;
      if (lowCount.current >= 3) {
        if (tierRef.current === 'full') tierRef.current = 'reduced';
        else if (tierRef.current === 'reduced') tierRef.current = 'low';
        lowCount.current = 0;
      }
    } else if (fps > 50) {
      highCount.current++;
      lowCount.current = 0;
      if (highCount.current >= 5) {
        if (tierRef.current === 'low') tierRef.current = 'reduced';
        else if (tierRef.current === 'reduced') tierRef.current = 'full';
        highCount.current = 0;
      }
    } else {
      lowCount.current = 0;
      highCount.current = 0;
    }
  }, [fps]);

  return QUALITY_TIERS[tierRef.current];
}

const CURVATURE_OPTIONS = { Off: 0, 'Roughness Mod': 1, 'Debug Viz': 2 };

// Curated color palettes — each is [shadow, darkMid, base, lightMid, highlight]
const COLOR_PALETTES: Record<string, readonly [string, string, string, string, string]> = {
  'Ocean':      ['#0a1628', '#0d2847', '#2a6090', '#4a90c0', '#8ac4e8'],
  'Amber':      ['#2a1800', '#4a3020', '#b8752a', '#dea12e', '#ffd67e'],
  'Forest':     ['#0a1a0a', '#1a3518', '#2a6830', '#50a050', '#90d890'],
  'Violet':     ['#1a0828', '#2d1545', '#6a30a0', '#9050c8', '#c090e8'],
  'Slate':      ['#1a1a20', '#2a2a35', '#505868', '#7a8898', '#a8b8c8'],
  'Copper':     ['#1a0c08', '#3a2018', '#8a4828', '#c06838', '#e8a878'],
  'Ice':        ['#081828', '#183848', '#4088a8', '#70b8d8', '#b0e8f8'],
  'Rose':       ['#280818', '#481828', '#a03858', '#c86080', '#e8a0b8'],
  'Charcoal':   ['#101010', '#1a1a1a', '#383838', '#585858', '#888888'],
  'Gold':       ['#1a1408', '#3a2a10', '#8a6820', '#c8a030', '#f0d868'],
};

// hexToLinear imported from @/shaderMath/colorConversion (shared, cached)

function useShaderControls(overrides: Record<string, unknown> = {}) {
  const v = (key: string, fallback: unknown) => overrides[key] ?? fallback;

  return useControls(() => ({
    'Camera & View': folder({
      brightness: { value: v('brightness', 1.2) as number, min: 0.3, max: 2.0, step: 0.1, label: 'Brightness', hint: 'Overall scene brightness multiplier' },
      cameraDistance: { value: v('cameraDistance', 14.5) as number, min: 2.0, max: 15.0, step: 0.5, label: 'Camera Distance', hint: 'How far the camera orbits from the center' },
      orbitSpeed: { value: v('orbitSpeed', 0.03) as number, min: 0.0, max: 0.5, step: 0.05, label: 'Orbit Speed', hint: 'Camera rotation speed. 0 = static view' },
      clipRadius: { value: v('clipRadius', 4.0) as number, min: 1.5, max: 4.0, step: 0.25, label: 'Sphere Size', hint: 'Radius of the bounding sphere that clips the lattice' },
      surfaceMode: { value: v('surfaceMode', 0) as number, options: { Sheet: 0, 'Solid A': 1, 'Solid B': 2 }, label: 'Surface Type' },
    }),
    'Render Quality': folder({
      stepMult: { value: v('stepMult', 0.45) as number, min: 0.4, max: 0.8, step: 0.05, label: 'Ray Precision', hint: 'Lower = more precise surface finding but slower. Does NOT affect shadows' },
      debugHeatmap: { value: v('debugHeatmap', false) as boolean, label: 'Step Heatmap' },
      debugDomains: { value: v('debugDomains', false) as boolean, label: 'Domain Zones' },
    }, { collapsed: true }),
    'Surface Material': folder({
      metallic: { value: v('metallic', 0.90) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Metallic', hint: 'PBR metallic reflectance. 0 = dielectric (plastic/glass), 1 = pure metal' },
      roughness: { value: v('roughness', 0.30) as number, min: 0.05, max: 1.0, step: 0.05, label: 'Roughness', hint: 'Surface micro-roughness. 0 = mirror-sharp highlights, 1 = fully diffuse' },
      curvColorStr: { value: v('curvColorStr', 1.5) as number, min: 0.0, max: 2.0, step: 0.1, label: 'Curvature Color Mix', hint: 'How strongly surface curvature influences the gradient color mapping' },
      curvMode: { value: v('curvMode', 0) as number, options: CURVATURE_OPTIONS, label: 'Curvature Debug' },
      envWeight: { value: v('envWeight', 0.55) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Environment Light', hint: 'IBL environment reflections via SH. Most visible at Metallic > 0.3' },
    }),
    'Depth & Shadows': folder({
      shadowStrength: { value: v('shadowStrength', 1.0) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Shadow Strength', hint: '0 = no shadows (clean). 0.3 = subtle depth. 1 = full raymarched shadows (may show lattice self-occlusion noise)' },
      curvAO: { value: v('curvAO', 0.76) as number, min: 0.0, max: 0.8, step: 0.02, label: 'Valley Darkening', hint: 'Darkens concavities using analytical curvature. Cheap alternative to raymarched AO' },
      kColor: { value: v('kColor', 0.30) as number, min: 0.0, max: 1.5, step: 0.05, label: 'Topology Color', hint: 'Shifts gradient color based on Gaussian curvature. Saddles vs bowls get different hues' },
      roughMod: { value: v('roughMod', 1.0) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Edge Roughness', hint: 'High-curvature edges scatter highlights broadly, flat areas stay sharp', render: (get) => (get('Surface Material.roughness') as number) < 0.8 },
      rimStrength: { value: v('rimStrength', 2.10) as number, min: 0.0, max: 6.0, step: 0.05, label: 'Rim Light', hint: 'Edge glow intensity. Low = subtle contour. High = solid color on angled surfaces' },
      rimExponent: { value: v('rimExponent', 1.5) as number, min: 0.5, max: 5.0, step: 0.5, label: 'Rim Width', hint: '0.5=covers most of surface, 3=moderate edge band, 5=tight silhouette only', render: (get) => (get('Depth & Shadows.rimStrength') as number) > 0 },
      rimShadow: { value: v('rimShadow', 1.0) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Rim Shadow', hint: 'How much shadows dim rim. 0=rim ignores shadow, 1=full shadow masking', render: (get) => (get('Depth & Shadows.rimStrength') as number) > 0 },
      rimAOMask: { value: v('rimAOMask', 1.0) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Rim AO Mask', hint: 'How much AO dims rim in concavities. 0=rim ignores AO, 1=full AO masking', render: (get) => (get('Depth & Shadows.rimStrength') as number) > 0 },
      atmoFog: { value: v('atmoFog', 0.05) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Distance Fog', hint: 'Near = warm/bright, far = cool/dim. Prevents infinite lattice from looking like flat wallpaper' },
      spatialColor: { value: v('spatialColor', 0.50) as number, min: 0.0, max: 0.5, step: 0.05, label: 'Position Color', hint: 'Adds position-based color tint that shifts as the lattice rotates. Breaks color monotony' },
    }),
    'Glass & Volume': folder({
      translucency: { value: v('translucency', 0.0) as number, min: 0.0, max: 1.0, step: 0.01, label: 'Glass Amount', hint: '0 = opaque single-hit (fast). Higher = see-through walls with multi-layer rendering (slower)' },
      maxLayers: { value: v('maxLayers', 3) as number, min: 1, max: 4, step: 1, label: 'Glass Layers', hint: 'How many shell surfaces the camera sees through. More = deeper glass effect but heavier' },
      thickOpacity: { value: v('thickOpacity', 0.0) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Thin = Transparent', hint: 'Thin shell walls become more see-through, thick walls stay opaque', render: (get) => (get('Glass & Volume.translucency') as number) > 0 },
      absorption: { value: v('absorption', 0.0) as number, min: 0.0, max: 15.0, step: 0.5, label: 'Color Absorption', hint: 'Beer-Lambert light absorption. Thicker material absorbs more light, creating colored glass', render: (get) => (get('Glass & Volume.translucency') as number) > 0 },
      absorptionColor: { value: v('absorptionColor', '#ffcc88') as string, label: 'Absorption Color', render: (get) => (get('Glass & Volume.translucency') as number) > 0 },
      sssIntensity: { value: v('sssIntensity', 0.25) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Subsurface Glow', hint: 'Wrapped diffuse lighting that fills shadows. Simulates light scattering inside the material' },
      sssDensity: { value: v('sssDensity', 0.0) as number, min: 0.0, max: 20.0, step: 0.5, label: 'Glow Density', hint: 'Thickness-based backlit glow. Thin walls glow when lit from behind (requires Glass > 0)', render: (get) => (get('Glass & Volume.translucency') as number) > 0 },
      auraScale: { value: v('auraScale', 0.0) as number, min: 0.0, max: 1.0, step: 0.05, label: 'Outer Glow', hint: 'Soft halo around shell edges. Catches near-miss rays for a volumetric glow effect' },
    }, { collapsed: true }),
    'Animation': folder({
      shadowPulse: { value: v('shadowPulse', false) as boolean, label: 'Breathing Shadows', render: (get) => (get('Depth & Shadows.shadowStrength') as number) > 0 },
      breathAmp: { value: v('breathAmp', 0.07) as number, min: 0.0, max: 0.15, step: 0.005, label: 'Thickness Breathing', hint: 'Shell walls rhythmically expand and contract' },
      breathSpeed: { value: v('breathSpeed', 1.4) as number, min: 0.0, max: 5.0, step: 0.1, label: 'Breath Rate', hint: 'How fast the breathing oscillates', render: (get) => (get('Animation.breathAmp') as number) > 0 },
      isoSweepAmp: { value: v('isoSweepAmp', 0.13) as number, min: 0.0, max: 0.4, step: 0.01, label: 'Surface Ripple', hint: 'The iso-surface threshold sweeps back and forth, creating a ripple across the geometry' },
      isoSweepSpeed: { value: v('isoSweepSpeed', 0.5) as number, min: 0.0, max: 3.0, step: 0.1, label: 'Ripple Rate', hint: 'How fast the surface ripple oscillates', render: (get) => (get('Animation.isoSweepAmp') as number) > 0 },
      warpStrength: { value: v('warpStrength', 0.40) as number, min: 0.0, max: 0.4, step: 0.01, label: 'Domain Warp', hint: 'Sine-based spatial distortion that gives the lattice an organic, non-mechanical feel' },
      warpSpeed: { value: v('warpSpeed', 0.36) as number, min: 0.0, max: 1.0, step: 0.01, label: 'Warp Rate', hint: 'How fast the domain warp evolves over time', render: (get) => (get('Animation.warpStrength') as number) > 0 },
      morphTarget: { value: v('morphTarget', 'iwp') as string, options: [...TPMS_OPTIONS], label: 'Morph Target', render: (get) => (get('Animation.morphBlend') as number) > 0 },
      morphBlend: { value: v('morphBlend', 0.0) as number, min: 0.0, max: 1.0, step: 0.01, label: 'Morph Amount', hint: '0 = current type only. 1 = fully morphed to target. Field-normalized blending' },
      phaseMode: { value: v('phaseMode', 'sync') as string, options: ['sync', 'stagger', 'antiphase'], label: 'Domain Phase' },
    }, { collapsed: true }),
    'Domain Blend': folder({
      blendWidth: { value: v('blendWidth', 0.20) as number, min: 0.20, max: 0.25, step: 0.01, label: 'Blend Width', hint: 'Transition zone between domains. Min 0.20 for smooth edges. Clamped by C-18 to prevent >30% domain overlap' },
      linkParams: { value: v('linkParams', false) as boolean, label: 'Sync All Params' },
      linkColors: { value: v('linkColors', false) as boolean, label: 'Sync All Colors' },
    }, { collapsed: true }),
    'Domain 0 (North)': folder({
      d0type: { value: v('d0type', 'gyroid') as string, options: [...TPMS_OPTIONS] },
      d0freq: { value: v('d0freq', 9.5) as number, min: 3.0, max: 20.0, step: 0.5, label: 'freq' },
      d0thick: { value: v('d0thick', 0.30) as number, min: 0.03, max: 1.5, step: 0.01, label: 'thick' },
      d0iso: { value: v('d0iso', 0.40) as number, min: -0.8, max: 0.8, step: 0.05, label: 'iso' },
      d0palette: { value: v('d0palette', 'Custom') as string, options: ['Custom', ...Object.keys(COLOR_PALETTES)], label: 'Palette' },
      d0c0: { value: v('d0c0', '#0a1840') as string, label: 'Shadow' },
      d0c1: { value: v('d0c1', '#1a3870') as string, label: 'Dark Mid' },
      d0c2: { value: v('d0c2', '#3070c0') as string, label: 'Base' },
      d0c3: { value: v('d0c3', '#50a0e0') as string, label: 'Light Mid' },
      d0c4: { value: v('d0c4', '#80d0ff') as string, label: 'Highlight' },
    }),
    'Domain 1 (East)': folder({
      d1type: { value: v('d1type', 'schwarzP') as string, options: [...TPMS_OPTIONS] },
      d1freq: { value: v('d1freq', 9.0) as number, min: 3.0, max: 20.0, step: 0.5, label: 'freq' },
      d1thick: { value: v('d1thick', 0.30) as number, min: 0.03, max: 1.5, step: 0.01, label: 'thick' },
      d1iso: { value: v('d1iso', -0.40) as number, min: -0.8, max: 0.8, step: 0.05, label: 'iso' },
      d1palette: { value: v('d1palette', 'Custom') as string, options: ['Custom', ...Object.keys(COLOR_PALETTES)], label: 'Palette' },
      d1c0: { value: v('d1c0', '#401018') as string, label: 'Shadow' },
      d1c1: { value: v('d1c1', '#702030') as string, label: 'Dark Mid' },
      d1c2: { value: v('d1c2', '#c04050') as string, label: 'Base' },
      d1c3: { value: v('d1c3', '#e06050') as string, label: 'Light Mid' },
      d1c4: { value: v('d1c4', '#ff9070') as string, label: 'Highlight' },
    }, { collapsed: true }),
    'Domain 2 (South)': folder({
      d2type: { value: v('d2type', 'diamond') as string, options: [...TPMS_OPTIONS] },
      d2freq: { value: v('d2freq', 4.0) as number, min: 3.0, max: 20.0, step: 0.5, label: 'freq' },
      d2thick: { value: v('d2thick', 0.30) as number, min: 0.03, max: 1.5, step: 0.01, label: 'thick' },
      d2iso: { value: v('d2iso', 0.30) as number, min: -0.6, max: 0.6, step: 0.05, label: 'iso' },
      d2palette: { value: v('d2palette', 'Custom') as string, options: ['Custom', ...Object.keys(COLOR_PALETTES)], label: 'Palette' },
      d2c0: { value: v('d2c0', '#0a3010') as string, label: 'Shadow' },
      d2c1: { value: v('d2c1', '#1a5020') as string, label: 'Dark Mid' },
      d2c2: { value: v('d2c2', '#309040') as string, label: 'Base' },
      d2c3: { value: v('d2c3', '#50b860') as string, label: 'Light Mid' },
      d2c4: { value: v('d2c4', '#80e888') as string, label: 'Highlight' },
    }, { collapsed: true }),
    'Domain 3 (West)': folder({
      d3type: { value: v('d3type', 'iwp') as string, options: [...TPMS_OPTIONS] },
      d3freq: { value: v('d3freq', 3.5) as number, min: 3.0, max: 20.0, step: 0.5, label: 'freq' },
      d3thick: { value: v('d3thick', 0.30) as number, min: 0.03, max: 1.5, step: 0.01, label: 'thick' },
      d3iso: { value: v('d3iso', 0.60) as number, min: -0.8, max: 0.8, step: 0.05, label: 'iso' },
      d3palette: { value: v('d3palette', 'Custom') as string, options: ['Custom', ...Object.keys(COLOR_PALETTES)], label: 'Palette' },
      d3c0: { value: v('d3c0', '#280a40') as string, label: 'Shadow' },
      d3c1: { value: v('d3c1', '#481a68') as string, label: 'Dark Mid' },
      d3c2: { value: v('d3c2', '#7830a0') as string, label: 'Base' },
      d3c3: { value: v('d3c3', '#a050c8') as string, label: 'Light Mid' },
      d3c4: { value: v('d3c4', '#c880f0') as string, label: 'Highlight' },
    }, { collapsed: true }),
  }), []);
}

interface SceneRef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applySettings: (s: Record<string, any>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getControls: () => Record<string, any>;
}

function ShaderLabScene({ onFrame, sceneRef, qualityConfig }: {
  onFrame: () => void;
  sceneRef: React.MutableRefObject<SceneRef | null>;
  qualityConfig: typeof QUALITY_TIERS[QualityTier];
}) {
  const { gl, size, viewport } = useThree();

  // Hydrate from localStorage on first mount (no flash of defaults)
  // overrides is stable via useMemo — empty deps in useShaderControls is intentional
  const savedSettings = useMemo(() => loadSettings() ?? {}, []);
  const [controls, set] = useShaderControls(savedSettings);

  // Expose set/get to parent for preset loading
  sceneRef.current = { applySettings: (s) => set(s), getControls: () => controls };

  // Auto-save to localStorage on change
  const prevJson = useRef('');
  const lastViolationKey = useRef('');
  useEffect(() => {
    const json = JSON.stringify(controls);
    if (json !== prevJson.current) {
      prevJson.current = json;
      saveSettings(controls);
    }
  }, [controls]);

  const scale = qualityConfig.resolutionScale;

  // FBO at tier-controlled resolution
  const fboW = Math.max(1, Math.floor(size.width * viewport.dpr * scale));
  const fboH = Math.max(1, Math.floor(size.height * viewport.dpr * scale));
  const fbo = useFBO(fboW, fboH, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  // Refs to avoid stale closure in useFrame on tier/resize transitions
  const fboRef = useRef({ w: fboW, h: fboH, target: fbo, scale });
  fboRef.current = { w: fboW, h: fboH, target: fbo, scale };

  // Offscreen scene: shader renders here, not to screen
  const { offScene, offCamera, shaderUniforms } = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = THREE.UniformsUtils.clone(SHADER_LAB_DEFAULTS);
    const material = new THREE.ShaderMaterial({
      vertexShader: shaderLabVertexShader,
      fragmentShader: shaderLabFragmentShader,
      uniforms,
      depthWrite: false,
      glslVersion: THREE.GLSL3,
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { offScene: scene, offCamera: camera, shaderUniforms: uniforms };
  }, []);

  // Cleanup offscreen resources on unmount
  useEffect(() => () => {
    fbo.dispose();
    casUniforms.tInput.value = null;
    offScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }, [offScene]);

  // CAS upscale uniforms (display quad)
  const casUniforms = useMemo(() => ({
    tInput: { value: null as THREE.Texture | null },
    uTexelSize: { value: new THREE.Vector2() },
    uSharpen: { value: 0.0 },
  }), []);

  useFrame((state) => {
    onFrame();
    const u = shaderUniforms;
    const elapsed = state.clock.getElapsedTime();

    // When linkParams is active, GPU broadcasts d0 values to all domains.
    // Collapse controls so constraint engine sees the effective configuration.
    const effective = controls.linkParams
      ? {
          ...controls,
          d1type: controls.d0type, d1freq: controls.d0freq, d1thick: controls.d0thick, d1iso: controls.d0iso,
          d2type: controls.d0type, d2freq: controls.d0freq, d2thick: controls.d0thick, d2iso: controls.d0iso,
          d3type: controls.d0type, d3freq: controls.d0freq, d3thick: controls.d0thick, d3iso: controls.d0iso,
        }
      : controls;

    // Constraint enforcement: clamp between Leva and GPU (D-08)
    const constrained = enforceConstraints(effective as unknown as ShaderSettings);
    const c = constrained.clamped;

    // Log violations/warnings only when they change (not every frame)
    if (constrained.violations.length === 0 && constrained.warnings.length === 0) {
      if (lastViolationKey.current !== '') lastViolationKey.current = '';
    } else {
      const vKey = constrained.violations.map((v) => `${v.constraintId}:${v.param}`).join(',')
        + '|' + constrained.warnings.map((w) => w.constraintId).join(',');
      if (vKey !== lastViolationKey.current) {
        lastViolationKey.current = vKey;
        for (const v of constrained.violations) console.warn(`[Constraint ${v.constraintId}] ${v.message}`);
        for (const w of constrained.warnings) console.warn(`[Constraint ${w.constraintId}] ${w.message}`);
      }
    }

    const { w: curW, h: curH, target: curFbo, scale: curScale } = fboRef.current;

    u.uTime.value = elapsed;
    // Resolution = FBO dimensions (shader renders to FBO, gl_FragCoord matches)
    (u.uResolution.value as THREE.Vector2).set(curW, curH);

    // Camera orbit
    const angle = elapsed * controls.orbitSpeed;
    const dist = controls.cameraDistance;
    const tilt = 15 * Math.PI / 180;
    (u.uCamPos.value as THREE.Vector3).set(
      Math.sin(angle) * dist * Math.cos(tilt),
      Math.sin(tilt) * dist,
      Math.cos(angle) * dist * Math.cos(tilt),
    );
    (u.uCamTarget.value as THREE.Vector3).set(0, 0, 0);

    // Quality tier uniforms (adaptive)
    u.uMaxSteps.value = qualityConfig.maxSteps;
    u.uAoSamples.value = qualityConfig.aoSamples;
    u.uShadowSteps.value = qualityConfig.shadowSteps;
    u.uMaxDomains.value = qualityConfig.maxDomains;
    u.uDebugHeatmap.value = controls.debugHeatmap ? 1 : 0;

    // View uniforms
    u.uStepMult.value = controls.stepMult;
    u.uBrightness.value = controls.brightness;
    u.uClipRadius.value = controls.clipRadius;
    u.uBlendWidth.value = c.blendWidth * controls.clipRadius;
    u.uDebugDomains.value = controls.debugDomains ? 1 : 0;
    u.uTPMSMode.value = Math.max(0, Math.min(2, Math.round(controls.surfaceMode ?? 0)));

    // Material uniforms
    u.uMetallic.value = controls.metallic;
    u.uRoughness.value = controls.roughness;
    u.uSssIntensity.value = controls.sssIntensity;
    u.uSssDensity.value = c.sssDensity;
    u.uCurvAO.value = c.curvAO;
    u.uKColor.value = c.kColor;
    u.uRoughMod.value = c.roughMod;
    u.uRimStrength.value = c.rimStrength;
    u.uRimExponent.value = c.rimExponent;
    u.uRimShadow.value = c.rimShadow;
    u.uRimAOMask.value = c.rimAOMask;
    // uRimColor stays at default vec3(-1,-1,-1) = auto mode (user color override deferred)
    u.uAtmoFog.value = c.atmoFog;
    u.uThickOpacity.value = c.thickOpacity;
    u.uAbsorption.value = c.absorption;
    {
      const [ar, ag, ab] = hexToLinearCached(controls.absorptionColor);
      (u.uAbsorptionColor.value as THREE.Vector3).set(ar, ag, ab);
    }
    u.uAuraScale.value = c.auraScale;
    u.uSpatialColor.value = controls.spatialColor;
    u.uCurvatureColorStrength.value = controls.curvColorStr;
    u.uCurvatureMode.value = controls.curvMode;
    u.uEnvWeight.value = controls.envWeight;
    u.uTranslucency.value = controls.translucency;
    u.uMaxLayers.value = Math.round(Math.max(1, Math.min(5, controls.maxLayers)));

    // Shadow control
    u.uShadowStrength.value = controls.shadowStrength;
    u.uShadowPulse.value = controls.shadowPulse ? 1.0 : 0.0;

    // Animation uniforms
    u.uBreathAmp.value = c.breathAmp;
    u.uBreathSpeed.value = controls.breathSpeed;
    u.uIsoSweepAmp.value = c.isoSweepAmp;
    u.uIsoSweepSpeed.value = controls.isoSweepSpeed;
    u.uWarpStrength.value = controls.warpStrength;
    u.uWarpSpeed.value = controls.warpSpeed;
    u.uMorphTarget.value = TPMS_TYPE_MAP[controls.morphTarget] ?? 0;
    u.uMorphBlend.value = controls.morphBlend;

    // Per-domain phase offsets
    const phaseArr = u.uDomainPhase.value as number[];
    const TAU = Math.PI * 2;
    if (controls.phaseMode === 'stagger') {
      for (let i = 0; i < 4; i++) phaseArr[i] = i * TAU / 4;
    } else if (controls.phaseMode === 'antiphase') {
      for (let i = 0; i < 4; i++) phaseArr[i] = (i % 2) * Math.PI;
    } else {
      for (let i = 0; i < 4; i++) phaseArr[i] = 0;
    }

    // Per-domain parameters
    // Domain params use constrained values (C-01 thick, C-04 type limits, C-11 Diamond iso)
    const dTypes = [c.d0type, c.d1type, c.d2type, c.d3type];
    const dFreqs = [c.d0freq, c.d1freq, c.d2freq, c.d3freq];
    const dThicks = [c.d0thick, c.d1thick, c.d2thick, c.d3thick];
    const dIsos = [c.d0iso, c.d1iso, c.d2iso, c.d3iso];

    const typeArr = u.uDomainType.value as number[];
    const freqArr = u.uDomainFreq.value as number[];
    const thickArr = u.uDomainThick.value as number[];
    const isoArr = u.uDomainIso.value as number[];

    for (let i = 0; i < 4; i++) {
      const src = controls.linkParams ? 0 : i;
      typeArr[i] = TPMS_TYPE_MAP[dTypes[src]] ?? 0;
      freqArr[i] = dFreqs[src];
      thickArr[i] = dThicks[src];
      isoArr[i] = dIsos[src];
    }

    // Per-domain gradient colors — palette overrides individual pickers when not 'Custom'
    const palettes = [controls.d0palette, controls.d1palette, controls.d2palette, controls.d3palette];
    const manualColors = [
      [controls.d0c0, controls.d0c1, controls.d0c2, controls.d0c3, controls.d0c4],
      [controls.d1c0, controls.d1c1, controls.d1c2, controls.d1c3, controls.d1c4],
      [controls.d2c0, controls.d2c1, controls.d2c2, controls.d2c3, controls.d2c4],
      [controls.d3c0, controls.d3c1, controls.d3c2, controls.d3c3, controls.d3c4],
    ];
    const dColors = manualColors.map((manual, i) => {
      const pal = COLOR_PALETTES[palettes[i] as keyof typeof COLOR_PALETTES];
      return pal ? [...pal] : manual;
    });

    const gradArr = u.uDomainGradColor.value as THREE.Vector3[];
    for (let d = 0; d < 4; d++) {
      const src = controls.linkColors ? 0 : d;
      for (let s = 0; s < 5; s++) {
        const [r, g, b] = hexToLinearCached(dColors[src][s]);
        gradArr[d * 5 + s].set(r, g, b);
      }
    }

    // --- Render shader to FBO, then CAS upscale to screen ---
    gl.setRenderTarget(curFbo);
    gl.clear();
    gl.render(offScene, offCamera);
    gl.setRenderTarget(null);

    // Dev-only: expose scene state on window for in-browser debugging
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__SHADER_DEBUG__ = {
        uniforms: u,
        gl,
        controls,
        fboSize: { w: curW, h: curH },
        diagnostics: {
          frameMs: state.clock.getDelta() * 1000,
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          textureCount: gl.info.memory.textures,
          geometryCount: gl.info.memory.geometries,
          effectiveUniforms: Object.fromEntries(
            Object.entries(u).map(([k, v]) => [k, typeof v.value === 'number' ? v.value : 'non-numeric'])
          ),
        },
      };
    }

    // Update CAS quad uniforms
    casUniforms.tInput.value = curFbo.texture;
    casUniforms.uTexelSize.value.set(1 / curW, 1 / curH);
    casUniforms.uSharpen.value = curScale < 0.99 ? 0.5 : 0.0;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={casVertexShader}
        fragmentShader={casFragmentShader}
        uniforms={casUniforms}
        depthWrite={false}
        glslVersion={THREE.GLSL3}
      />
    </mesh>
  );
}

interface ShaderLabProps {
  onClose: () => void;
}

const presetBarStyle: React.CSSProperties = {
  position: 'absolute', top: 12, left: 80, zIndex: 10,
  display: 'flex', gap: 6, alignItems: 'center',
  fontFamily: 'monospace', fontSize: 13,
};

const presetSelectStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)', color: '#e0e0e0',
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
  padding: '3px 6px', fontFamily: 'monospace', fontSize: 13,
};

const presetBtnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)', color: '#e0e0e0',
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
  padding: '3px 8px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
};

const presetInputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)', color: '#e0e0e0',
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
  padding: '3px 6px', width: 120, fontFamily: 'monospace', fontSize: 12,
};

export function ShaderLab({ onClose }: ShaderLabProps) {
  const { fps, tick } = useFps();
  const qualityConfig = useAdaptiveQuality(fps);
  const sceneRef = useRef<SceneRef | null>(null);

  // Preset state
  const [customPresets, setCustomPresets] = useState<ShaderPreset[]>(() => loadCustomPresets());
  const allPresets = useMemo(() => [...BUILT_IN_PRESETS, ...customPresets], [customPresets]);
  const [selectedPresetId, setSelectedPresetId] = useState('base');
  const [newPresetName, setNewPresetName] = useState('');

  const handleLoadPreset = useCallback(() => {
    const preset = allPresets.find(p => p.id === selectedPresetId);
    if (preset) sceneRef.current?.applySettings(preset.settings);
  }, [selectedPresetId, allPresets]);

  const handleSavePreset = useCallback(() => {
    const name = newPresetName.trim().slice(0, 64);
    if (!name || !sceneRef.current) return;
    const settings = sceneRef.current.getControls();
    const preset: ShaderPreset = {
      id: `custom-${Date.now()}`,
      name,
      builtin: false,
      settings: settings as unknown as ShaderPreset['settings'],
    };
    const updated = [...customPresets, preset];
    saveCustomPresets(updated);
    setCustomPresets(updated);
    setSelectedPresetId(preset.id);
    setNewPresetName('');
  }, [newPresetName, customPresets]);

  const handleDeletePreset = useCallback(() => {
    const preset = allPresets.find(p => p.id === selectedPresetId);
    if (!preset || preset.builtin) return;
    const updated = customPresets.filter(p => p.id !== selectedPresetId);
    saveCustomPresets(updated);
    setCustomPresets(updated);
    setSelectedPresetId('base');
  }, [selectedPresetId, customPresets, allPresets]);

  const handleOverwritePreset = useCallback(() => {
    if (!sceneRef.current) return;
    const settings = sceneRef.current.getControls();
    const preset = allPresets.find(p => p.id === selectedPresetId);
    if (!preset) return;
    const updated: ShaderPreset = {
      ...preset,
      builtin: false,
      settings: settings as unknown as ShaderPreset['settings'],
    };
    // Save as custom preset with same name (replaces if custom, creates copy if builtin)
    const newCustom = [
      ...customPresets.filter(p => p.id !== updated.id),
      { ...updated, id: preset.builtin ? `custom-${preset.id}` : preset.id },
    ];
    saveCustomPresets(newCustom);
    setCustomPresets(newCustom);
    setSelectedPresetId(preset.builtin ? `custom-${preset.id}` : preset.id);
  }, [selectedPresetId, customPresets, allPresets]);

  const isBuiltin = allPresets.find(p => p.id === selectedPresetId)?.builtin ?? true;

  return (
    <div data-overlay-active style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#050810' }}>
      <Leva
        collapsed={false}
        titleBar={{ title: 'Shader Lab' }}
        theme={{ sizes: { controlWidth: '55%', rootWidth: '360px', scrubberWidth: '8px' } }}
      />

      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        color: fps >= 55 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#ef4444',
        fontFamily: 'monospace', fontSize: 14,
        background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4,
        pointerEvents: 'none',
      }}>
        {fps} FPS
      </div>

      {/* Preset bar */}
      <div style={presetBarStyle}>
        <select
          value={selectedPresetId}
          onChange={e => setSelectedPresetId(e.target.value)}
          style={presetSelectStyle}
        >
          <optgroup label="Built-in">
            {BUILT_IN_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
          {customPresets.length > 0 && (
            <optgroup label="Custom">
              {customPresets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <button onClick={handleLoadPreset} style={presetBtnStyle}>Load</button>
        <input
          value={newPresetName}
          onChange={e => setNewPresetName(e.target.value)}
          placeholder="Save as..."
          style={presetInputStyle}
          onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
        />
        <button onClick={handleSavePreset} style={presetBtnStyle}>Save</button>
        <button onClick={handleOverwritePreset} style={{ ...presetBtnStyle, color: '#60a5fa' }}>
          {isBuiltin ? 'Copy' : 'Update'}
        </button>
        {!isBuiltin && (
          <button onClick={handleDeletePreset} style={{ ...presetBtnStyle, color: '#f87171' }}>Del</button>
        )}
      </div>

      <button onClick={onClose} style={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        background: 'rgba(0,0,0,0.6)', color: '#e0e0e0',
        border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
        padding: '4px 12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 14,
      }}>
        Close
      </button>

      <ErrorBoundary fallback={
        <div style={{ color: 'red', padding: 20, fontFamily: 'monospace' }}>
          Shader compilation failed. Check console.
        </div>
      }>
        <Canvas
          frameloop="always"
          dpr={1}
          gl={{ alpha: false, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
          camera={{ position: [0, 0, 1] }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Suspense fallback={null}>
            <ShaderLabScene onFrame={tick} sceneRef={sceneRef} qualityConfig={qualityConfig} />
            <EffectComposer>
              <SMAA />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}

export default ShaderLab;
