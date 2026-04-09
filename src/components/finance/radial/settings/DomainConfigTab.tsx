/**
 * DomainConfigTab — Per-domain lattice customization with granular linking.
 *
 * Layout matches LatticeAppearanceTab (Page 3): vertical Section flow,
 * no wide inline elements, all content within circular safe zone.
 */

import { useState } from 'react';
import { useAppStore, BUILT_IN_PRESETS, type TpmsPreference } from '@/stores/appStore';
import type { LatticeDomainConfig } from '@/stores/types';
import { DEFAULT_DOMAIN_CONFIGS } from '@/stores/defaults';
import { FormField } from '../shapes/FormField';
import { ButtonGroup } from '../shapes/ButtonGroup';
import { ExpandablePill } from '../shapes/ExpandablePill';
import { CqiColorPicker } from './settingsControls';
import { COLUMN_HEADER_STYLE, FONT_FAMILY } from '../cardTemplate';
import { ActionBar } from '../shapes/ActionBar';

// ── Constants ─────────────────────────────────────────────────────────────

const TPMS_OPTIONS: { value: string; label: string }[] = [
  { value: 'gyroid', label: 'Gyroid' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'schwarzP', label: 'Schwarz-P' },
  { value: 'neovius', label: 'Neovius' },
  { value: 'iwp', label: 'iWP' },
];

const SURFACE_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'sheet', label: 'Sheet' },
  { value: 'solidA', label: 'Solid A' },
  { value: 'solidB', label: 'Solid B' },
];

const LINK_OPTIONS: { value: string; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'domain', label: 'Per Domain' },
];

const DOMAIN_LABELS = ['North', 'East', 'South', 'West'] as const;

const GRADIENT_PRESETS: Record<string, [string, string, string, string, string]> = {
  'coral-reef': ['#0a0a1a', '#0891b2', '#7c3aed', '#f59e0b', '#fef3c7'],
  'deep-ocean': ['#0a0a1a', '#0d47a1', '#1565c0', '#42a5f5', '#90caf9'],
  'ember': ['#1a0a0a', '#b71c1c', '#e65100', '#ff8f00', '#ffe082'],
  'arctic': ['#0a1a2e', '#b3e5fc', '#e0f7fa', '#ffffff', '#eceff1'],
  'chrome': ['#1a1a2e', '#4c4e5a', '#818393', '#c7c7d7', '#e0e0e0'],
  'aurora': ['#0a0a2e', '#0d9488', '#06b6d4', '#8b5cf6', '#d946ef'],
  'solar': ['#1a0a00', '#dc2626', '#f59e0b', '#facc15', '#fef9c3'],
  'midnight': ['#020617', '#1e1b4b', '#312e81', '#4338ca', '#818cf8'],
  'forest': ['#052e16', '#166534', '#22c55e', '#86efac', '#f0fdf4'],
};

const GRADIENT_PRESET_OPTIONS = Object.keys(GRADIENT_PRESETS).map((name) => ({
  label: name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
  value: name,
}));

