/**
 * LiveAnnotation — Floating parameter change labels.
 *
 * Watches latticePrefs for changes and shows brief, auto-dismissing
 * floating labels in the top-right corner of the lattice canvas.
 * Each label shows "Parameter: oldValue → newValue" and fades out after 2s.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';

/* ── Human-readable label map (subset of most-adjusted params) ─────── */
const PARAM_LABELS: Record<string, string> = {
  density: 'Density',
  sharpness: 'Sharpness',
  latticeSize: 'Size',
  lightIntensity: 'Light',
  metalnessBase: 'Metalness',
  roughness: 'Roughness',
  sssIntensity: 'SSS Glow',
  renderMode: 'Render Mode',
  cameraOrbitSpeed: 'Orbit Speed',
  cameraDistance: 'Cam Distance',
  cameraTilt: 'Cam Tilt',
};

/* ── Skipped fields (complex/non-numeric or internal) ────────────── */
const SKIP_KEYS = new Set([
  'gradientStops', 'gradientPreset', 'regionPrimaryTPMS',
  'arcColors', 'arcLabels', 'junctionColors', 'junctionLabels',
  'junctionActions', 'arcWidgets', 'activePreset',
]);

interface Annotation {
  id: number;
  label: string;
  from: string;
  to: string;
  createdAt: number;
}

let nextId = 0;

function formatValue(v: unknown): string {
  if (typeof v === 'number') {
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'string') return v;
  return String(v);
}

export function LiveAnnotation() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const prevPrefsRef = useRef<Record<string, unknown> | null>(null);
  const timerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    const timer = timerRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerRef.current.delete(id);
    }
  }, []);

  // Subscribe to full store, diff latticePrefs ourselves
  useEffect(() => {
    // Seed previous snapshot
    prevPrefsRef.current = {
      ...(useAppStore.getState().latticePrefs as unknown as Record<string, unknown>),
    };

    const unsub = useAppStore.subscribe((state) => {
      const flat = state.latticePrefs as unknown as Record<string, unknown>;
      const prev = prevPrefsRef.current;
      if (!prev) {
        prevPrefsRef.current = { ...flat };
        return;
      }

      const newAnnotations: Annotation[] = [];
      for (const key of Object.keys(flat)) {
        if (SKIP_KEYS.has(key)) continue;
        const oldVal = prev[key];
        const newVal = flat[key];
        if (oldVal === newVal) continue;
        if (typeof oldVal === 'object' || typeof newVal === 'object') continue;

        const label = PARAM_LABELS[key] ?? key;
        const id = ++nextId;
        newAnnotations.push({
          id,
          label,
          from: formatValue(oldVal),
          to: formatValue(newVal),
          createdAt: Date.now(),
        });
      }

      if (newAnnotations.length > 0) {
        setAnnotations((existing) => [...existing, ...newAnnotations].slice(-5));

        // Auto-dismiss each after 2s
        for (const ann of newAnnotations) {
          const timer = setTimeout(() => dismiss(ann.id), 2000);
          timerRef.current.set(ann.id, timer);
        }
      }

      prevPrefsRef.current = { ...flat };
    });

    return () => {
      unsub();
      for (const timer of timerRef.current.values()) {
        clearTimeout(timer);
      }
      timerRef.current.clear();
    };
  }, [dismiss]);

  if (annotations.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-[70] flex flex-col gap-1 pointer-events-none">
      {annotations.map((ann) => {
        const age = Date.now() - ann.createdAt;
        const opacity = age > 1500 ? Math.max(0, 1 - (age - 1500) / 500) : 1;
        return (
          <div
            key={ann.id}
            className="px-2 py-1 rounded bg-slate-900/80 border border-cyan-400/30 backdrop-blur-sm animate-in slide-in-from-right-2 fade-in duration-200"
            style={{ opacity }}
          >
            <span className="text-[9px] text-slate-400">{ann.label}: </span>
            <span className="text-[9px] text-slate-500 line-through">{ann.from}</span>
            <span className="text-[9px] text-cyan-400 mx-0.5">&rarr;</span>
            <span className="text-[9px] text-cyan-300 font-mono">{ann.to}</span>
          </div>
        );
      })}
    </div>
  );
}
