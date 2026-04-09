/**
 * BackendStatus Component
 *
 * Ambient banner that appears when the backend sidecar is unreachable.
 * Follows the No-Shame pattern: amber (not red), informational framing,
 * dismissible but re-appears if health checks keep failing.
 *
 * UX decisions applied:
 * - Calm Technology: ambient cue, does not block the UI
 * - No-Shame Pattern: amber tones, neutral language
 * - 100ms Rule: transitions feel instant
 */

import { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw, CheckCircle, X } from 'lucide-react';
import { useBackendHealth } from '@/hooks/useBackendHealth';
import { useHasEverConnected } from '@/hooks/useBackendReady';

type BannerState = 'hidden' | 'disconnected' | 'reconnected';

export function BackendStatus() {
  const { isConnected, checkNow } = useBackendHealth();
  const hasEverConnected = useHasEverConnected();
  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const wasDisconnectedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isConnected) {
      // Only show disconnected banner after we've previously connected
      // This suppresses the amber banner during normal startup
      if (hasEverConnected) {
        wasDisconnectedRef.current = true;
        setIsDismissed(false);
        setBannerState('disconnected');
      }

      // Clear any pending reconnect timer
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    } else if (isConnected && wasDisconnectedRef.current) {
      // Backend came back after being down
      wasDisconnectedRef.current = false;
      setBannerState('reconnected');

      // Flash "Reconnected" for 3 seconds, then hide
      reconnectTimerRef.current = setTimeout(() => {
        setBannerState('hidden');
        reconnectTimerRef.current = null;
      }, 3_000);
    }

    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [isConnected, hasEverConnected]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await checkNow();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  // Nothing to show
  if (bannerState === 'hidden') {
    return null;
  }

  // Dismissed by user, but will re-appear on next failure cycle
  if (isDismissed && bannerState === 'disconnected') {
    return null;
  }

  // Reconnected flash
  if (bannerState === 'reconnected') {
    return (
      <div
        className="w-full border-b transition-all duration-300 ease-out bg-emerald-500/10 border-emerald-500/30"
        role="status"
        aria-live="polite"
      >
        <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-400">
            Reconnected
          </span>
        </div>
      </div>
    );
  }

  // Disconnected banner
  return (
    <div
      className="w-full border-b transition-all duration-300 ease-out bg-amber-500/10 border-amber-500/30"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-sm text-amber-400">
            Backend is not responding
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium
                       text-amber-400 bg-amber-500/10 border border-amber-500/30
                       rounded-md hover:bg-amber-500/20 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
            Retry
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-amber-400/60 hover:text-amber-400 rounded
                       hover:bg-amber-500/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