// ── Section wrapper (identical to LatticeAppearanceTab) ──────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2cqi' }}>
      <div style={COLUMN_HEADER_STYLE}>{title}</div>
      {children}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export function DomainConfigTab() {
  const prefs = useAppStore((s) => s.latticePrefs);
  const setPrefs = useAppStore((s) => s.setLatticePrefs);

  const raw = prefs.domainConfigs;
  const configs = (Array.isArray(raw) && raw.length === 4) ? raw : DEFAULT_DOMAIN_CONFIGS;

  const linkT = prefs.linkType ?? false;
  const linkG = prefs.linkGeometry ?? false;
  const linkC = prefs.linkColors ?? false;

  const [openType, setOpenType] = useState<Set<number>>(new Set([0]));
  const [openGeo, setOpenGeo] = useState<Set<number>>(new Set([0]));
  const [openColor, setOpenColor] = useState<Set<number>>(new Set([0]));

  const toggleSet = (set: Set<number>, i: number): Set<number> => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  };

  const updateDomain = (i: number, updates: Partial<LatticeDomainConfig>) => {
    const next = configs.map((c, idx) => idx === i ? { ...c, ...updates } : c) as typeof DEFAULT_DOMAIN_CONFIGS;
    setPrefs({ domainConfigs: next, activePreset: null });
  };

  const updateAllDomains = (updates: Partial<LatticeDomainConfig>) => {
    const next = configs.map((c) => ({ ...c, ...updates })) as typeof DEFAULT_DOMAIN_CONFIGS;
    setPrefs({ domainConfigs: next, activePreset: null });
  };

  const updateDomainColors = (i: number, colors: [string, string, string, string, string]) => {
    const next = configs.map((c, idx) => idx === i ? { ...c, colors } : c) as typeof DEFAULT_DOMAIN_CONFIGS;
    setPrefs({ domainConfigs: next, activePreset: null });
  };

  const updateAllColors = (colors: [string, string, string, string, string]) => {
    const next = configs.map((c) => ({ ...c, colors })) as typeof DEFAULT_DOMAIN_CONFIGS;
    setPrefs({ domainConfigs: next, activePreset: null });
  };

  const d0 = configs[0];

  // Root div: identical pattern to LatticeAppearanceTab — plain flex column, no extra padding
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2cqi' }}>

      {/* Presets */}
      <Section title="Presets">
        <PresetSelector />
      </Section>

      {/* TPMS Type */}
      <Section title="TPMS Type">
        <ButtonGroup options={LINK_OPTIONS} value={linkT ? 'global' : 'domain'}
          onChange={(v) => setPrefs({ linkType: v === 'global' })} size="sm" />
        {linkT ? (
          <ButtonGroup options={TPMS_OPTIONS}
            value={d0.type === 'auto' ? 'gyroid' : d0.type}
            onChange={(v) => updateAllDomains({ type: v as TpmsPreference })} size="sm" />
        ) : (
          configs.map((cfg, i) => (
            <ExpandablePill key={i}
              label={`${DOMAIN_LABELS[i]}`}
              expanded={openType.has(i)}
              onToggle={() => setOpenType(toggleSet(openType, i))}
            >
              <ButtonGroup options={TPMS_OPTIONS}
                value={cfg.type === 'auto' ? 'gyroid' : cfg.type}
                onChange={(v) => updateDomain(i, { type: v as TpmsPreference })} size="sm" />
            </ExpandablePill>
          ))
        )}
      </Section>

      {/* Geometry */}
      <Section title="Geometry">
        <ButtonGroup options={LINK_OPTIONS} value={linkG ? 'global' : 'domain'}
          onChange={(v) => setPrefs({ linkGeometry: v === 'global' })} size="sm" />
        {linkG ? (
          <>
            <FormField type="slider" label="Frequency" value={d0.frequency ?? 20} min={3} max={20} step={0.5}
              format={(v) => v.toFixed(1)} onChange={(v) => updateAllDomains({ frequency: v })} />
            <FormField type="slider" label="Thickness" value={d0.thickness ?? 0.11} min={0.03} max={1.5} step={0.01}
              format={(v) => v.toFixed(2)} onChange={(v) => updateAllDomains({ thickness: v })} />
            <FormField type="slider" label="Iso Offset" value={d0.isoOffset ?? 0} min={-0.8} max={0.8} step={0.05}
              format={(v) => v.toFixed(2)} onChange={(v) => updateAllDomains({ isoOffset: v })} />
          </>
        ) : (
          configs.map((cfg, i) => (
            <ExpandablePill key={i}
              label={`${DOMAIN_LABELS[i]}`}
              expanded={openGeo.has(i)}
              onToggle={() => setOpenGeo(toggleSet(openGeo, i))}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8cqi' }}>
                <FormField type="slider" label="Frequency" value={cfg.frequency ?? 20} min={3} max={20} step={0.5}
                  format={(v) => v.toFixed(1)} onChange={(v) => updateDomain(i, { frequency: v })} />
                <FormField type="slider" label="Thickness" value={cfg.thickness ?? 0.11} min={0.03} max={1.5} step={0.01}
                  format={(v) => v.toFixed(2)} onChange={(v) => updateDomain(i, { thickness: v })} />
                <FormField type="slider" label="Iso Offset" value={cfg.isoOffset ?? 0} min={-0.8} max={0.8} step={0.05}
                  format={(v) => v.toFixed(2)} onChange={(v) => updateDomain(i, { isoOffset: v })} />
              </div>
            </ExpandablePill>
          ))
        )}
      </Section>

      {/* Colors */}
      <Section title="Colors">
        <ButtonGroup options={LINK_OPTIONS} value={linkC ? 'global' : 'domain'}
          onChange={(v) => setPrefs({ linkColors: v === 'global' })} size="sm" />
        {linkC ? (
          <ColorEditor colors={d0.colors}
            gradientPreset={prefs.gradientPreset ?? 'coral-reef'}
            onChange={(colors) => updateAllColors(colors)}
            onPresetChange={(name, colors) => {
              const next = configs.map((c) => ({ ...c, colors })) as typeof DEFAULT_DOMAIN_CONFIGS;
              setPrefs({ domainConfigs: next, activePreset: null, gradientPreset: name });
            }}
          />
        ) : (
          configs.map((cfg, i) => (
            <ExpandablePill key={i}
              label={DOMAIN_LABELS[i]}
              expanded={openColor.has(i)}
              onToggle={() => setOpenColor(toggleSet(openColor, i))}
            >
              <ColorEditor colors={cfg.colors}
                gradientPreset={null}
                onChange={(colors) => updateDomainColors(i, colors)}
                onPresetChange={(_name, colors) => updateDomainColors(i, colors)}
              />
            </ExpandablePill>
          ))
        )}
      </Section>

      {/* Morphing — auto-hide target when blend=0 */}
      <Section title="Morphing">
        <FormField type="slider" label="Morph Blend" value={prefs.morphBlend ?? 0} min={0} max={1} step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setPrefs({ morphBlend: v })} />
        {(prefs.morphBlend ?? 0) > 0 && (
          <ButtonGroup options={TPMS_OPTIONS}
            value={prefs.morphTarget ?? 'gyroid'}
            onChange={(v) => setPrefs({ morphTarget: v as TpmsPreference })}
            size="sm" />
        )}
      </Section>

      {/* Global */}
      <Section title="Global">
        <FormField type="slider" label="Size" value={prefs.latticeSize ?? 80} min={50} max={100} step={5}
          format={(v) => `${v}%`} onChange={(v) => setPrefs({ latticeSize: v })} />
        <FormField type="slider" label="Blend Width" value={prefs.blendWidth ?? 0.13} min={0.10} max={0.5} step={0.01}
          format={(v) => v.toFixed(2)} onChange={(v) => setPrefs({ blendWidth: v })} />
        <ButtonGroup options={SURFACE_MODE_OPTIONS}
          value={prefs.tpmsMode ?? 'sheet'}
          onChange={(v) => setPrefs({ tpmsMode: v as 'sheet' | 'solidA' | 'solidB' })} size="sm" />
      </Section>
    </div>
  );
}

