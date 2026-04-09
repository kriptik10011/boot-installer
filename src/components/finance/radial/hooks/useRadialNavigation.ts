/**
 * Radial navigation state — V9: circular-only three-zone model.
 *
 * Three concentric zones solve the card↔ring transit problem:
 *
 *   1. CARD ZONE (dist < 0.75): When a card is active, completely frozen.
 *      No hover changes, no switch timers, nothing. The card IS the interaction.
 *
 *   2. TRANSIT ZONE (0.75 < dist < 0.84): When a card is active, this is dead
 *      space. Extends past the visual card edge (0.82) so the mouse must leave
 *      the card entirely before arc detection can begin.
 *
 *   3. RING ZONE (dist >= 0.84): Active detection zone. Junctions and arcs are
 *      detected here. When a card IS active, switching to a new target requires
 *      a dwell timer (200ms). When NO card is active, activation is near-instant.
 *
 * Clicks always bypass all zones/timers for instant activation.
 *
 * Geometry: Visual card is inset 9% → 82% diameter → radius 0.82 in normalized
 * [-1, 1] space. Arc ring SVG centerline is at 0.912, inner hit edge at 0.853.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArcPosition } from '../utils/arcGeometry';
import { type JunctionId, JUNCTION_CONFIGS, junctionPosition, CENTER, getSubArcConfigs } from '../utils/arcGeometry';

// Pre-computed junction positions in normalized [-1, 1] space.
// Uses JUNCTION_CONFIGS (main 4 junctions at diagonal boundaries). Sub-arc junctions
// (from getSubArcJunctionConfigs) sit at the SAME boundary angles, so they're covered.
// IMPORTANT: If a future sub-arc junction uses a NON-boundary angle, add its position here.
const JUNCTION_POSITIONS = JUNCTION_CONFIGS.map((c) => {
  const pos = junctionPosition(c);
  return { id: c.id, nx: pos.x / CENTER - 1, ny: pos.y / CENTER - 1 };
});

// If mouse is within this normalized distance of a junction, suppress arc hover.
// This prevents arc activation from stealing focus when the user approaches a junction.
const JUNCTION_SUPPRESS_RADIUS = 0.22;  // smaller = less arc suppression near junctions

/** Check if normalized position is near any junction node.
 *  Used in updateHoverFromPosition to suppress arc hover near junctions.
 *  Works for both main junctions and sub-arc junctions (same boundary positions). */
function isNearJunction(nx: number, ny: number): boolean {
  for (const jp of JUNCTION_POSITIONS) {
    const dx = nx - jp.nx;
    const dy = ny - jp.ny;
    if (dx * dx + dy * ny < JUNCTION_SUPPRESS_RADIUS * JUNCTION_SUPPRESS_RADIUS) {
      return true;
    }
  }
  return false;
}

export interface RadialNavState {
  hoveredArc: ArcPosition | null;
  activeArc: ArcPosition | null;
  activeCardIndex: number;
  showComprehensive: boolean;
  hoveredJunction: JunctionId | null;
  activeJunction: JunctionId | null;
  junctionCardIndex: number;
  /** Which main arc we drilled into for sub-arc view (null = main view) */
  subArcMode: ArcPosition | null;
}

const COLLAPSE_DELAY = 300;  // ms before card closes after mouse leaves
const SWITCH_DELAY = 200;    // ms to dwell before switching active target
const INITIAL_DELAY = 1;     // ms for first activation — near-instant (no card to protect)

// ── Three-zone circular geometry ──
// Visual card: inset 9% → 82% diameter → radius 0.82 in normalized space.
// Arc ring SVG: centerline at 0.912, 40px stroke → inner hit edge 0.853.
const CARD_R = 0.75;      // card zone — freeze inner 91% of visible card
const TRANSIT_R = 0.84;   // transit zone — dead space extends past visual card edge (0.82)
const ARC_DETECT_MIN = 0.84;  // arc detection starts at transit boundary (gap-free)
const ARC_DETECT_MAX = 1.05;  // outer bound — covers SVG outer hit edge (0.971)

/** Check if point is inside the card zone (frozen when card active) */
function isInCardZone(dist: number): boolean {
  return dist < CARD_R;
}

/** Check if point is inside the transit zone (dead space when card active) */
function isInTransitZone(dist: number): boolean {
  return dist < TRANSIT_R;
}

type HoverTarget =
  | { type: 'arc'; id: ArcPosition }
  | { type: 'junction'; id: JunctionId }
  | null;

function targetsEqual(a: HoverTarget, b: HoverTarget): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.type === b.type && a.id === b.id;
}

function positionToArc(nx: number, ny: number): ArcPosition | null {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  if (ay >= ax) return ny < 0 ? 'north' : 'south';
  return nx > 0 ? 'east' : 'west';
}

