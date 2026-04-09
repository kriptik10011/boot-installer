/**
 * ToastContainer — Fixed bottom-right toast notification stack
 *
 * Renders toasts from toastStore with three variants:
 * - success (emerald) — auto-dismiss 4s
 * - error (amber) — auto-dismiss 4s
 * - undo (blue) — 5s countdown with circular timer + Undo button
 */

import { useEffect, useState } from 'react';
import { useToastStore, type Toast } from '@/stores/toastStore';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  // Slide in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Countdown progress for undo toasts
  useEffect(() => {
    if (toast.type !== 'undo') return;

    const interval = 50;
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / toast.durationMs) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [toast.id, toast.type, toast.durationMs]);

  const handleUndo = () => {
    if (toast.undoAction) {
      toast.undoAction();
    }
    removeToast(toast.id);
  };

  const handleDismiss = () => {
    removeToast(toast.id);
  };

  const baseClasses = `
    pointer-events-auto max-w-sm w-80 rounded-lg shadow-lg border px-4 py-3
    transition-all duration-300 ease-out
    ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
  `;

  if (toast.type === 'success') {
    return (
      <div role="status" className={`${baseClasses} bg-emerald-500/20 border-emerald-500/30 text-emerald-300`}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={handleDismiss} className="text-emerald-400/60 hover:text-emerald-300 p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (toast.type === 'error') {
    return (
      <div role="alert" className={`${baseClasses} bg-amber-500/20 border-amber-500/30 text-amber-300`}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={handleDismiss} className="text-amber-400/60 hover:text-amber-300 p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Undo toast
  return (
    <div role="status" className={`${baseClasses} bg-cyan-500/20 border-cyan-500/30 text-cyan-300`}>
      <div className="flex items-center gap-3">
        {/* Circular countdown */}
        <div className="relative w-6 h-6 flex-shrink-0">
          <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
            <circle
              cx="12" cy="12" r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.2"
            />
            <circle
              cx="12" cy="12" r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 10}`}
              strokeDashoffset={`${2 * Math.PI * 10 * (1 - progress / 100)}`}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-100"
            />
          </svg>
        </div>
        <span className="text-sm font-medium flex-1">{toast.message}</span>
        <button
          onClick={handleUndo}
          className="px-3 py-1 text-sm font-semibold bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-200 rounded transition-colors"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
