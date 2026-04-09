/**
 * VitalPicker — Modal for adding/restoring vitals to the dashboard.
 *
 * Shows all 9 vital types with icon, name, description.
 * Already-added vitals show a badge. Click to add via restoreVital().
 * Focus trap, Escape close, keyboard accessible.
 */

import { useCallback, useEffect, useRef } from 'react';
import { VITAL_REGISTRY, ALL_VITAL_TYPES } from './vitalRegistry';
import { trapFocus } from '@/utils/accessibility';
import type { VitalType } from '@/types/vitals';

interface VitalPickerProps {
  /** Currently active vitals (not removed) */
  activeVitals: Set<string>;
  /** Vitals that have been removed (can be restored) */
  removedVitals: Set<string>;
  /** Callback to restore/add a vital */
  onAddVital: (type: VitalType) => void;
  /** Close the picker */
  onClose: () => void;
}

export function VitalPicker({
  activeVitals,
  removedVitals,
  onAddVital,
  onClose,
}: VitalPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const cleanup = trapFocus(el);
    return cleanup;
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAdd = useCallback(
    (type: VitalType) => {
      onAddVital(type);
    },
    [onAddVital]
  );

  // Vitals available to add (removable only, not already active)
  const addableTypes = ALL_VITAL_TYPES.filter((t) => {
    const meta = VITAL_REGISTRY[t];
    return meta.removable;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="bg-slate-900 border border-slate-700/50 rounded-xl w-80 max-h-[70vh] overflow-y-auto shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vital-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <h2 id="vital-picker-title" className="text-sm font-semibold text-slate-200">
              Add Vital
            </h2>
            <button
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              onClick={onClose}
              aria-label="Close picker"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-2">
          {addableTypes.map((type) => {
            const meta = VITAL_REGISTRY[type];
            const isActive = activeVitals.has(type) && !removedVitals.has(type);
            const canAdd = !isActive;

            return (
              <button
                key={type}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                  transition-colors
                  ${canAdd
                    ? 'hover:bg-slate-800/80 cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                  }
                `}
                onClick={() => canAdd && handleAdd(type)}
                disabled={!canAdd}
                aria-label={`${canAdd ? 'Add' : 'Already added:'} ${meta.label}`}
              >
                <span className="text-lg flex-shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{meta.label}</span>
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-400">
                        Added
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{meta.description}</div>
                </div>
                {canAdd && (
                  <span className="text-slate-500 text-sm flex-shrink-0">+</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
