/**
 * SettingsPanel — 3 junction-card-style widgets for SW junction carousel.
 * Uses unified shape components: ButtonGroup, COLUMN_HEADER_STYLE.
 */

import { useAppStore } from '@/stores/appStore';
import { JunctionCardLayout } from '../shapes/JunctionCardLayout';
import { ScrollZone } from '../shapes/ScrollZone';
import { ButtonGroup } from '../shapes/ButtonGroup';
import { COLUMN_HEADER_STYLE } from '../cardTemplate';
import { DomainConfigTab } from './DomainConfigTab';
import { LatticeAppearanceTab } from './LatticeAppearanceTab';
import { LayoutTab } from './LayoutTab';
import { HintLayer } from '../hints/HintLayer';

// ---- Widget 1: General (Default View + Layout sliders) ----

export function SettingsGeneralWidget() {
  const defaultView = useAppStore((s) => s.defaultView);
  const setDefaultView = useAppStore((s) => s.setDefaultView);

  return (
    <JunctionCardLayout gap="2cqi">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqi' }}>
        <div style={COLUMN_HEADER_STYLE}>Default View</div>
        <ButtonGroup
          options={[
            { label: 'Radial Hub', value: 'radial' },
            { label: 'Weekly Grid', value: 'week' },
          ]}
          value={defaultView}
          onChange={(v) => {
            if (v !== 'radial') {
              requestAnimationFrame(() => setDefaultView(v as 'radial' | 'week'));
            } else {
              setDefaultView(v as 'radial' | 'week');
            }
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqi' }}>
        <div style={COLUMN_HEADER_STYLE}>Layout</div>
        <LayoutTab />
      </div>
    </JunctionCardLayout>
  );
}

// ---- Widget 2: Domains (Per-domain TPMS customization) ----

export function SettingsCustomizeWidget() {
  return (
    <JunctionCardLayout gap="2cqi">
      <ScrollZone paddingBottom="4cqi">
        <DomainConfigTab />
      </ScrollZone>
      <HintLayer context="settings" />
    </JunctionCardLayout>
  );
}

// ---- Widget 3: Shaders (Appearance controls) ----

export function SettingsLatticeWidget() {
  return (
    <JunctionCardLayout gap="2cqi">
      <ScrollZone paddingBottom="4cqi">
        <LatticeAppearanceTab />
      </ScrollZone>
    </JunctionCardLayout>
  );
}

// ---- Legacy export for backward compat ----

export function SettingsPanel() {
  return <SettingsGeneralWidget />;
}
