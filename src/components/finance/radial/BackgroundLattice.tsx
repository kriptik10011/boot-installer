/**
 * BackgroundLattice — Production TPMS Renderer.
 *
 * Store-wired via latticeAdapter (prefsToUniforms).
 * Reads all LatticePreferences and maps them to shader uniforms.
 * SMAA post-processing for edge smoothing (replaces in-shader fwidth AA to keep
 * derivative functions under uniform control flow).
 */

import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import {
  latticeVertexShader,
  latticeFragmentShader,
  LATTICE_DEFAULTS,
} from './utils/latticeShader';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAppStore } from '@/stores/appStore';
import { prefsToUniforms, computePhaseOffsets } from '@/components/debug/latticeAdapter';

// ── Create material class via drei shaderMaterial ────────────────────────

const LatticeMaterial = shaderMaterial(
  // @ts-expect-error — shaderMaterial typing mismatch with Record<string, {value: unknown}>
  LATTICE_DEFAULTS,
  latticeVertexShader,
  latticeFragmentShader,
);

extend({ LatticeMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    latticeMaterial: {
      ref?: React.Ref<THREE.ShaderMaterial>;
      transparent?: boolean;
      depthWrite?: boolean;
      attach?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    };
  }
}

// ── Lattice Scene (R3F inner component) ──────────────────────────────────

function LatticeScene() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport, size } = useThree();

  // Read store prefs (shallow subscribe — re-renders on change)
  const prefs = useAppStore((s) => s.latticePrefs);

  // Compute uniforms via adapter (memoized on prefs reference)
  const uniforms = useMemo(() => prefsToUniforms(prefs), [prefs]);
  const phaseOffsets = useMemo(
    () => computePhaseOffsets(prefs.phaseMode ?? 'sync'),
    [prefs.phaseMode],
  );

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;
    const u = mat.uniforms;
    const elapsed = state.clock.getElapsedTime();

    // System
    u.uTime.value = elapsed;
    const resW = Math.max(1, size.width * viewport.dpr);
    const resH = Math.max(1, size.height * viewport.dpr);
    (u.uResolution.value as THREE.Vector2).set(resW, resH);

    // Camera orbit
    const angle = elapsed * uniforms.orbitSpeed;
    const dist = uniforms.cameraDistance;
    const tilt = uniforms.cameraTiltRad;
    (u.uCamPos.value as THREE.Vector3).set(
      Math.sin(angle) * dist * Math.cos(tilt),
      Math.sin(tilt) * dist,
      Math.cos(angle) * dist * Math.cos(tilt),
    );
    (u.uCamTarget.value as THREE.Vector3).set(0, 0, 0);

    // Per-domain arrays
    u.uDomainType.value = uniforms.domainTypes;
    u.uDomainFreq.value = uniforms.domainFreqs;
    u.uDomainThick.value = uniforms.domainThicks;
    u.uDomainIso.value = uniforms.domainIsos;
    u.uDomainPhase.value = phaseOffsets;

    // Per-domain gradient colors (20 Vector3s)
    const colorArr = u.uDomainGradColor.value as THREE.Vector3[];
    for (let i = 0; i < 20 && i < uniforms.domainGradColors.length; i++) {
      const [r, g, b] = uniforms.domainGradColors[i];
      colorArr[i].set(r, g, b);
    }

    // Material
    u.uMetallic.value = uniforms.metallic;
    u.uRoughness.value = uniforms.roughness;
    u.uSssIntensity.value = uniforms.sssIntensity;
    u.uCurvatureMode.value = uniforms.curvatureMode;
    u.uCurvatureColorStrength.value = uniforms.curvatureColorStrength;

    // View
    u.uBrightness.value = uniforms.brightness;
    u.uClipRadius.value = uniforms.clipRadius;
    u.uStepMult.value = uniforms.stepMult;
    u.uBlendWidth.value = uniforms.blendWidth;
    u.uTPMSMode.value = uniforms.tpmsMode;

    // Translucency
    u.uTranslucency.value = uniforms.translucency;
    u.uMaxLayers.value = uniforms.maxLayers;

    // Animation
    u.uBreathAmp.value = uniforms.breathAmp;
    u.uBreathSpeed.value = uniforms.breathSpeed;
    u.uIsoSweepAmp.value = uniforms.isoSweepAmp;
    u.uIsoSweepSpeed.value = uniforms.isoSweepSpeed;
    u.uWarpStrength.value = uniforms.warpStrength;
    u.uWarpSpeed.value = uniforms.warpSpeed;
    u.uMorphTarget.value = uniforms.morphTarget;
    u.uMorphBlend.value = uniforms.morphBlend;

    // Capstone Layers 2-5
    u.uCurvAO.value = uniforms.curvAO;
    u.uKColor.value = uniforms.kColor;
    u.uRoughMod.value = uniforms.roughMod;
    u.uRimStrength.value = uniforms.rimStrength;

    // QW features
    u.uSssDensity.value = uniforms.sssDensity;
    u.uThickOpacity.value = uniforms.thickOpacity;
    u.uAbsorption.value = uniforms.absorption;
    const absColor = uniforms.absorptionColor;
    (u.uAbsorptionColor.value as THREE.Vector3).set(absColor[0], absColor[1], absColor[2]);
    u.uAuraScale.value = uniforms.auraScale;

    // Spatial color + atmospherics
    u.uSpatialColor.value = uniforms.spatialColor;
    u.uAtmoFog.value = uniforms.atmoFog;

    // W3 rim/env/shadow enhancements
    u.uEnvWeight.value = uniforms.envWeight;
    u.uShadowStrength.value = uniforms.shadowStrength;
    u.uShadowPulse.value = uniforms.shadowPulse;
    u.uRimExponent.value = uniforms.rimExponent;
    (u.uRimColor.value as THREE.Vector3).set(...uniforms.rimColor);
    u.uRimShadow.value = uniforms.rimShadow;
    u.uRimAOMask.value = uniforms.rimAOMask;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <latticeMaterial ref={materialRef} transparent depthWrite={false} glslVersion={THREE.GLSL3} />
    </mesh>
  );
}

// ── Main BackgroundLattice Component ─────────────────────────────────────

interface BackgroundLatticeProps {
  reducedMotion?: boolean;
  fixed?: boolean;
}

/** DPR — native resolution for clean TPMS walls at density=8. */
export const LATTICE_DPR = 1.0;

/** Target FPS constant (used by tests). */
export const TARGET_FPS = 30;

export function BackgroundLattice({
  reducedMotion = false,
  fixed = false,
}: BackgroundLatticeProps) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  if (reducedMotion) return null;

  return (
    <ErrorBoundary
      fallback={
        <div
          className={`${fixed ? 'fixed' : 'absolute'} inset-0`}
          style={{ zIndex: 0 }}
        />
      }
    >
      <div
        className={`${fixed ? 'fixed' : 'absolute'} inset-0`}
        style={{ zIndex: 0, pointerEvents: 'none' }}
      >
        <Canvas
          frameloop={visible ? 'always' : 'never'}
          dpr={LATTICE_DPR}
          style={{ background: 'transparent' }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
          }}
          camera={{ position: [0, 0, 1] }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); }}
        >
          <Suspense fallback={null}>
            <LatticeScene />
          </Suspense>
        </Canvas>
      </div>
    </ErrorBoundary>
  );
}
