import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { trapFocus, handleModalKeyDown } from '@/utils/accessibility';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  icon?: ReactNode;
  details?: ReactNode;
  requiresTypedConfirmation?: string;
  warningNote?: string;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
  icon,
  details,
  requiresTypedConfirmation,
  warningNote,
}: ConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isConfirmEnabled = requiresTypedConfirmation
    ? confirmText === requiresTypedConfirmation
    : true;

  const handleConfirm = () => {
    if (isConfirmEnabled) {
      onConfirm();
      setConfirmText('');
    }
  };

  const handleCancel = useCallback(() => {
    setConfirmText('');
    onCancel();
  }, [onCancel]);

  // Focus trap + restore focus on close
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const firstFocusable = dialog.querySelector<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const cleanup = trapFocus(dialog);
    return () => {
      cleanup();
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => handleModalKeyDown(e, handleCancel),
    [handleCancel]
  );

  if (!isOpen) return null;

  const confirmButtonClass = {
    danger: 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400',
    warning: 'bg-amber-500 hover:bg-amber-400 text-white',
    primary: 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400',
  }[confirmVariant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={onKeyDown}>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="relative w-full max-w-md mx-4 bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-xl"
      >
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10">
          {icon ?? <AlertTriangle className="w-6 h-6 text-amber-400" />}
        </div>

        <h3 id="confirm-modal-title" className="font-['Space_Grotesk'] text-lg font-semibold text-slate-100 text-center mb-2">
          {title}
        </h3>

        <p className="text-sm text-slate-400 text-center mb-4">
          {message}
        </p>

        {details && <div className="mb-4">{details}</div>}

        {requiresTypedConfirmation && (
          <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
            <label className="block text-sm text-slate-400 mb-2">
              Type <span className="font-mono text-amber-400 font-semibold">{requiresTypedConfirmation}</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type ${requiresTypedConfirmation}`}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600
                         text-slate-100 placeholder-slate-500
                         focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500
                         font-mono"
              autoFocus
              disabled={isLoading}
            />
          </div>
        )}

        {warningNote && (
          <p className="text-xs text-amber-400/70 text-center mb-4">
            {warningNote}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg
                       bg-slate-700 hover:bg-slate-600
                       text-slate-300 font-medium text-sm transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !isConfirmEnabled}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-amber-500
                       ${confirmButtonClass}`}
          >
            {isLoading ? `${confirmLabel}...` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