// ── Preset Selector ──────────────────────────────────────────────────────

function PresetSelector() {
  const radialPresets = useAppStore((s) => s.radialPresets);
  const activePresetId = useAppStore((s) => s.activePresetId);
  const loadPreset = useAppStore((s) => s.loadRadialPreset);
  const savePreset = useAppStore((s) => s.saveRadialPreset);
  const deletePreset = useAppStore((s) => s.deleteRadialPreset);

  const [deleteMode, setDeleteMode] = useState(false);
  const [saveMode, setSaveMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [markedForDelete, setMarkedForDelete] = useState<Set<string>>(new Set());

  const allPresets = [...BUILT_IN_PRESETS, ...radialPresets];
  const presetOptions = allPresets.map((p) => ({ value: p.id, label: p.name }));

  const handlePresetClick = (id: string) => {
    if (deleteMode) {
      const preset = allPresets.find((p) => p.id === id);
      if (preset?.builtin) return;
      const next = new Set(markedForDelete);
      if (next.has(id)) next.delete(id); else next.add(id);
      setMarkedForDelete(next);
    } else {
      loadPreset(id);
    }
  };

  const confirmDelete = () => {
    markedForDelete.forEach((id) => deletePreset(id));
    setMarkedForDelete(new Set());
    setDeleteMode(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqi' }}>
      <ButtonGroup options={presetOptions}
        value={deleteMode ? '' : (activePresetId ?? '')}
        onChange={handlePresetClick} size="sm" />
      {!saveMode && !deleteMode && (
        <ActionBar actions={[
          { label: '+ Save', onClick: () => setSaveMode(true), variant: 'violet' },
          { label: 'Delete', onClick: () => setDeleteMode(true), variant: 'slate' },
        ]} />
      )}
      {saveMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8cqi' }}>
          <FormField type="text" label="Name" value={newName} onChange={setNewName}
            placeholder="Preset name..." maxLength={30}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                savePreset(newName.trim()); setNewName(''); setSaveMode(false);
              }
            }} />
          <ActionBar actions={[
            { label: 'Save', onClick: () => { if (newName.trim()) { savePreset(newName.trim()); setNewName(''); setSaveMode(false); } }, variant: 'violet', disabled: !newName.trim() },
            { label: 'Cancel', onClick: () => { setNewName(''); setSaveMode(false); }, variant: 'slate' },
          ]} />
        </div>
      )}
      {deleteMode && (
        <ActionBar actions={[
          { label: `Delete ${markedForDelete.size}`, onClick: confirmDelete, variant: 'amber', disabled: markedForDelete.size === 0 },
          { label: 'Cancel', onClick: () => { setMarkedForDelete(new Set()); setDeleteMode(false); }, variant: 'slate' },
        ]} />
      )}
    </div>
  );
}

// ── Color Editor — vertical layout matching Page 3 pattern ───────────────

function ColorEditor({ colors, gradientPreset, onChange, onPresetChange }: {
  colors: string[];
  gradientPreset: string | null;
  onChange: (colors: [string, string, string, string, string]) => void;
  onPresetChange: (name: string, colors: [string, string, string, string, string]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqi' }}>
      {/* Gradient preview bar */}
      <div style={{
        height: '2cqi', borderRadius: '9999px',
        background: `linear-gradient(to right, ${colors.join(', ')})`,
        border: '1px solid rgba(148, 163, 184, 0.2)',
      }} />
      {/* Preset picker */}
      <ButtonGroup
        options={GRADIENT_PRESET_OPTIONS}
        value={gradientPreset ?? ''}
        onChange={(name) => {
          const stops = GRADIENT_PRESETS[name];
          if (stops) onPresetChange(name, stops);
        }}
        size="sm"
      />
      {/* Color stops — vertical list (each stop is its own row) */}
      {colors.map((stop, i) => (
        <CqiColorPicker
          key={i}
          label={`Stop ${i + 1}`}
          value={stop}
          onChange={(v) => {
            const newColors = [...colors] as [string, string, string, string, string];
            newColors[i] = v;
            onChange(newColors);
          }}
        />
      ))}
    </div>
  );
}
