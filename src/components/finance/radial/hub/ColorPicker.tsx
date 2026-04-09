import { useCallback, useRef } from 'react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSwatchClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onChange(v);
    }
  }, [onChange]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 min-w-[60px]">{label}</span>
      <button
        onClick={handleSwatchClick}
        className="w-5 h-5 rounded border border-slate-600 flex-shrink-0 cursor-pointer"
        style={{ backgroundColor: value }}
        title="Click to change color"
      />
      <input
        type="text"
        value={value}
        onChange={handleTextChange}
        className="w-[70px] bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[9px] text-slate-300 font-mono"
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </div>
  );
}
