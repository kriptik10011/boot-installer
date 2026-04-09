/**
 * FillLevelSlider — Horizontal fill-level slider for all inventory items.
 *
 * Press-and-drag interaction: pointer down sets position, drag updates live,
 * release commits the value. Single click also works (down + immediate up).
 *
 * Gradient fill with inner shadow for depth. Color shifts by level:
 * - >50%: green (healthy)
 * - 25-50%: orange (moderate)
 * - <25%: deep orange (low — never red)
 */

import { useRef, useState, useCallback } from 'react';

export interface FillLevelSliderProps {
  value: number;
  max: number;
  step: number;
  onChange: (newValue: number) => void;
  label: string;
  disabled?: boolean;
  hasBackup?: boolean;
  onOpenBackup?: () => void;
  ariaLabel?: string;
}

function fillStyle(pct: number): { fill: React.CSSProperties; borderColor: string } {
  if (pct > 50) {
    return {
      fill: { background: 'linear-gradient(90deg, #059669, #10b981)' },
      borderColor: 'rgba(16, 185, 129, 0.3)',
    };
  }
  if (pct > 25) {
    return {
      fill: { background: 'linear-gradient(90deg, #ea580c, #fb923c)' },
      borderColor: 'rgba(251, 146, 60, 0.3)',
    };
  }
  return {
    fill: { background: 'linear-gradient(90deg, #c2410c, #ea580c)' },
    borderColor: 'rgba(234, 88, 12, 0.3)',
  };
}

export function FillLevelSlider({
  value,
  max,
  step,
  onChange,
  label,
  disabled = false,
  hasBackup = false,
  onOpenBackup,
  ariaLabel,
}: FillLevelSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [previewPct, setPreviewPct] = useState<number | null>(null);

  const isDragging = previewPct !== null;
  const displayPct = isDragging
    ? previewPct
    : max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const pctToQty = useCallback((pct: number): number => {
    const raw = (pct / 100) * max;
    const snapped = Math.round(raw / step) * step;
    return Math.max(0, Math.min(max, snapped));
  }, [max, step]);

  const clientXToPct = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    // Capture on the TRACK element, not e.target (which could be fill/thumb)
    const track = trackRef.current;
    if (track) {
      track.setPointerCapture(e.pointerId);
    }
    draggingRef.current = true;
    setPreviewPct(clientXToPct(e.clientX));
  }, [disabled, clientXToPct]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setPreviewPct(clientXToPct(e.clientX));
  }, [clientXToPct]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const track = trackRef.current;
    if (track) {
      track.releasePointerCapture(e.pointerId);
    }
    draggingRef.current = false;
    const finalPct = clientXToPct(e.clientX);
    const finalQty = pctToQty(finalPct);
    setPreviewPct(null);
    onChange(finalQty);
  }, [clientXToPct, pctToQty, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':    next = Math.min(max, value + step); break;
      case 'ArrowLeft':
      case 'ArrowDown':  next = Math.max(0, value - step); break;
      case 'Home':       next = 0; break;
      case 'End':        next = max; break;
      default: return;
    }
    e.preventDefault();
    onChange(next);
  }, [disabled, value, max, step, onChange]);

  const isZero = value === 0 && !isDragging;
  const showBackupPrompt = isZero && hasBackup;
  const { fill: fillGradient, borderColor: trackBorderColor } = fillStyle(displayPct);

  return (
    <div className="flex items-center gap-3 min-w-28 max-w-44 flex-1 px-1.5 py-1">
      {/* Backup prompt — left of track when depleted with backups available */}
      {showBackupPrompt && (
        <button
          onClick={onOpenBackup}
          disabled={disabled}
          className="text-[10px] text-cyan-400 hover:text-cyan-300 whitespace-nowrap disabled:opacity-30 flex-shrink-0"
        >
          Restock?
        </button>
      )}

      {/* Track always visible — user can drag from zero to refill */}
      <div
            ref={trackRef}
            role="slider"
            aria-valuenow={isDragging ? pctToQty(displayPct) : value}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={ariaLabel ?? 'Fill level'}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={handleKeyDown}
            className={`relative w-full h-5 rounded-full overflow-hidden select-none ${
              disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={{
              background: 'rgba(20, 24, 32, 0.8)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3), inset 0 -1px 1px rgba(255,255,255,0.04)',
              border: `1px solid ${trackBorderColor}`,
              touchAction: 'none',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { draggingRef.current = false; setPreviewPct(null); }}
          >
            {displayPct > 0 && (
              <div
                className="absolute top-0 left-0 bottom-0 rounded-full"
                style={{
                  width: `${displayPct}%`,
                  ...fillGradient,
                  boxShadow: displayPct > 5 ? '0 0 6px rgba(255,255,255,0.08), inset 0 1px 1px rgba(255,255,255,0.15)' : 'none',
                  transition: isDragging ? 'none' : 'width 200ms ease-out',
                }}
              />
            )}
            {displayPct > 3 && displayPct < 97 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `calc(${displayPct}% - 4px)`,
                  width: '3px',
                  height: '14px',
                  borderRadius: '2px',
                  background: 'rgba(255,255,255,0.7)',
                  boxShadow: '0 0 3px rgba(255,255,255,0.3)',
                }}
              />
            )}
          </div>
      {/* Label — show "Empty" when at zero without backup, otherwise quantity */}
      <span className="text-[11px] text-slate-400 select-none leading-tight whitespace-nowrap flex-shrink-0">
        {isZero && !hasBackup ? 'Empty' : label}
      </span>
    </div>
  );
}
