/**
 * useDndMode Hook
 *
 * Detects and manages Do Not Disturb (DND) mode.
 * When DND is active, the intelligence layer suppresses non-critical insights.
 *
 * Detection sources (in priority order):
 * 1. OS-level Focus mode (via Tauri notification permission)
 * 2. Manual toggle stored in localStorage
 *
 * @see INTELLIGENCE-PRINCIPLES.md - Context Gates
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface DndState {
  /** Whether DND mode is currently active */
  isDnd: boolean;
  /** Source of the DND state */
  source: 'os' | 'manual' | 'default';
  /** Toggle DND mode manually */
  toggleDnd: () => void;
  /** Set DND mode explicitly */
  setDnd: (enabled: boolean) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DND_STORAGE_KEY = 'weekly-review-dnd-mode';

// =============================================================================
// HOOK
// =============================================================================

export function useDndMode(): DndState {
  const [isDnd, setIsDnd] = useState(false);
  const [source, setSource] = useState<'os' | 'manual' | 'default'>('default');

  // Check OS-level DND and manual toggle on mount
  useEffect(() => {
    const checkDnd = async () => {
      try {
        // Try to detect OS-level focus/DND mode via Tauri notification permission
        // If notifications are not granted, user might be in focus mode
        const { isPermissionGranted, requestPermission } = await import(
          '@tauri-apps/plugin-notification'
        );

        const granted = await isPermissionGranted();

        if (!granted) {
          // Permission not granted - could be focus mode or never asked
          // Check if we've asked before
          const hasAsked = localStorage.getItem('weekly-review-notification-asked');

          if (hasAsked) {
            // User explicitly denied - treat as potential focus mode
            // But don't override manual toggle
            const manualDnd = localStorage.getItem(DND_STORAGE_KEY);
            if (manualDnd === null) {
              // No manual setting, use OS detection
              setIsDnd(true);
              setSource('os');
              return;
            }
          }
        }
      } catch {
        // Tauri plugin not available (dev mode or web)
        // Fall through to manual toggle check
      }

      // Fallback: Check manual toggle
      const manualDnd = localStorage.getItem(DND_STORAGE_KEY);
      if (manualDnd !== null) {
        setIsDnd(manualDnd === 'true');
        setSource('manual');
      } else {
        // Default: DND off
        setIsDnd(false);
        setSource('default');
      }
    };

    checkDnd();
  }, []);

  // Toggle DND mode manually
  const toggleDnd = useCallback(() => {
    setIsDnd((prev) => {
      const newValue = !prev;
      localStorage.setItem(DND_STORAGE_KEY, String(newValue));
      return newValue;
    });
    setSource('manual');
  }, []);

  // Set DND mode explicitly
  const setDndExplicit = useCallback((enabled: boolean) => {
    setIsDnd(enabled);
    localStorage.setItem(DND_STORAGE_KEY, String(enabled));
    setSource('manual');
  }, []);

  return {
    isDnd,
    source,
    toggleDnd,
    setDnd: setDndExplicit,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if an insight should be suppressed due to DND mode.
 * Only urgent/critical insights (priority 1) bypass DND.
 */
export function shouldSuppressForDnd(isDnd: boolean, insightPriority: number): boolean {
  if (!isDnd) return false;
  // Priority 1 = critical, bypasses DND
  return insightPriority > 1;
}
