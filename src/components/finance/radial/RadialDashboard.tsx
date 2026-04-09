/**
 * RadialDashboard — App hub with 4 arcs: WEEK, MEALS, FINANCE, PANTRY.
 *
 * Hover arc → expand container (75vmin→90vmin) + card carousel in center.
 * Center click → comprehensive dashboard. Keyboard 1-4/WASD → instant expand.
 *
 * CRITICAL: Single-path click architecture — ALL clicks handled by container div.
 * SVG children (JunctionNode, ArcSegment) are purely visual (no onClick).
 * BackgroundLattice has pointerEvents:none, z-index:0.
 */

import { lazy, useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
// useQuery removed — coverage enrichment moved to MealsMainWidget
import { motion, AnimatePresence } from 'framer-motion';
import { useRadialNavigation } from './hooks/useRadialNavigation';
import { useReducedMotion } from './hooks/useReducedMotion';
// useWidgetData removed — all widgets are self-fetching
import { ArcSegment } from './ArcSegment';
// CenterLens removed — blue glow overlay obscured TPMS lattice
const BackgroundLattice = lazy(() => import('./BackgroundLattice').then(m => ({ default: m.BackgroundLattice })));
import { Carousel } from './Carousel';
import { LiveAnnotation } from './hub/LiveAnnotation';
import { ComprehensiveDashboard } from './dashboard/ComprehensiveDashboard';
import { RadialActionsProvider, type RadialActions } from './context/RadialActionsContext';
import { HintLayer } from './hints/HintLayer';

import { ARC_CONFIGS, getSubArcConfigs, JUNCTION_CONFIGS, getSubArcJunctionConfigs, VIEWBOX_SIZE, junctionPosition, type ArcPosition, type JunctionId } from './utils/arcGeometry';
import { JunctionNode } from './JunctionNode';
// JunctionCarousel merged into Carousel
import { JUNCTION_CARD_COUNT, type JunctionData } from './widgets/JunctionWidgets';
import type { JunctionAction } from '@/stores/types';
// WidgetData type removed
import { useAppStore } from '@/stores/appStore';

// Data hooks moved to ./hooks/useWidgetData.ts
// recipesApi removed — coverage enrichment moved to MealsMainWidget
import { useShoppingListWeek } from '@/hooks/useShoppingList';
import { useHabits } from '@/hooks/useHabits';
// useHealthScore removed — was only used by CenterLens (deleted)
import { announceToScreenReader } from '@/utils/accessibility';
import { getMonday, getTodayLocal } from '@/utils/dateUtils';
import { useRenderTier, TIER_MAX_STEPS } from '@/hooks/useRenderTier';

// View switching only through Settings — no close/exit button on radial
type RadialDashboardProps = Record<string, never>;

// Deterministic starfield — seeded LCG generates 120 fixed star positions
const NIGHT_SKY_STARS = (() => {
  const stars: string[] = [];
  let s = 42;
  const rng = () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 120; i++) {
    const x = rng() * 100;
    const y = rng() * 100;
    const o = 0.15 + rng() * 0.45;
    const sz = rng() > 0.88 ? 1.5 : 1;
    stars.push(`${x.toFixed(1)}vw ${y.toFixed(1)}vh 0px ${sz}px rgba(200,215,255,${o.toFixed(2)})`);
  }
  return stars.join(',');
})();


function useJunctionData(): JunctionData {
  const periodStart = getMonday();
  const { data: shoppingData } = useShoppingListWeek(periodStart);
  const { data: habitsData } = useHabits();

  return useMemo(() => {
    const shoppingItems = (shoppingData ?? []).map(
      (item: { id: number; name: string; is_checked: boolean }) => ({
        id: item.id,
        name: item.name,
        checked: item.is_checked,
      })
    );

    const habits = (habitsData ?? []).slice(0, 10).map(
      (h: { id: number; habit_name: string; current_streak: number; trend_score: number }) => ({
        id: h.id,
        habit_name: h.habit_name,
        current_streak: h.current_streak,
        trend_score: h.trend_score,
      })
    );

    return {
      shoppingItems,
      habits,
    };
  }, [shoppingData, habitsData]);
}


