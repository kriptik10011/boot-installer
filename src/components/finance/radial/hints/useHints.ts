/**
 * useHints — Hook that resolves which hints to show for a given UI context.
 *
 * Reads dismissed state from store. Evaluates triggers against gestureState.
 * Returns max 2 active hints, priority-sorted. Session-dismissed hints
 * (auto-faded) tracked in module-level Set — they reappear next session.
 */

import { useMemo, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { HINT_CATALOG, type HintContext, type HintDefinition, type HintTrigger } from './hintCatalog';
import type { GestureState } from '@/stores/types';

// Session-only dismiss tracking (not persisted — hints reappear next launch)
const sessionDismissed = new Set<string>();

function evaluateTrigger(trigger: HintTrigger, gs: GestureState): boolean {
  switch (trigger) {
    case 'first-radial-visit':
      return gs.radialVisitCount <= 3;
    case 'first-arc-open':
      return !gs.hasUsedArcScroll;
    case 'early-visits':
      return gs.radialVisitCount <= 5;
    case 'settings-lattice':
    case 'settings-domain':
    case 'always':
      return true;
    default:
      return false;
  }
}

export function useHints(context: HintContext) {
  const gestureState = useAppStore((s) => s.gestureState);
  const storeDismiss = useAppStore((s) => s.dismissHint);
  const dismissed = gestureState.dismissedHints ?? [];

  const activeHints = useMemo(() =>
    HINT_CATALOG
      .filter((h) => h.context === context)
      .filter((h) => !dismissed.includes(h.id))
      .filter((h) => !sessionDismissed.has(h.id))
      .filter((h) => evaluateTrigger(h.trigger, gestureState))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 2),
    [context, dismissed, gestureState],
  );

  // Click = permanent dismiss (persisted). Auto-fade = session dismiss (transient).
  const dismissHint = useCallback((id: string, permanent = true) => {
    if (permanent) {
      storeDismiss(id);
    } else {
      sessionDismissed.add(id);
    }
  }, [storeDismiss]);

  return { activeHints, dismissHint };
}
