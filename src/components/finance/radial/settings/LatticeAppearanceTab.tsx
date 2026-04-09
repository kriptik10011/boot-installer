/**
 * LatticeAppearanceTab — Lattice shader settings for production controls.
 *
 * Every control writes to fields the latticeAdapter actually reads.
 * Single-slider controls update all 4 domain configs simultaneously.
 * Per-domain editing is available via the prototype ShaderLab.
 */

import { useAppStore } from '@/stores/appStore';
import type { PhaseMode, CurvatureMode } from '@/stores/types';
import { FormField } from '../shapes/FormField';
import { ActionBar } from '../shapes/ActionBar';
import { ButtonGroup } from '../shapes/ButtonGroup';
import { COLUMN_HEADER_STYLE, FONT_FAMILY } from '../cardTemplate';
import { CqiColorPicker } from './settingsControls';

// ── Constants ───────────────────────────────────────────────────────────────

const PHASE_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'sync', label: 'Sync' },
  { value: 'stagger', label: 'Stagger' },
  { value: 'antiphase', label: 'Anti' },
];

const CURVATURE_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'Off' },
  { value: '1', label: 'Roughness' },
  { value: '2', label: 'Debug' },
];

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2cqi' }}>
      <div style={COLUMN_HEADER_STYLE}>{title}</div>
      {children}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function LatticeAppearanceTab() {
  const prefs = useAppStore((s) => s.latticePrefs);
  const setPrefs = useAppStore((s) => s.setLatticePrefs);
  const resetPrefs = useAppStore((s) => s.resetLatticePrefs);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2cqi' }}>
      {/* Lighting — writes to direct prefs (adapter reads these) */}
      <Section title="Lighting">
        <FormField type="slider" label="Intensity" value={prefs.lightIntensity ?? 1.2} min={0.2} max={3} step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => setPrefs({ lightIntensity: v, activePreset: null })} />
        <FormField type="slider" label="Metalness" value={prefs.metalnessBase ?? 0.15} min={0} max={1} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ metalnessBase: v, activePreset: null })} />
        <FormField type="slider" label="Roughness" value={prefs.roughness ?? 0.35} min={0.05} max={1} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ roughness: v, activePreset: null })} />
        <FormField type="slider" label="SSS Glow" value={prefs.sssIntensity ?? 0.7} min={0} max={1} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ sssIntensity: v, activePreset: null })} />
        <FormField type="slider" label="Curvature Color" value={prefs.curvatureColorStrength ?? 1.5} min={0} max={2} step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => setPrefs({ curvatureColorStrength: v })} />
        <ButtonGroup
          options={CURVATURE_MODE_OPTIONS}
          value={String(prefs.curvatureMode ?? 0)}
          onChange={(v) => setPrefs({ curvatureMode: Number(v) as CurvatureMode })}
          size="sm"
        />
      </Section>

      {/* Depth & Shadows — W3 capstone + rim controls */}
      <Section title="Depth & Shadows">
        <FormField type="slider" label="Shadow" value={prefs.shadowStrength ?? 1.0} min={0} max={1} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ shadowStrength: v })} />
        <FormField type="slider" label="Curv. AO" value={prefs.curvAO ?? 0.76} min={0} max={0.8} step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setPrefs({ curvAO: v })} />
        <FormField type="slider" label="K Color" value={prefs.kColor ?? 0.30} min={0} max={1.5} step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setPrefs({ kColor: v })} />
        {(prefs.roughness ?? 0.35) < 0.8 && (
          <FormField type="slider" label="Roughness Mod" value={prefs.roughMod ?? 1.0} min={0} max={1} step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setPrefs({ roughMod: v })} />
        )}
        <FormField type="slider" label="Rim Glow" value={prefs.rimStrength ?? 2.10} min={0} max={3} step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setPrefs({ rimStrength: v })} />
        {(prefs.rimStrength ?? 2.10) > 0 && (<>
          <FormField type="slider" label="Rim Exponent" value={prefs.rimExponent ?? 1.5} min={0.5} max={5} step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setPrefs({ rimExponent: v })} />
          <FormField type="slider" label="Rim Shadow" value={prefs.rimShadow ?? 1.0} min={0} max={1} step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setPrefs({ rimShadow: v })} />
          <FormField type="slider" label="Rim AO Mask" value={prefs.rimAOMask ?? 1.0} min={0} max={1} step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setPrefs({ rimAOMask: v })} />
        </>)}
        <FormField type="slider" label="Atmo Fog" value={prefs.atmoFog ?? 0.05} min={0} max={1} step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setPrefs({ atmoFog: v })} />
        <FormField type="slider" label="Spatial Color" value={prefs.spatialColor ?? 0.50} min={0} max={0.5} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ spatialColor: v })} />
        <FormField type="slider" label="IBL Weight" value={prefs.envWeight ?? 0.55} min={0} max={1} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ envWeight: v })} />
      </Section>

      {/* Glass & Volume — translucency + absorption + aura */}
      <Section title="Glass & Volume">
        <FormField type="slider" label="Translucency" value={prefs.translucency ?? 0} min={0} max={1} step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ translucency: v })} />
        <FormField type="slider" label="Max Layers" value={prefs.maxLayers ?? 3} min={1} max={4} step={1}
          format={(v) => String(v)}
          onChange={(v) => setPrefs({ maxLayers: v })} />
        {(prefs.translucency ?? 0) > 0 && (<>
          <FormField type="slider" label="Thick Opacity" value={prefs.thickOpacity ?? 0} min={0} max={1} step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setPrefs({ thickOpacity: v })} />
          <FormField type="slider" label="Absorption" value={prefs.absorption ?? 0} min={0} max={10} step={0.5}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setPrefs({ absorption: v })} />
          {(prefs.absorption ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5cqi' }}>
              <span style={{ fontSize: '1.6cqi', color: '#94a3b8', fontFamily: FONT_FAMILY }}>Absorb Color</span>
              <CqiColorPicker
                value={prefs.absorptionColor ?? '#ffcc88'}
                onChange={(v) => setPrefs({ absorptionColor: v })}
              />
            </div>
          )}
          <FormField type="slider" label="SSS Density" value={prefs.sssDensity ?? 0} min={0} max={10} step={0.5}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setPrefs({ sssDensity: v })} />
        </>)}
        <FormField type="slider" label="Aura Scale" value={prefs.auraScale ?? 0} min={0} max={1} step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setPrefs({ auraScale: v })} />
      </Section>

      {/* Animation — auto-hide speed controls when amplitude=0 */}
      <Section title="Animation">
        {(prefs.shadowStrength ?? 1.0) > 0 && (
          <ButtonGroup
            options={[{ value: 'off', label: 'Shadow Stable' }, { value: 'on', label: 'Shadow Pulse' }]}
            value={(prefs.shadowPulse ?? false) ? 'on' : 'off'}
            onChange={(v) => setPrefs({ shadowPulse: v === 'on' })}
            size="sm"
          />
        )}
        <FormField type="slider" label="Breath Amp" value={prefs.breathAmp ?? 0} min={0} max={0.15} step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(v) => setPrefs({ breathAmp: v })} />
        {(prefs.breathAmp ?? 0.07) > 0 && (
          <FormField type="slider" label="Breath Speed" value={prefs.breathSpeed ?? 1.4} min={0} max={5} step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setPrefs({ breathSpeed: v })} />
        )}
        <FormField type="slider" label="Iso Sweep" value={prefs.isoSweepAmp ?? 0} min={0} max={0.4} step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setPrefs({ isoSweepAmp: v })} />
        {(prefs.isoSweepAmp ?? 0.13) > 0 && (
          <FormField type="slider" label="Sweep Speed" value={prefs.isoSweepSpeed ?? 0.5} min={0} max={3} step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setPrefs({ isoSweepSpeed: v })} />
        )}
        <FormField type="slider" label="Domain Warp" value={prefs.warpStrength ?? 0.4} min={0} max={0.4} step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ warpStrength: v })} />
        {(prefs.warpStrength ?? 0.4) > 0 && (
          <FormField type="slider" label="Warp Speed" value={prefs.warpSpeed ?? 0.36} min={0} max={1} step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setPrefs({ warpSpeed: v })} />
        )}
        <ButtonGroup
          options={PHASE_MODE_OPTIONS}
          value={prefs.phaseMode ?? 'sync'}
          onChange={(v) => setPrefs({ phaseMode: v as PhaseMode })}
          size="sm"
        />
      </Section>

      {/* Camera — writes to direct prefs */}
      <Section title="Camera">
        <FormField type="slider" label="Orbit Speed" value={prefs.cameraOrbitSpeed ?? 0.15} min={0} max={0.5} step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setPrefs({ cameraOrbitSpeed: v })} />
        <FormField type="slider" label="Tilt" value={prefs.cameraTilt ?? 15} min={-30} max={30} step={1}
          format={(v) => `${v}\u00B0`}
          onChange={(v) => setPrefs({ cameraTilt: v })} />
        <FormField type="slider" label="Distance" value={prefs.cameraDistance ?? 2.6} min={2.0} max={5.0} step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => setPrefs({ cameraDistance: v })} />
      </Section>

      {/* Reset */}
      <ActionBar
        actions={[{ label: 'Reset to Defaults', onClick: resetPrefs, variant: 'slate' }]}
      />
    </div>
  );
}
