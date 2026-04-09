/**
 * LayoutTab — Card BG opacity slider.
 * Uses FormField shape component for unified slider styling.
 */

import { useAppStore } from '@/stores/appStore';
import { FormField } from '../shapes/FormField';

export function LayoutTab() {
  const prefs = useAppStore((s) => s.latticePrefs);
  const setPrefs = useAppStore((s) => s.setLatticePrefs);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5cqi' }}>
      <FormField
        type="slider"
        label="Card BG"
        value={prefs.cardBgOpacity}
        min={0.1}
        max={0.95}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setPrefs({ cardBgOpacity: v })}
      />
    </div>
  );
}