export function RadialDashboard(_?: RadialDashboardProps) {
  const reducedMotion = useReducedMotion();
  const renderTier = useRenderTier();
  const containerRef = useRef<HTMLDivElement>(null);
  // containerPx state removed — was only for CenterLens sizing

  const shoppingMode = useAppStore((s) => s.latticePrefs.shoppingMode);
  const nav = useRadialNavigation();

  // healthData removed — was only used by CenterLens (deleted)

  const rawJunctionData = useJunctionData();
  const junctionData = useMemo(() => ({
    ...rawJunctionData,
    onCloseReview: () => nav.collapseArc(),
  }), [rawJunctionData, nav]);

  // Recipe icon grid overlay state

  // Double-click tracking for south sub-arc → comprehensive dashboard
  const lastSouthClickRef = useRef<number>(0);

  const handleBrowseRecipes = useCallback(() => {
    nav.enterSubArc('east', 'east');
  }, [nav]);

  const enterCookingMode = useAppStore((s) => s.enterCookingMode);
  const handleStartCooking = useCallback((recipeId: number, mealId: number, mealType?: string) => {
    const todayStr = getTodayLocal();
    enterCookingMode(recipeId, mealId, { date: todayStr, mealType: (mealType || 'dinner') as 'breakfast' | 'lunch' | 'dinner' });
  }, [enterCookingMode]);

  const handleViewInventory = useCallback(() => {
    nav.enterSubArc('west');
  }, [nav]);

  const handleViewFinances = useCallback(() => {
    nav.enterSubArc('south');
  }, [nav]);

  const handleViewWeek = useCallback(() => {
    nav.enterSubArc('north');
  }, [nav]);

  const handleAddEvent = useCallback(() => {
    nav.enterSubArc('north');
  }, [nav]);

  const handleAddBill = useCallback(() => {
    nav.enterSubArc('south');
  }, [nav]);

  const handleAddMeal = useCallback(() => {
    nav.enterSubArc('east');
  }, [nav]);

  // RadialActionsContext — provides navigation to self-fetching widgets
  const radialActions = useMemo<RadialActions>(() => ({
    enterSubArc: nav.enterSubArc,
    viewWeek: handleViewWeek,
    viewFinances: handleViewFinances,
    viewInventory: handleViewInventory,
    browseRecipes: handleBrowseRecipes,
    startCooking: handleStartCooking,
    addEvent: handleAddEvent,
    addBill: handleAddBill,
    addMeal: handleAddMeal,
  }), [nav.enterSubArc, handleViewWeek, handleViewFinances, handleViewInventory, handleBrowseRecipes, handleStartCooking, handleAddEvent, handleAddBill, handleAddMeal]);

  // Mouse position ref for lattice shader (normalized to world-ish coords)
  const mouseRef = useRef({ x: 0, y: 0 });
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // Smooth depth-peel state (momentum + inertia)
  // Scroll controls how deep you see INTO the lattice, not its screen size
  const depthVelocity = useRef(0);
  const depthAnimFrame = useRef<number>(0);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Skip depth zoom when a card or junction is active — card handles its own scroll
    if (nav.activeArc || nav.activeJunction) return;

    // Accumulate velocity for momentum effect
    const delta = e.deltaY * 0.001;
    depthVelocity.current += delta;

    // Start momentum animation if not already running
    if (depthAnimFrame.current) return;

    let frameCount = 0;
    const animate = () => {
      frameCount++;
      const v = depthVelocity.current;
      // Safety: stop after 120 frames (2s at 60fps) or when velocity is negligible
      if (Math.abs(v) < 0.0005 || frameCount > 120) {
        depthVelocity.current = 0;
        depthAnimFrame.current = 0;
        return;
      }

      const prefs = useAppStore.getState().latticePrefs;
      const currentDepth = prefs.latticeDepth ?? 0.0;
      // Linear depth peel: scroll down = deeper into sphere, scroll up = back out
      const newDepth = Math.max(0.0, Math.min(0.7, currentDepth + v * 0.15));
      useAppStore.getState().setLatticePrefs({ latticeDepth: newDepth });

      // Friction: decay velocity smoothly
      depthVelocity.current *= 0.85;
      depthAnimFrame.current = requestAnimationFrame(animate);
    };

    depthAnimFrame.current = requestAnimationFrame(animate);
  }, [nav.activeArc, nav.activeJunction]);

  // Cleanup depth animation on unmount
  useEffect(() => () => {
    if (depthAnimFrame.current) cancelAnimationFrame(depthAnimFrame.current);
  }, []);

  // Drag-to-rotate: horizontal + vertical camera control
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragStartAngle = useRef(0);
  const dragStartTilt = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    isDragging.current = true;
    hasDragged.current = false; // Reset for this new click cycle
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    const prefs = useAppStore.getState().latticePrefs;
    dragStartAngle.current = 0;
    dragStartTilt.current = prefs.cameraTilt ?? 5;
    // Camera mode switch deferred to handleDragMove (after drag threshold)
    // to avoid re-render that kills click events between mousedown→click
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    // NOTE: Do NOT reset hasDragged here. Browser event order is
    // mousedown → mouseup → click. If we reset hasDragged in mouseup,
    // the click handler would never see it as true after a drag.
    // hasDragged is reset in mouseDown (start of next click cycle).
  }, []);

  const hasDragged = useRef(false);

  const handleDragMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    const dy = e.clientY - dragStartY.current;

    // Only start drag after >8px movement (prevents jitter from eating clicks)
    if (!hasDragged.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      hasDragged.current = true;
      // Switch camera mode on first real drag, not on mousedown
      // Drag-to-rotate: camera is always orbit mode now
    }

    const sensitivity = 360 / Math.max(window.innerWidth, 1);
    // Horizontal drag (azimuth) deferred — orbit speed handles rotation automatically
    const elevation = Math.max(-80, Math.min(80, dragStartTilt.current + dy * sensitivity * 0.5));
    useAppStore.getState().setLatticePrefs({
      cameraTilt: elevation,
    });
  }, []);

  // ResizeObserver removed — was only for CenterLens sizing

  const containerSize = 'min(100vw, 100vh)';
  // Lattice container matches SVG arc layer exactly — circular clip hides corners
  const latticeSize = containerSize;

  // Arc click handlers: varies by sub-arc mode
  const handleArcClick = useCallback((arc: ArcPosition) => {
    if (nav.subArcMode) {
      // Clicking same direction as the main arc that opened sub-arcs → comprehensive view
      if (arc === nav.subArcMode) {
        if (nav.subArcMode === 'north') {
          nav.exitSubArc();
          return;
        }
        // Finance arc: double-click south sub-arc → comprehensive dashboard
        if (nav.subArcMode === 'south') {
          const now = Date.now();
          if (now - lastSouthClickRef.current < 400) {
            lastSouthClickRef.current = 0;
            nav.showDashboard();
          } else {
            lastSouthClickRef.current = now;
          }
        }
        // Meals/inventory same-direction: no-op
        return;
      }
      // Otherwise activate the sub-arc (shows single card)
      nav.activateArc(arc);
      return;
    }
    // Main view: all 4 arcs → sub-arcs
    const SUB_ARC_ANNOUNCEMENTS: Record<ArcPosition, string> = {
      north: 'Entered week sub-categories: Summary, Events, Bills, Calendar',
      south: 'Entered finance sub-categories: Monitor, Budget, Goals, Capital',
      west: 'Entered inventory sub-categories: Inventory, Expiring, Stats, Custom',
      east: 'Entered meals sub-categories: Meals, Recipes, Favorites, Import',
    };
    nav.enterSubArc(arc);
    announceToScreenReader(SUB_ARC_ANNOUNCEMENTS[arc]);
  }, [nav]);

  // Junction click handler — store-driven dispatch
  const handleJunctionClick = useCallback((id: JunctionId) => {
    // Sub-arc junctions always activate as carousel (inline widgets)
    if (nav.subArcMode) {
      nav.activateJunction(id);
      return;
    }

    const prefs = useAppStore.getState().latticePrefs;
    const DEFAULT_ACTIONS: Record<JunctionId, JunctionAction> = {
      nw: 'shopping-list',
      ne: 'review-wizard',
      se: 'habits',
      sw: 'settings',
    };
    const action = prefs.junctionActions?.[id] ?? DEFAULT_ACTIONS[id];

    switch (action) {
      case 'shopping-list':
      case 'habits':
      case 'settings':
        nav.activateJunction(id);
        break;
      case 'dashboard':
        nav.showDashboard();
        break;
      case 'review-wizard':
        nav.activateJunction('ne');
        break;
      case 'week-view':
        // View switching only through Settings — no-op here
        break;
      case 'meals-view':
        // Future: no dedicated meals view yet — no-op
        break;
      case 'none':
        break;
    }
  }, [nav]);

  // Center lens — purely visual, no click handling (container handles all clicks)
  // centerLensSize removed — CenterLens deleted

  // Unified click handler — lives on the stable left panel div.
  // Computes position relative to containerRef (the radial circle), then
  // checks junctions, arc ring, and center area by normalized position.
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Skip if user was dragging (rotate gesture, not a click)
    if (hasDragged.current) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    const dist = Math.sqrt(nx * nx + ny * ny);

    // Check junctions first (small targets at diagonal corners on the ring)
    const JUNCTION_HIT = 0.28; // normalized hit radius
    const junctionConfigs = nav.subArcMode
      ? getSubArcJunctionConfigs(nav.subArcMode)
      : JUNCTION_CONFIGS;
    for (const config of junctionConfigs) {
      const pos = junctionPosition(config);
      const jnx = (pos.x / (VIEWBOX_SIZE / 2) - 1);
      const jny = (pos.y / (VIEWBOX_SIZE / 2) - 1);
      const jdist = Math.sqrt((nx - jnx) ** 2 + (ny - jny) ** 2);
      if (jdist < JUNCTION_HIT) {
        handleJunctionClick(config.id);
        return;
      }
    }

    // Arc ring zone
    if (dist >= 0.84 && dist <= 1.10) {
      const ax = Math.abs(nx);
      const ay = Math.abs(ny);
      let arc: ArcPosition | null = null;
      if (ay >= ax) arc = ny < 0 ? 'north' : 'south';
      else arc = nx > 0 ? 'east' : 'west';
      if (arc) {
        handleArcClick(arc);
        return;
      }
    }

    // Center area — no-op (dashboard access restricted to finance double-click)
  }, [handleArcClick, handleJunctionClick, nav]);


  // Right-click handler — go back one layer from any view
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (nav.showComprehensive) {
      nav.hideDashboard();
      announceToScreenReader('Returned to sub-arc navigation');
    } else if (nav.subArcMode) {
      nav.exitSubArc();
      announceToScreenReader('Returned to main navigation');
    } else if (nav.activeArc) {
      nav.collapseArc();
    }
  }, [nav]);

  // Keyboard navigation
  useEffect(() => {
    const keyMap: Record<string, ArcPosition> = {
      '1': 'north', w: 'north', W: 'north',
      '2': 'east', d: 'east', D: 'east',
      '3': 'south', s: 'south', S: 'south',
      '4': 'west', a: 'west', A: 'west',
    };

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Escape') {
        if (nav.showComprehensive) {
          nav.hideDashboard();
        } else if (nav.subArcMode && nav.activeArc) {
          // In sub-arc with card open → collapse card but stay in sub-arc
          nav.collapseArc();
        } else if (nav.subArcMode) {
          // In sub-arc without card → exit to main view
          nav.exitSubArc();
        } else if (nav.activeArc) {
          nav.collapseArc();
        }
        // At root level with nothing open: no-op (view changes only via Settings)
        return;
      }

      // Arrow keys scroll cards when active
      if (nav.activeArc) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          nav.scrollCard(-1);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          nav.scrollCard(1);
          return;
        }
      }

      // H key: snap camera home
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        useAppStore.getState().setLatticePrefs({
          cameraDistance: 2.6,
          cameraTilt: 15,
          latticeDepth: 0.0,
        });
        return;
      }

      const arc = keyMap[e.key];
      if (arc) {
        e.preventDefault();
        nav.activateArc(arc);
        announceToScreenReader(`${arc} section expanded`);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nav]);

  // Contextual hover stats for each arc position (from junction data which shares TanStack cache)
  const getArcHoverStat = useCallback((position: ArcPosition): string => {
    switch (position) {
      case 'north': return 'Week';
      case 'east': return 'Meals';
      case 'south': return 'Finances';
      case 'west': return 'Inventory';
    }
  }, []);

  // Auto-activate NW junction when shopping mode turns on
  useEffect(() => {
    if (shoppingMode && nav.activeJunction !== 'nw') {
      nav.activateJunction('nw');
    }
  }, [shoppingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wizard is active when NE junction is open (wizard is always the NE content)
  const wizardIsActive = nav.activeJunction === 'ne';

  // Determine view state
  const showRadial = !nav.showComprehensive;

  // Active arc configs — swap when in sub-arc mode
  const activeArcConfigs = nav.subArcMode ? (getSubArcConfigs(nav.subArcMode) ?? ARC_CONFIGS) : ARC_CONFIGS;


  return (
    <RadialActionsProvider value={radialActions}>
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: '#050810' }}
      role="navigation"
      aria-label="App hub with 4 sections: Weekview, Meals & Recipes, Financial, Inventory"
    >
      {/* Night sky starfield */}
      <div
        style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          boxShadow: NIGHT_SKY_STARS,
        }}
        aria-hidden="true"
      />
      {/* ── LEFT: Lattice Canvas ── */}
      <div
        ref={leftPanelRef}
        className="relative flex-1 flex items-center justify-center"
        style={{ flex: '1' }}
        onMouseMove={(e) => {
          // Normalize mouse relative to LEFT PANEL (not full window)
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2.0;
          const ny = -((e.clientY - rect.top) / rect.height - 0.5) * 2.0;
          mouseRef.current = { x: nx * 1.2, y: ny * 1.2 };
          // Drag-to-rotate
          handleDragMove(e);
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleContainerClick}
        onContextMenu={handleContextMenu}
      >
        {/* Lattice constrained to radial container size (not full viewport) */}
        <div
          className="absolute"
          style={{
            width: latticeSize,
            height: latticeSize,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {renderTier > 0 ? (
            <Suspense fallback={<div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl" />}>
              <BackgroundLattice
                reducedMotion={reducedMotion}
              />
            </Suspense>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl" />
          )}
        </div>


        {/* View switching only through Settings — no close button */}

        {/* Radial view */}
        <AnimatePresence mode="wait">
          {showRadial && (
            <motion.div
              key="radial"
              ref={containerRef}
              className="relative"
              style={{ width: containerSize, height: containerSize }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeInOut' }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                nav.updateHoverFromPosition(nx, ny);
              }}
              onMouseLeave={nav.handleContainerLeave}
            >
              {/* Background lattice now rendered at viewport level, not here */}

              {/* Live parameter change annotations — top-right overlay */}
              <LiveAnnotation />

              {/* Sub-arc mode breadcrumb — shows which domain we're in */}
              {nav.subArcMode && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[25] flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); nav.exitSubArc(); }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/50 text-xs text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors backdrop-blur-sm"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span style={{ fontFamily: "'Space Grotesk', system-ui" }}>{{ north: 'WEEK', south: 'FINANCE', west: 'INVENTORY', east: 'MEALS' }[nav.subArcMode]}</span>
                  </button>
                </div>
              )}

              {/* SVG layer — arcs */}
              <svg
                viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                className="absolute inset-0 w-full h-full"
                style={{ zIndex: 10, pointerEvents: 'none' }}
              >
                {(nav.subArcMode
                  ? getSubArcJunctionConfigs(nav.subArcMode)
                  : JUNCTION_CONFIGS
                ).map((config) => (
                  <JunctionNode
                    key={`junction-${nav.subArcMode ?? 'main'}-${config.id}`}
                    config={config}
                    isActive={nav.activeJunction === config.id}
                    reducedMotion={reducedMotion}
                    useConfigDirect={!!nav.subArcMode}
                  />
                ))}
                {activeArcConfigs.map((config) => (
                  <ArcSegment
                    key={`${nav.subArcMode ?? 'main'}-${config.position}`}
                    config={config}
                    isHovered={nav.hoveredArc === config.position}
                    isActive={nav.activeArc === config.position}
                    hoverStat={nav.hoveredArc === config.position && !nav.subArcMode ? getArcHoverStat(config.position) : undefined}
                    onClick={handleArcClick}
                    reducedMotion={reducedMotion}
                    useConfigDirect={!!nav.subArcMode}
                  />
                ))}
              </svg>

              {/* CenterLens removed — blue glow overlay obscured the TPMS lattice */}

              {/* Card carousel — arc OR junction (mutually exclusive) */}
              <AnimatePresence>
                {nav.activeArc && !nav.activeJunction && (
                  <motion.div
                    key={`carousel-${nav.activeArc}`}
                    className="absolute inset-0"
                    style={{ zIndex: 20 }}
                    initial={reducedMotion ? {} : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducedMotion ? {} : { opacity: 0, scale: 0.92 }}
                    transition={reducedMotion ? { duration: 0 } : {
                      duration: 0.25,
                      ease: [0.32, 0.72, 0, 1],
                    }}
                  >
                    <Carousel
                      type="arc"
                      arc={nav.activeArc}
                      activeIndex={nav.activeCardIndex}
                      onScrollCard={nav.scrollCard}
                      reducedMotion={reducedMotion}
                      onCardEnter={nav.handleCardEnter}
                      subArcMode={nav.subArcMode}
                    />
                  </motion.div>
                )}
                {nav.activeJunction && (
                  <motion.div
                    key={`junction-carousel-${nav.activeJunction}`}
                    className="absolute inset-0"
                    style={{ zIndex: 20 }}
                    initial={reducedMotion ? {} : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducedMotion ? {} : { opacity: 0, scale: 0.92 }}
                    transition={reducedMotion ? { duration: 0 } : {
                      duration: 0.25,
                      ease: [0.32, 0.72, 0, 1],
                    }}
                  >
                    <Carousel
                      type="junction"
                      junction={nav.activeJunction}
                      junctionData={junctionData}
                      activeIndex={nav.junctionCardIndex}
                      onScrollCard={nav.scrollJunctionCard}
                      reducedMotion={reducedMotion}
                      onCardEnter={nav.handleCardEnter}
                      hideHeader={wizardIsActive}
                      subArcMode={nav.subArcMode}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Comprehensive dashboard */}
        <AnimatePresence mode="wait">
          {nav.showComprehensive && (
            <motion.div
              key="comprehensive"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeInOut' }}
            >
              <ComprehensiveDashboard
                onBack={nav.hideDashboard}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contextual hints — bottom-center overlay (z-60) */}
        <HintLayer context="radial-root" />

      </div>

    </div>
    </RadialActionsProvider>
  );
}