const EMPTY_STATE: RadialNavState = {
  hoveredArc: null,
  activeArc: null,
  activeCardIndex: 0,
  showComprehensive: false,
  hoveredJunction: null,
  activeJunction: null,
  junctionCardIndex: 0,
  subArcMode: null,
};

export function useRadialNavigation() {
  const [state, setState] = useState<RadialNavState>({ ...EMPTY_STATE });

  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTargetRef = useRef<HoverTarget>(null);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const clearSwitchTimer = useCallback(() => {
    if (switchTimerRef.current !== null) {
      clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
    pendingTargetRef.current = null;
  }, []);

  // Clean up timers on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      clearCollapseTimer();
      clearSwitchTimer();
    };
  }, [clearCollapseTimer, clearSwitchTimer]);

  const commitTarget = useCallback((target: HoverTarget) => {
    clearSwitchTimer();
    if (target === null) {
      setState((prev) => {
        if (prev.activeArc === null && prev.activeJunction === null) return prev;
        return { ...EMPTY_STATE, subArcMode: prev.subArcMode };
      });
    } else if (target.type === 'arc') {
      setState((prev) => ({
        ...EMPTY_STATE,
        subArcMode: prev.subArcMode,
        hoveredArc: target.id,
        activeArc: target.id,
      }));
    }
    // Junction targets are never committed via hover — only via activateJunction click
  }, [clearSwitchTimer]);

  const getCurrentTarget = useCallback((s: RadialNavState): HoverTarget => {
    if (s.activeJunction !== null) return { type: 'junction', id: s.activeJunction };
    if (s.activeArc !== null) return { type: 'arc', id: s.activeArc };
    return null;
  }, []);

  const updateHoverFromPosition = useCallback((nx: number, ny: number) => {
    // Guard against NaN from zero-width container during layout race
    if (!isFinite(nx) || !isFinite(ny)) return;

    // NOTE: Do NOT clearCollapseTimer here. Only the shield's onMouseEnter
    // (handleCardEnter) should cancel collapse. Otherwise every mousemove
    // within the container defeats the collapse timer, making cards sticky.

    const dist = Math.sqrt(nx * nx + ny * ny);

    setState((prev) => {
      if (prev.showComprehensive) return prev;

      const currentTarget = getCurrentTarget(prev);
      const hasActiveCard = currentTarget !== null;

      // ════════════════════════════════════════════════
      // ZONE 1: CARD ZONE — frozen when card is active
      // ════════════════════════════════════════════════
      if (hasActiveCard && isInCardZone(dist)) {
        clearSwitchTimer();
        return prev;
      }

      // ════════════════════════════════════════════════
      // ZONE 2: TRANSIT ZONE — dead space when card is active
      // ════════════════════════════════════════════════
      if (hasActiveCard && isInTransitZone(dist)) {
        if (pendingTargetRef.current !== null) {
          clearSwitchTimer();
        }
        if (prev.hoveredArc !== prev.activeArc) {
          return { ...prev, hoveredArc: prev.activeArc };
        }
        return prev;
      }

      // ════════════════════════════════════════════════
      // ZONE 3: RING ZONE — arc-only hover detection
      // Junctions are click-only (no hover activation).
      // Arcs detected in the ring band [0.84–1.05].
      // CRITICAL: Suppress arc hover near junctions so their CardCarousel
      // shield doesn't block junction clicks.
      // ════════════════════════════════════════════════
      const inArcBand = dist >= ARC_DETECT_MIN && dist <= ARC_DETECT_MAX;
      const nearJunction = isNearJunction(nx, ny);

      let candidate: HoverTarget = null;

      if (inArcBand && !nearJunction) {
        const arc = positionToArc(nx, ny);
        if (arc !== null) {
          candidate = { type: 'arc', id: arc };
        }
      }

      // ── Same as current target → stay put ──
      if (targetsEqual(candidate, currentTarget)) {
        if (pendingTargetRef.current !== null) {
          clearSwitchTimer();
        }
        return prev;
      }

      // ── No current card → near-instant first activation ──
      if (!hasActiveCard) {
        if (candidate === null) return prev;

        if (!targetsEqual(candidate, pendingTargetRef.current)) {
          clearSwitchTimer();
          pendingTargetRef.current = candidate;
          switchTimerRef.current = setTimeout(() => {
            commitTarget(candidate);
          }, INITIAL_DELAY);
        }
        if (prev.hoveredArc !== candidate.id) {
          return { ...prev, hoveredArc: candidate.id };
        }
        return prev;
      }

      // ── Has active card, different target in ring zone → dwell to switch ──
      if (!targetsEqual(candidate, pendingTargetRef.current)) {
        clearSwitchTimer();
        pendingTargetRef.current = candidate;

        if (candidate !== null) {
          switchTimerRef.current = setTimeout(() => {
            commitTarget(candidate);
          }, SWITCH_DELAY);
        }
      }

      if (candidate?.type === 'arc' && prev.hoveredArc !== candidate.id) {
        return { ...prev, hoveredArc: candidate.id };
      }

      return prev;
    });
  }, [clearSwitchTimer, commitTarget, getCurrentTarget]);

  const handleContainerLeave = useCallback(() => {
    clearSwitchTimer();
    setState((prev) => {
      // Don't collapse when comprehensive dashboard is showing
      if (prev.showComprehensive) return prev;
      return { ...prev, hoveredArc: null };
    });
    collapseTimerRef.current = setTimeout(() => {
      setState((prev) => {
        if (prev.showComprehensive) return prev;
        return { ...EMPTY_STATE, subArcMode: prev.subArcMode };
      });
      collapseTimerRef.current = null;
    }, COLLAPSE_DELAY);
  }, [clearSwitchTimer]);

  // Direct click → instant (bypasses all zones/timers)
  const activateArc = useCallback((arc: ArcPosition) => {
    clearCollapseTimer();
    clearSwitchTimer();
    setState((prev) => ({ ...EMPTY_STATE, subArcMode: prev.subArcMode, hoveredArc: arc, activeArc: arc }));
  }, [clearCollapseTimer, clearSwitchTimer]);

  const activateJunction = useCallback((id: JunctionId) => {
    clearCollapseTimer();
    clearSwitchTimer();
    setState((prev) => ({ ...EMPTY_STATE, subArcMode: prev.subArcMode, hoveredJunction: id, activeJunction: id }));
  }, [clearCollapseTimer, clearSwitchTimer]);

  const collapseArc = useCallback(() => {
    clearCollapseTimer();
    clearSwitchTimer();
    setState((prev) => ({ ...EMPTY_STATE, subArcMode: prev.subArcMode }));
  }, [clearCollapseTimer, clearSwitchTimer]);

  const scrollCard = useCallback((delta: number, maxIndex = 0) => {
    setState((prev) => {
      if (prev.activeArc === null) return prev;
      const next = Math.max(0, Math.min(maxIndex, prev.activeCardIndex + delta));
      if (next === prev.activeCardIndex) return prev;
      return { ...prev, activeCardIndex: next };
    });
  }, []);

  const scrollJunctionCard = useCallback((delta: number, maxIndex: number) => {
    setState((prev) => {
      if (prev.activeJunction === null) return prev;
      const next = Math.max(0, Math.min(maxIndex, prev.junctionCardIndex + delta));
      if (next === prev.junctionCardIndex) return prev;
      return { ...prev, junctionCardIndex: next };
    });
  }, []);

  const showDashboard = useCallback(() => {
    clearCollapseTimer();
    clearSwitchTimer();
    setState({ ...EMPTY_STATE, showComprehensive: true });
  }, [clearCollapseTimer, clearSwitchTimer]);

  const hideDashboard = useCallback(() => {
    clearSwitchTimer();
    setState({ ...EMPTY_STATE });
  }, [clearSwitchTimer]);

  // Called when mouse enters the card container — clears any pending
  // switch timers that might fire and steal focus from the card.
  const handleCardEnter = useCallback(() => {
    clearSwitchTimer();
    clearCollapseTimer();
  }, [clearSwitchTimer, clearCollapseTimer]);

  /** Enter sub-arc mode for a main arc (e.g. clicking FINANCE → 4 finance sub-arcs) */
  const enterSubArc = useCallback((mainArc: ArcPosition, targetSubArc?: ArcPosition) => {
    const configs = getSubArcConfigs(mainArc);
    if (!configs) return; // No sub-arcs defined for this arc
    clearCollapseTimer();
    clearSwitchTimer();
    // Land on targeted sub-arc if specified, otherwise first
    const landing = targetSubArc && configs.some((c) => c.position === targetSubArc)
      ? targetSubArc
      : configs[0].position;
    setState({ ...EMPTY_STATE, subArcMode: mainArc, hoveredArc: landing, activeArc: landing });
  }, [clearCollapseTimer, clearSwitchTimer]);

  /** Exit sub-arc mode back to main 4-arc view */
  const exitSubArc = useCallback(() => {
    clearCollapseTimer();
    clearSwitchTimer();
    setState({ ...EMPTY_STATE });
  }, [clearCollapseTimer, clearSwitchTimer]);

  return {
    ...state,
    updateHoverFromPosition,
    handleContainerLeave,
    handleCardEnter,
    activateArc,
    activateJunction,
    collapseArc,
    scrollCard,
    scrollJunctionCard,
    showDashboard,
    hideDashboard,
    enterSubArc,
    exitSubArc,
  };
}
