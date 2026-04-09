/**
 * CqiColorPicker — the sole remaining settings control.
 * No shape equivalent exists for a color picker with swatch + hex input.
 * Styled with template constants for system consistency.
 */

import { useCallback, useRef } from 'react';
import { FONT_FAMILY, CARD_SIZES } from '../cardTemplate';
import { VARIANT } from '../shapes/ActionBar';

export function CqiColorPicker({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
    },
    [onChange],
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2cqi' }}>
      {label && (
        <span style={{ fontSize: `${CARD_SIZES.sectionContent}cqi`, color: '#94a3b8', flexShrink: 0, fontFamily: FONT_FAMILY }}>
          {label}
        </span>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          width: '4cqi',
          height: '4cqi',
          borderRadius: '50%',
          border: `1px solid ${VARIANT.slate.border}`,
          backgroundColor: value,
          cursor: 'pointer',
          flexShrink: 0,
        }}
        title="Click to change color"
      />
      <input
        type="text"
        value={value}
        onChange={handleTextChange}
        style={{
          width: '12cqi',
          fontSize: `${CARD_SIZES.sectionContent * 0.9}cqi`,
          fontFamily: 'monospace',
          padding: '0.6cqi 1cqi',
          borderRadius: '9999px',
          color: '#cbd5e1',
          background: 'transparent',
          border: `1px solid ${VARIANT.slate.border}`,
          outline: 'none',
        }}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
      />
    </div>
  );
}
